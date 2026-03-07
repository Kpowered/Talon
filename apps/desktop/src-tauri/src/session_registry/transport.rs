fn strip_terminal_control_sequences(line: &str) -> String {
    let mut sanitized = String::with_capacity(line.len());
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '\x1b' {
            sanitized.push(ch);
            continue;
        }

        match chars.peek().copied() {
            Some('[') => {
                chars.next();
                while let Some(next) = chars.next() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
            }
            Some(']') => {
                chars.next();
                while let Some(next) = chars.next() {
                    if next == '\u{0007}' {
                        break;
                    }
                    if next == '\x1b' && matches!(chars.peek().copied(), Some('\\')) {
                        chars.next();
                        break;
                    }
                }
            }
            Some(_) => {
                chars.next();
            }
            None => break,
        }
    }

    sanitized
}

fn promote_session_connected(state: &mut SessionRegistry, session_id: &str) {
    let already_connected = state
        .managed_sessions
        .iter()
        .find(|session| session.id == session_id)
        .map(|session| session.state == "connected")
        .unwrap_or(false);
    if already_connected {
        return;
    }

    let latency_ms = capture_connect_latency_ms(state, session_id);
    update_session_state(state, session_id, "connected");
    update_host_observed_for_session(state, session_id, Some("healthy"), true);
    clear_connection_issue(state, session_id);
    push_event(
        state,
        session_id,
        "shell-ready",
        "Remote shell produced live output. Session promoted to connected.".into(),
    );
    push_terminal_line(
        state,
        session_id,
        format!(
            "Connected. Remote shell is live{}",
            latency_ms
                .map(|value| format!(" ({} ms)", value))
                .unwrap_or_default()
        ),
    );
}
fn should_suppress_managed_shell_echo(state: &SessionRegistry, session_id: &str, line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.contains("talon_done=0")
        || trimmed.contains("talon_exit=$?")
        || trimmed.contains("talon_cwd=$(pwd)")
        || trimmed.contains("trap - INT")
        || trimmed.contains("talon_exit=130")
        || trimmed.contains(CMD_START_PREFIX)
        || trimmed.contains(CMD_END_PREFIX)
        || trimmed.contains("if [ \"$talon_done\" -eq 0 ]")
    {
        return true;
    }

    state
        .active_commands
        .get(session_id)
        .map(|command| {
            trimmed.ends_with(&command.command)
                && (trimmed.contains("# ") || trimmed.contains("$ "))
        })
        .unwrap_or(false)
}
fn start_stdout_reader(session_id: String, stdout: ChildStdout) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let raw_line = line.trim_end_matches(['\r', '\n']).to_string();
                    let line = strip_terminal_control_sequences(&raw_line);
                    if line.trim().is_empty() {
                        if raw_line.is_empty() {
                            let mut state = lock_registry();
                            push_terminal_line(&mut state, &session_id, String::new());
                        }
                        continue;
                    }

                    let mut state = lock_registry();
                    if let Some(marker_index) = line.find(META_SHELL_PREFIX) {
                        let shell = &line[(marker_index + META_SHELL_PREFIX.len())..];
                        update_session_metadata(&mut state, &session_id, Some(shell.trim()), None);
                        continue;
                    }

                    if let Some(marker_index) = line.find(META_CWD_PREFIX) {
                        let cwd = &line[(marker_index + META_CWD_PREFIX.len())..];
                        let cwd = cwd.trim();
                        update_session_metadata(&mut state, &session_id, None, Some(cwd));
                        promote_session_connected(&mut state, &session_id);
                        push_event(
                            &mut state,
                            &session_id,
                            "shell-cwd",
                            format!("Remote shell reported cwd {}", cwd),
                        );
                        push_terminal_line(
                            &mut state,
                            &session_id,
                            format!("Remote shell ready in {}", cwd),
                        );
                        continue;
                    }

                    if let Some(marker_index) = line.find(CMD_START_PREFIX) {
                        let command_id = &line[(marker_index + CMD_START_PREFIX.len())..];
                        push_event(
                            &mut state,
                            &session_id,
                            "command-start",
                            format!("Remote shell started {}", command_id.trim()),
                        );
                        continue;
                    }

                    if let Some((command_id, exit_code, cwd)) = parse_command_end(&line) {
                        complete_active_command(&mut state, &session_id, &command_id, exit_code, cwd.trim());
                        continue;
                    }

                    if should_suppress_managed_shell_echo(&state, &session_id, &line) {
                        continue;
                    }

                    promote_session_connected(&mut state, &session_id);
                    push_terminal_line(&mut state, &session_id, line.clone());
                    capture_stream_line(&mut state, &session_id, "stdout", &line);
                    capture_command_stream_line(&mut state, &session_id, "stdout", &line);
                    push_event(&mut state, &session_id, "stdout", line);
                }
                Err(error) => {
                    let mut state = lock_registry();
                    update_session_state(&mut state, &session_id, "degraded");
                    push_event(
                        &mut state,
                        &session_id,
                        "stream-error",
                        format!("stdout reader failed: {}", error),
                    );
                    break;
                }
            }
        }
    });
}

fn start_stderr_reader(session_id: String, host: Host, stderr: ChildStderr) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let raw_line = line.trim_end_matches(['\r', '\n']).to_string();
                    let line = strip_terminal_control_sequences(&raw_line);
                    if line.trim().is_empty() {
                        if raw_line.is_empty() {
                            let mut state = lock_registry();
                            push_terminal_line(&mut state, &session_id, String::new());
                        }
                        continue;
                    }
                    let mut state = lock_registry();
                    push_terminal_line(&mut state, &session_id, format!("stderr: {}", line));
                    capture_stream_line(&mut state, &session_id, "stderr", &line);
                    capture_command_stream_line(&mut state, &session_id, "stderr", &line);
                    if let Some((kind, title, summary, operator_action, suggested_command)) =
                        classify_connection_issue(&host, &line)
                    {
                        let observed_status = if kind == "auth" || kind == "host-trust" {
                            "warning"
                        } else {
                            "critical"
                        };
                        update_host_observed_for_session(&mut state, &session_id, Some(observed_status), true);
                        set_connection_issue(
                            &mut state,
                            &session_id,
                            &kind,
                            &title,
                            summary,
                            &operator_action,
                            suggested_command,
                        );
                    }
                    push_event(&mut state, &session_id, "stderr", line);
                }
                Err(error) => {
                    let mut state = lock_registry();
                    push_event(
                        &mut state,
                        &session_id,
                        "stream-error",
                        format!("stderr reader failed: {}", error),
                    );
                    break;
                }
            }
        }
    });
}

fn launch_runtime(
    session_id: String,
    host: Host,
    config: HostConnectionConfig,
    password: Option<&str>,
) -> Result<SessionRuntimeHandle, String> {
    let (username, hostname) = parse_host_target(&host, Some(&config));
    let mut command = Command::new("ssh");

    command
        .arg("-tt")
        .arg("-o")
        .arg("StrictHostKeyChecking=yes")
        .arg("-o")
        .arg(format!("ConnectTimeout={}", CONNECT_TIMEOUT_SECONDS))
        .arg("-p")
        .arg(config.port.to_string())
        .arg(format!("{}@{}", username, hostname))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut askpass_path = None;

    if config.auth_method == "private-key" {
        command.arg("-o").arg("BatchMode=yes");
        let key_path = resolve_private_key_path(&host.id)
            .ok_or_else(|| format!("No SSH private key found for host {}", host.id))?;
        command.arg("-i").arg(key_path);
    }

    if config.auth_method == "password" {
        let password = password
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "Password authentication requires an operator-provided password.".to_string())?;
        let helper_path = create_askpass_helper(&session_id)?;
        command
            .arg("-o")
            .arg("BatchMode=no")
            .arg("-o")
            .arg("PubkeyAuthentication=no")
            .arg("-o")
            .arg("PreferredAuthentications=password")
            .arg("-o")
            .arg("NumberOfPasswordPrompts=1")
            .env("SSH_ASKPASS", &helper_path)
            .env("SSH_ASKPASS_REQUIRE", "force")
            .env("DISPLAY", "talon")
            .env("TALON_SSH_PASSWORD", password);
        askpass_path = Some(helper_path);
    } else {
        command.arg("-o").arg("BatchMode=yes");
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let pid = child.id();
    let stdin = child.stdin.take().ok_or_else(|| "failed to open ssh stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "failed to open ssh stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "failed to open ssh stderr".to_string())?;
    let stdin = Arc::new(Mutex::new(stdin));

    start_stdout_reader(session_id.clone(), stdout);
    start_stderr_reader(session_id.clone(), host.clone(), stderr);

    let waited_pid = pid;
    let waited_askpass_path = askpass_path.clone();
    thread::spawn(move || match child.wait() {
        Ok(status) => {
            let mut state = lock_registry();
            let is_current_runtime = state
                .runtimes
                .get(&session_id)
                .map(|runtime| runtime.pid == waited_pid)
                .unwrap_or(false);
            if is_current_runtime {
                update_session_state(&mut state, &session_id, "disconnected");
                update_host_observed_for_session(&mut state, &session_id, Some("warning"), true);
                state.runtimes.remove(&session_id);
                push_event(
                    &mut state,
                    &session_id,
                    "disconnected",
                    format!("ssh process exited with status {}", status),
                );
                push_terminal_line(
                    &mut state,
                    &session_id,
                    format!("SSH session closed with status {}", status),
                );
            }
            drop(state);
            if let Some(path) = waited_askpass_path {
                let _ = fs::remove_file(path);
            }
        }
        Err(error) => {
            let mut state = lock_registry();
            let is_current_runtime = state
                .runtimes
                .get(&session_id)
                .map(|runtime| runtime.pid == waited_pid)
                .unwrap_or(false);
            if is_current_runtime {
                update_session_state(&mut state, &session_id, "degraded");
                state.runtimes.remove(&session_id);
                push_event(
                    &mut state,
                    &session_id,
                    "disconnected",
                    format!("ssh process wait failed: {}", error),
                );
                push_terminal_line(
                    &mut state,
                    &session_id,
                    format!("SSH session wait failed: {}", error),
                );
            }
            drop(state);
            if let Some(path) = waited_askpass_path {
                let _ = fs::remove_file(path);
            }
        }
    });

    Ok(SessionRuntimeHandle {
        stdin,
        pid,
        askpass_path,
        started_at: Instant::now(),
    })
}

pub fn connect_host(host: &Host, config: Option<&HostConnectionConfig>, password: Option<&str>) -> ManagedSessionRecord {
    let host_config = config.cloned().unwrap_or(HostConnectionConfig {
        host_id: host.id.clone(),
        port: 22,
        username: "root".into(),
        auth_method: "agent".into(),
        fingerprint_hint: "unknown".into(),
        private_key_path: None,
        has_saved_password: false,
    });

    let session_id = format!("session-{}", host.id);
    let now = now_iso();
    let record = ManagedSessionRecord {
        id: session_id.clone(),
        host_id: host.id.clone(),
        state: "connecting".into(),
        shell: "sh".into(),
        cwd: "~".into(),
        connected_at: now.clone(),
        last_command_at: now,
        auto_capture_enabled: true,
    };

    {
        let mut registry = lock_registry();
        registry.managed_sessions.retain(|session| session.host_id != host.id);
        registry.runtimes.remove(&session_id);
        registry.managed_sessions.insert(0, record.clone());
        registry.active_session_id = record.id.clone();
        registry.terminal_buffers.insert(
            record.id.clone(),
            vec![
                format!("Opening SSH transport to {}", host.config.address),
                format!(
                    "Auth: {} on port {} with strict host key checking",
                    host_config.auth_method, host_config.port
                ),
            ],
        );
        push_event(
            &mut registry,
            &record.id,
            "connecting",
            format!("Launching ssh.exe for {}", host.config.address),
        );
    }

    match launch_runtime(record.id.clone(), host.clone(), host_config, password) {
        Ok(runtime) => {
            let mut registry = lock_registry();
            registry.runtimes.insert(record.id.clone(), runtime);
            push_event(
                &mut registry,
                &record.id,
                "transport-ready",
                "ssh.exe process started. Waiting for remote shell output.".into(),
            );
            push_terminal_line(
                &mut registry,
                &record.id,
                "SSH transport connected. Waiting for remote shell output...".into(),
            );
        }
        Err(error) => {
            let mut registry = lock_registry();
            update_session_state(&mut registry, &record.id, "disconnected");
            let (kind, title, summary, operator_action, suggested_command) =
                classify_local_connection_error(host, &error);
            let observed_status = if kind == "auth" || kind == "host-trust" {
                "warning"
            } else {
                "critical"
            };
            update_host_observed(&mut registry, &host.id, Some(observed_status), Some(&now_iso()), None);
            set_connection_issue(
                &mut registry,
                &record.id,
                &kind,
                &title,
                summary,
                &operator_action,
                suggested_command,
            );
            push_terminal_line(&mut registry, &record.id, format!("Connection failed: {}", error));
            push_event(&mut registry, &record.id, "connection-error", error);
        }
    }

    lock_registry()
        .managed_sessions
        .iter()
        .find(|session| session.id == record.id)
        .cloned()
        .unwrap_or(record)
}

pub fn submit_command(session_id: &str, command: &str) -> TerminalSnapshot {
    let trimmed = command.trim();

    {
        let mut registry = lock_registry();
        if registry.active_commands.contains_key(session_id) {
            push_terminal_line(
                &mut registry,
                session_id,
                "Command rejected: another command is still running in this session.".into(),
            );
            push_event(
                &mut registry,
                session_id,
                "command-rejected",
                "Command rejected because another wrapped command is still in flight.".into(),
            );
            return terminal_snapshot(session_id);
        }
    }

    let stdin = {
        let mut registry = lock_registry();
        let command_id = next_command_id(&mut registry, session_id);
        let started_at = now_iso();
        registry.active_commands.insert(
            session_id.into(),
            ActiveCommandState {
                id: command_id.clone(),
                command: trimmed.into(),
                started_at,
                stdout_tail: Vec::new(),
                stderr_tail: Vec::new(),
            },
        );
        push_event(
            &mut registry,
            session_id,
            "command-submitted",
            format!("Queued command {}: {}", command_id, trimmed),
        );
        push_terminal_line(&mut registry, session_id, format!("$ {}", trimmed));

        if let Some(session) = registry.managed_sessions.iter_mut().find(|session| session.id == session_id) {
            session.last_command_at = now_iso();
        }

        registry
            .runtimes
            .get(session_id)
            .map(|runtime| (runtime.stdin.clone(), command_id))
    };

    if let Some((stdin, command_id)) = stdin {
        let mut guard = lock_stdin(&stdin);
        let wrapped_command = build_wrapped_command(&command_id, trimmed);
        let write_result = guard.write_all(wrapped_command.as_bytes()).and_then(|_| guard.flush());

        if let Err(error) = write_result {
            let mut registry = lock_registry();
            registry.active_commands.remove(session_id);
            push_terminal_line(
                &mut registry,
                session_id,
                format!("Command dispatch failed: {}", error),
            );
            push_event(
                &mut registry,
                session_id,
                "command-error",
                format!("Failed to write to remote shell: {}", error),
            );
        }
    } else {
        let mut registry = lock_registry();
        push_terminal_line(
            &mut registry,
            session_id,
            "Command rejected: no active SSH transport for this session.".into(),
        );
        push_event(
            &mut registry,
            session_id,
            "command-error",
            "No active SSH transport for this session.".into(),
        );
    }

    terminal_snapshot(session_id)
}

fn build_wrapped_command(command_id: &str, command: &str) -> String {
    format!(
        r#"talon_done=0
trap 'if [ "$talon_done" -eq 0 ]; then talon_done=1; talon_exit=130; talon_cwd=$(pwd); printf '{end}{id}__%s__%s\n' "$talon_exit" "$talon_cwd"; fi' INT
printf '{start}{id}\n'
{command}
talon_exit=$?
if [ "$talon_done" -eq 0 ]; then talon_done=1; talon_cwd=$(pwd); printf '{end}{id}__%s__%s\n' "$talon_exit" "$talon_cwd"; fi
trap - INT
"#,
        start = CMD_START_PREFIX,
        end = CMD_END_PREFIX,
        id = command_id,
        command = command
    )
}


pub fn interrupt_active_command(session_id: &str) -> bool {
    let mut registry = lock_registry();
    let Some(command_id) = registry
        .active_commands
        .get(session_id)
        .map(|command| command.id.clone())
    else {
        return false;
    };
    let cwd = registry
        .managed_sessions
        .iter()
        .find(|session| session.id == session_id)
        .map(|session| session.cwd.clone())
        .unwrap_or_else(|| "~".into());

    complete_active_command(&mut registry, session_id, &command_id, 130, &cwd);
    push_event(
        &mut registry,
        session_id,
        "command-interrupted",
        format!("{} interrupted by operator", command_id),
    );
    true
}
pub fn write_input(session_id: &str, data: &str) -> Result<(), String> {
    let stdin = {
        let registry = lock_registry();
        registry.runtimes.get(session_id).map(|runtime| runtime.stdin.clone())
    };

    let Some(stdin) = stdin else {
        return Err("No active SSH transport for this session.".into());
    };

    let mut guard = lock_stdin(&stdin);
    guard.write_all(data.as_bytes()).and_then(|_| guard.flush()).map_err(|error| {
        format!("Failed to write raw input to remote shell: {}", error)
    })
}

pub fn disconnect_session(session_id: &str) -> TerminalSnapshot {
    let pid = {
        let mut registry = lock_registry();
        registry.active_commands.remove(session_id);
        let pid = registry.runtimes.get(session_id).map(|runtime| runtime.pid);
        update_host_observed_for_session(&mut registry, session_id, Some("warning"), true);
        push_event(
            &mut registry,
            session_id,
            "disconnecting",
            "Operator requested session disconnect.".into(),
        );
        push_terminal_line(&mut registry, session_id, "Disconnecting SSH transport...".into());
        pid
    };

    match pid {
        Some(pid) => {
            let result = Command::new("taskkill")
                .arg("/PID")
                .arg(pid.to_string())
                .arg("/T")
                .arg("/F")
                .output();

            if let Err(error) = result {
                let mut registry = lock_registry();
                push_terminal_line(
                    &mut registry,
                    session_id,
                    format!("Disconnect failed: {}", error),
                );
                push_event(
                    &mut registry,
                    session_id,
                    "disconnect-error",
                    format!("Failed to stop ssh pid {}: {}", pid, error),
                );
            }
        }
        None => {
            let mut registry = lock_registry();
            update_session_state(&mut registry, session_id, "disconnected");
            update_host_observed_for_session(&mut registry, session_id, Some("warning"), true);
            push_event(
                &mut registry,
                session_id,
                "disconnect-error",
                "No active SSH transport for this session.".into(),
            );
        }
    }

    terminal_snapshot(session_id)
}


#[cfg(test)]
mod transport_tests {
    use super::{
        build_wrapped_command, complete_active_command, now_iso, parse_command_end, ActiveCommandState, CommandHistoryEntry,
        Host, HostObservedState, HostRecordConfig, ManagedSessionRecord, SessionRegistry,
    };
    use std::collections::HashMap;

    fn test_registry() -> SessionRegistry {
        SessionRegistry {
            hosts: vec![Host {
                id: "host-1".into(),
                config: HostRecordConfig {
                    label: "prod-1".into(),
                    address: "root@127.0.0.1".into(),
                    region: "test".into(),
                    tags: vec!["test".into()],
                },
                observed: HostObservedState {
                    status: "warning".into(),
                    latency_ms: 0,
                    cpu_percent: 0,
                    memory_percent: 0,
                    last_seen_at: now_iso(),
                },
            }],
            host_configs: Vec::new(),
            managed_sessions: vec![ManagedSessionRecord {
                id: "session-1".into(),
                host_id: "host-1".into(),
                state: "connected".into(),
                shell: "/bin/bash".into(),
                cwd: "/root".into(),
                connected_at: now_iso(),
                last_command_at: now_iso(),
                auto_capture_enabled: true,
            }],
            active_session_id: "session-1".into(),
            recent_events: Vec::new(),
            terminal_buffers: HashMap::new(),
            stream_state: HashMap::new(),
            connection_issues: HashMap::new(),
            latest_failures: HashMap::new(),
            active_commands: HashMap::new(),
            command_history: Vec::<CommandHistoryEntry>::new(),
            runtimes: HashMap::new(),
            diagnosis_cache: HashMap::new(),
            event_counter: 0,
            command_counter: 0,
        }
    }

    #[test]
    fn parses_command_end_markers() {
        let parsed = parse_command_end("__TALON_CMD_END__cmd-7__127__/srv/app").expect("marker should parse");
        assert_eq!(parsed.0, "cmd-7");
        assert_eq!(parsed.1, 127);
        assert_eq!(parsed.2, "/srv/app");
    }    #[test]
    fn builds_interrupt_safe_wrapped_command() {
        let wrapped = build_wrapped_command("cmd-7", "sleep 30");
        assert!(wrapped.contains("trap 'if [ \"$talon_done\" -eq 0 ]"));
        assert!(wrapped.contains("__TALON_CMD_END__cmd-7__%s__%s"));
        assert!(wrapped.contains("talon_exit=130"));
    }

    #[test]
    fn captures_failure_context_for_non_zero_command_completion() {
        let mut registry = test_registry();
        registry.active_commands.insert(
            "session-1".into(),
            ActiveCommandState {
                id: "cmd-1".into(),
                command: "false".into(),
                started_at: now_iso(),
                stdout_tail: vec!["before".into()],
                stderr_tail: vec!["permission denied".into()],
            },
        );

        complete_active_command(&mut registry, "session-1", "cmd-1", 1, "/root");

        let failure = registry.latest_failures.get("session-1").expect("failure should be captured");
        assert_eq!(failure.exit_code, 1);
        assert_eq!(failure.command_id, "cmd-1");
        assert_eq!(failure.cwd, "/root");
        assert_eq!(registry.command_history[0].command, "false");
    }
}











