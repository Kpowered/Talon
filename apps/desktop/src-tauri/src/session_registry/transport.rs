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

fn extract_prefixed_metadata_value<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let trimmed = line.trim_start();
    trimmed
        .strip_prefix(prefix)
        .map(str::trim)
        .filter(|value| !value.is_empty())
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

fn mark_session_degraded(
    state: &mut SessionRegistry,
    session_id: &str,
    disconnect_cause: &str,
    title: &str,
    summary: String,
    event_type: &str,
    event_detail: String,
    terminal_line: String,
) {
    update_session_state(state, session_id, "degraded");
    update_host_observed_for_session(state, session_id, Some("critical"), true);
    state.active_commands.remove(session_id);
    state.runtimes.remove(session_id);
    state.connection_issues.insert(
        session_id.into(),
        SessionConnectionIssue {
            session_id: session_id.into(),
            kind: "transport".into(),
            title: title.into(),
            summary,
            operator_action: "Inspect the terminal tail, confirm the remote host is still reachable, and reconnect explicitly when ready.".into(),
            suggested_command: "Reconnect".into(),
            observed_at: now_iso(),
            fingerprint: None,
            expected_fingerprint_hint: None,
            host: None,
            port: None,
            can_trust_in_app: false,
            in_app_action_kind: None,
            in_app_action_label: Some("Reconnect".into()),
            disconnect_cause: Some(disconnect_cause.into()),
        },
    );
    push_event(state, session_id, event_type, event_detail);
    push_terminal_line(state, session_id, terminal_line);
}

fn mark_remote_exit(state: &mut SessionRegistry, session_id: &str, status: String) {
    update_session_state(state, session_id, "disconnected");
    update_host_observed_for_session(state, session_id, Some("warning"), true);
    state.active_commands.remove(session_id);
    state.runtimes.remove(session_id);
    state.connection_issues.insert(
        session_id.into(),
        SessionConnectionIssue {
            session_id: session_id.into(),
            kind: "transport".into(),
            title: "Remote shell exited".into(),
            summary: format!("The remote shell exited and the SSH transport closed with status {}.", status),
            operator_action: "Reconnect when you want to reopen the shell. Review the terminal tail first if the exit was unexpected.".into(),
            suggested_command: "Reconnect".into(),
            observed_at: now_iso(),
            fingerprint: None,
            expected_fingerprint_hint: None,
            host: None,
            port: None,
            can_trust_in_app: false,
            in_app_action_kind: None,
            in_app_action_label: Some("Reconnect".into()),
            disconnect_cause: Some("remote-exit".into()),
        },
    );
    push_event(
        state,
        session_id,
        "disconnected",
        format!("Remote shell exited with status {}", status),
    );
    push_terminal_line(
        state,
        session_id,
        format!("Remote shell exited with status {}", status),
    );
}

fn terminal_snapshot_locked(state: &SessionRegistry, session_id: &str) -> TerminalSnapshot {
    let lines = state
        .terminal_buffers
        .get(session_id)
        .cloned()
        .or_else(|| state.terminal_buffers.get(&state.active_session_id).cloned())
        .unwrap_or_default();

    TerminalSnapshot {
        session_id: session_id.into(),
        lines,
    }
}

fn mark_operator_disconnect(state: &mut SessionRegistry, session_id: &str, status: String) {
    update_session_state(state, session_id, "disconnected");
    update_host_observed_for_session(state, session_id, Some("warning"), true);
    state.active_commands.remove(session_id);
    state.runtimes.remove(session_id);
    clear_connection_issue(state, session_id);
    push_event(
        state,
        session_id,
        "disconnected",
        format!("Operator disconnect completed with ssh status {}", status),
    );
    push_terminal_line(
        state,
        session_id,
        format!("SSH session closed after operator disconnect ({})", status),
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
        || trimmed.contains("printf '__TALON_META_SHELL__%s")
        || trimmed.contains("pwd | sed 's#^#__TALON_META_CWD__#'")
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

fn schedule_session_metadata_probe(stdin: Arc<Mutex<ChildStdin>>) {
    thread::spawn(move || {
        thread::sleep(std::time::Duration::from_millis(180));
        let probe = format!(
            "printf '{shell_prefix}%s\\n' \"${{SHELL:-sh}}\"\npwd | sed 's#^#{cwd_prefix}#'\n",
            shell_prefix = META_SHELL_PREFIX,
            cwd_prefix = META_CWD_PREFIX,
        );
        if let Ok(mut guard) = stdin.lock() {
            let _ = guard.write_all(probe.as_bytes());
            let _ = guard.flush();
        }
    });
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
                    if let Some(shell) = extract_prefixed_metadata_value(&line, META_SHELL_PREFIX) {
                        update_session_metadata(&mut state, &session_id, Some(shell), None);
                        continue;
                    }

                    if let Some(cwd) = extract_prefixed_metadata_value(&line, META_CWD_PREFIX) {
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

                    if let Some((command_id, exit_code, cwd, shell)) = parse_command_end(&line) {
                        complete_active_command(&mut state, &session_id, &command_id, exit_code, cwd.trim(), shell.as_deref());
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
                    mark_session_degraded(
                        &mut state,
                        &session_id,
                        "stream-failure",
                        "SSH stdout stream failed",
                        format!("The stdout reader failed for the managed SSH session: {}", error),
                        "stream-error",
                        format!("stdout reader failed: {}", error),
                        format!("SSH stdout stream failed: {}", error),
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
                    mark_session_degraded(
                        &mut state,
                        &session_id,
                        "stream-failure",
                        "SSH stderr stream failed",
                        format!("The stderr reader failed for the managed SSH session: {}", error),
                        "stream-error",
                        format!("stderr reader failed: {}", error),
                        format!("SSH stderr stream failed: {}", error),
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
                let operator_requested = state
                    .recent_events
                    .iter()
                    .any(|event| event.session_id == session_id && event.event_type == "disconnecting");
                let status_text = status.to_string();
                if operator_requested {
                    mark_operator_disconnect(&mut state, &session_id, status_text);
                } else if status.success() {
                    mark_remote_exit(&mut state, &session_id, status_text);
                } else {
                    mark_session_degraded(
                        &mut state,
                        &session_id,
                        "transport-drop",
                        "SSH transport dropped",
                        format!("The SSH transport exited unexpectedly with status {}.", status),
                        "transport-drop",
                        format!("ssh process exited unexpectedly with status {}", status),
                        format!("SSH transport dropped with status {}", status),
                    );
                }
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
                mark_session_degraded(
                    &mut state,
                    &session_id,
                    "transport-drop",
                    "SSH transport wait failed",
                    format!("Waiting for the SSH transport failed: {}", error),
                    "transport-drop",
                    format!("ssh process wait failed: {}", error),
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
    connect_host_with_state(
        host,
        config,
        password,
        "connecting",
        "Opening SSH transport to",
        "connecting",
        format!("Launching ssh.exe for {}", host.config.address),
    )
}

pub fn reconnect_host(host: &Host, config: Option<&HostConnectionConfig>, password: Option<&str>) -> ManagedSessionRecord {
    connect_host_with_state(
        host,
        config,
        password,
        "reconnecting",
        "Reopening SSH transport to",
        "reconnecting",
        format!("Re-launching ssh.exe for {}", host.config.address),
    )
}

fn prime_connection_attempt(
    host: &Host,
    host_config: &HostConnectionConfig,
    initial_state: &str,
    opening_line: &str,
    event_kind: &str,
    event_detail: String,
) -> ManagedSessionRecord {
    let session_id = format!("session-{}", host.id);
    let now = now_iso();
    let record = ManagedSessionRecord {
        id: session_id.clone(),
        host_id: host.id.clone(),
        state: initial_state.into(),
        mode: "managed".into(),
        shell: "sh".into(),
        cwd: "~".into(),
        connected_at: now.clone(),
        last_command_at: now,
        auto_capture_enabled: true,
    };

    let mut registry = lock_registry();
    registry.managed_sessions.retain(|session| session.host_id != host.id);
    registry.runtimes.remove(&session_id);
    registry.managed_sessions.insert(0, record.clone());
    registry.active_session_id = record.id.clone();
    registry.terminal_buffers.insert(
        record.id.clone(),
        vec![
            format!("{} {}", opening_line, host.config.address),
            format!(
                "Auth: {} on port {} with strict host key checking",
                host_config.auth_method, host_config.port
            ),
        ],
    );
    push_event(
        &mut registry,
        &record.id,
        event_kind,
        event_detail,
    );
    record
}

fn connect_host_with_state(
    host: &Host,
    config: Option<&HostConnectionConfig>,
    password: Option<&str>,
    initial_state: &str,
    opening_line: &str,
    event_kind: &str,
    event_detail: String,
) -> ManagedSessionRecord {
    let host_config = config.cloned().unwrap_or(HostConnectionConfig {
        host_id: host.id.clone(),
        port: 22,
        username: "root".into(),
        auth_method: "agent".into(),
        fingerprint_hint: "unknown".into(),
        private_key_path: None,
        has_saved_password: false,
    });

    let record = prime_connection_attempt(
        host,
        &host_config,
        initial_state,
        opening_line,
        event_kind,
        event_detail,
    );

    match launch_runtime(record.id.clone(), host.clone(), host_config, password) {
        Ok(runtime) => {
            let stdin = runtime.stdin.clone();
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
                if record.state == "reconnecting" {
                    "SSH transport reconnected. Waiting for remote shell output...".into()
                } else {
                    "SSH transport connected. Waiting for remote shell output...".into()
                },
            );
            drop(registry);
            schedule_session_metadata_probe(stdin);
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
        let Some(session) = registry
            .managed_sessions
            .iter()
            .find(|session| session.id == session_id)
            .cloned()
        else {
            push_terminal_line(
                &mut registry,
                session_id,
                "Command rejected: session not found.".into(),
            );
            push_event(
                &mut registry,
                session_id,
                "command-rejected",
                "Command rejected because the session no longer exists.".into(),
            );
            return terminal_snapshot_locked(&registry, session_id);
        };

        if session.mode == "raw" {
            push_terminal_line(
                &mut registry,
                session_id,
                "Command rejected: managed command submission is disabled while raw mode is active.".into(),
            );
            push_event(
                &mut registry,
                session_id,
                "command-rejected",
                "Command rejected because the session is in raw mode.".into(),
            );
            return terminal_snapshot_locked(&registry, session_id);
        }

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
            return terminal_snapshot_locked(&registry, session_id);
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
            mark_session_degraded(
                &mut registry,
                session_id,
                "command-dispatch-failure",
                "Managed command dispatch failed",
                format!("Talon could not write the wrapped managed command into the SSH transport: {}", error),
                "command-error",
                format!("Failed to write to remote shell: {}", error),
                format!("Command dispatch failed: {}", error),
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
trap 'if [ "$talon_done" -eq 0 ]; then talon_done=1; talon_exit=130; talon_cwd=$(pwd); talon_shell=${{SHELL:-sh}}; printf '{end}{id}__%s__%s__%s\n' "$talon_exit" "$talon_cwd" "$talon_shell"; fi' INT
printf '{start}{id}\n'
{command}
talon_exit=$?
if [ "$talon_done" -eq 0 ]; then talon_done=1; talon_cwd=$(pwd); talon_shell=${{SHELL:-sh}}; printf '{end}{id}__%s__%s__%s\n' "$talon_exit" "$talon_cwd" "$talon_shell"; fi
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
    let (cwd, shell) = registry
        .managed_sessions
        .iter()
        .find(|session| session.id == session_id)
        .map(|session| (session.cwd.clone(), session.shell.clone()))
        .unwrap_or_else(|| ("~".into(), "sh".into()));

    complete_active_command(&mut registry, session_id, &command_id, 130, &cwd, Some(&shell));
    push_event(
        &mut registry,
        session_id,
        "command-interrupted",
        format!("{} interrupted by operator", command_id),
    );
    true
}

pub fn schedule_interrupt_fallback(session_id: &str) {
    let session_id = session_id.to_string();
    thread::spawn(move || {
        thread::sleep(std::time::Duration::from_millis(350));
        let _ = interrupt_active_command(&session_id);
    });
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
    if let Err(error) = guard.write_all(data.as_bytes()).and_then(|_| guard.flush()) {
        let mut registry = lock_registry();
        mark_session_degraded(
            &mut registry,
            session_id,
            "transport-drop",
            "SSH input write failed",
            format!("Writing input into the live SSH transport failed: {}", error),
            "input-error",
            format!("Failed to write raw input to remote shell: {}", error),
            format!("SSH input write failed: {}", error),
        );
        return Err(format!("Failed to write raw input to remote shell: {}", error));
    }
    Ok(())
}

pub fn disconnect_session(session_id: &str) -> TerminalSnapshot {
    let pid = {
        let mut registry = lock_registry();
        registry.active_commands.remove(session_id);
        clear_connection_issue(&mut registry, session_id);
        update_session_state(&mut registry, session_id, "disconnecting");
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
        build_wrapped_command, complete_active_command, interrupt_active_command,
        lock_registry, mark_operator_disconnect, mark_remote_exit, mark_session_degraded, now_iso,
        extract_prefixed_metadata_value, parse_command_end, prime_connection_attempt, run_with_test_registry, should_suppress_managed_shell_echo, submit_command,
        ActiveCommandState, CommandHistoryEntry, Host, HostConnectionConfig, HostObservedState,
        HostRecordConfig, ManagedSessionRecord, SessionRegistry,
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
                mode: "managed".into(),
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
    fn extracts_metadata_only_when_marker_starts_the_line() {
        let registry = test_registry();

        assert!(should_suppress_managed_shell_echo(
            &registry,
            "session-1",
            "root@host:~# printf '__TALON_META_SHELL__%s\\n' \"${SHELL:-sh}\""
        ));
        assert!(should_suppress_managed_shell_echo(
            &registry,
            "session-1",
            "root@host:~# pwd | sed 's#^#__TALON_META_CWD__#'"
        ));
        assert!(!should_suppress_managed_shell_echo(&registry, "session-1", "root@host:~# pwd"));

        assert_eq!(
            extract_prefixed_metadata_value("__TALON_META_CWD__/root", "__TALON_META_CWD__"),
            Some("/root")
        );
        assert_eq!(
            extract_prefixed_metadata_value("  __TALON_META_SHELL__/bin/bash", "__TALON_META_SHELL__"),
            Some("/bin/bash")
        );
        assert_eq!(
            extract_prefixed_metadata_value("root@host:~# pwd | sed 's#^#__TALON_META_CWD__#'", "__TALON_META_CWD__"),
            None
        );
        assert_eq!(
            extract_prefixed_metadata_value("root@host:~# printf '__TALON_META_SHELL__%s\\n' \"${SHELL:-sh}\"", "__TALON_META_SHELL__"),
            None
        );
    }

    #[test]
    fn parses_command_end_markers() {
        let parsed = parse_command_end("__TALON_CMD_END__cmd-7__127__/srv/app__/bin/bash").expect("marker should parse");
        assert_eq!(parsed.0, "cmd-7");
        assert_eq!(parsed.1, 127);
        assert_eq!(parsed.2, "/srv/app");
        assert_eq!(parsed.3.as_deref(), Some("/bin/bash"));
    }

    #[test]
    fn builds_interrupt_safe_wrapped_command() {
        let wrapped = build_wrapped_command("cmd-7", "sleep 30");
        assert!(wrapped.contains("trap 'if [ \"$talon_done\" -eq 0 ]"));
        assert!(wrapped.contains("__TALON_CMD_END__cmd-7__%s__%s__%s"));
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

        complete_active_command(&mut registry, "session-1", "cmd-1", 1, "/root", Some("/bin/bash"));

        let failure = registry.latest_failures.get("session-1").expect("failure should be captured");
        assert_eq!(failure.exit_code, 1);
        assert_eq!(failure.command_id, "cmd-1");
        assert_eq!(failure.cwd, "/root");
        assert_eq!(registry.command_history[0].command, "false");
    }

    #[test]
    fn raw_mode_rejects_structured_submit() {
        run_with_test_registry(test_registry(), || {
            {
                let mut registry = lock_registry();
                registry.managed_sessions[0].mode = "raw".into();
            }

            let snapshot = submit_command("session-1", "pwd");

            assert!(snapshot.lines.iter().any(|line| line.contains("raw mode is active")));
            let registry = lock_registry();
            assert!(registry.active_commands.is_empty());
            assert!(registry.recent_events.iter().any(|event| event.event_type == "command-rejected" && event.detail.contains("raw mode")));
        });
    }

    #[test]
    fn busy_session_rejects_concurrent_submit() {
        run_with_test_registry(test_registry(), || {
            {
                let mut registry = lock_registry();
                registry.active_commands.insert(
                    "session-1".into(),
                    ActiveCommandState {
                        id: "cmd-busy".into(),
                        command: "sleep 5".into(),
                        started_at: now_iso(),
                        stdout_tail: Vec::new(),
                        stderr_tail: Vec::new(),
                    },
                );
            }

            let snapshot = submit_command("session-1", "pwd");

            assert!(snapshot.lines.iter().any(|line| line.contains("another command is still running")));
            let registry = lock_registry();
            assert_eq!(registry.active_commands.get("session-1").map(|command| command.id.as_str()), Some("cmd-busy"));
        });
    }

    #[test]
    fn interrupt_records_operator_interrupted_failure() {
        run_with_test_registry(test_registry(), || {
            {
                let mut registry = lock_registry();
                registry.active_commands.insert(
                    "session-1".into(),
                    ActiveCommandState {
                        id: "cmd-2".into(),
                        command: "curl ip.sb -4".into(),
                        started_at: now_iso(),
                        stdout_tail: vec!["partial".into()],
                        stderr_tail: Vec::new(),
                    },
                );
            }

            assert!(interrupt_active_command("session-1"));

            let registry = lock_registry();
            let failure = registry.latest_failures.get("session-1").expect("interrupt should capture failure context");
            assert_eq!(failure.exit_code, 130);
            assert_eq!(failure.outcome_type, "operator-interrupted");
            assert!(registry.command_history.iter().any(|entry| entry.id == "cmd-2" && entry.exit_code == 130));
            assert!(registry.recent_events.iter().any(|event| event.event_type == "command-interrupted"));
        });
    }

    #[test]
    fn remote_exit_creates_reconnect_oriented_issue() {
        let mut registry = test_registry();

        mark_remote_exit(&mut registry, "session-1", "exit code: 0".into());

        let issue = registry.connection_issues.get("session-1").expect("remote exit should create issue");
        assert_eq!(issue.disconnect_cause.as_deref(), Some("remote-exit"));
        assert_eq!(registry.managed_sessions[0].state, "disconnected");
        assert!(registry.terminal_buffers.get("session-1").into_iter().flatten().any(|line| line.contains("Remote shell exited")));
    }

    #[test]
    fn operator_disconnect_clears_connection_issue() {
        let mut registry = test_registry();
        mark_remote_exit(&mut registry, "session-1", "exit code: 0".into());
        assert!(registry.connection_issues.contains_key("session-1"));

        mark_operator_disconnect(&mut registry, "session-1", "exit code: 0".into());

        assert!(!registry.connection_issues.contains_key("session-1"));
        assert_eq!(registry.managed_sessions[0].state, "disconnected");
    }

    #[test]
    fn stream_failure_marks_session_degraded_with_disconnect_cause() {
        let mut registry = test_registry();

        mark_session_degraded(
            &mut registry,
            "session-1",
            "stream-failure",
            "SSH stdout stream failed",
            "The stdout reader failed for the managed SSH session: boom".into(),
            "stream-error",
            "stdout reader failed: boom".into(),
            "SSH stdout stream failed: boom".into(),
        );

        let issue = registry.connection_issues.get("session-1").expect("stream failure should create connection issue");
        assert_eq!(issue.disconnect_cause.as_deref(), Some("stream-failure"));
        assert_eq!(registry.managed_sessions[0].state, "degraded");
    }

    #[test]
    fn reconnect_prime_state_sets_reconnecting_banner() {
        run_with_test_registry(test_registry(), || {
            let host = Host {
                id: "host-reconnect".into(),
                config: HostRecordConfig {
                    label: "reconnect-host".into(),
                    address: "root@10.0.0.99".into(),
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
            };
            let config = HostConnectionConfig {
                host_id: host.id.clone(),
                port: 2222,
                username: "root".into(),
                auth_method: "password".into(),
                fingerprint_hint: "pending".into(),
                private_key_path: None,
                has_saved_password: true,
            };

            let record = prime_connection_attempt(
                &host,
                &config,
                "reconnecting",
                "Reopening SSH transport to",
                "reconnecting",
                "Re-launching ssh.exe for root@10.0.0.99".into(),
            );

            assert_eq!(record.state, "reconnecting");
            let registry = lock_registry();
            let lines = registry.terminal_buffers.get(&record.id).cloned().unwrap_or_default();
            assert!(lines.iter().any(|line| line.contains("Reopening SSH transport to")));
            assert!(registry.recent_events.iter().any(|event| event.event_type == "reconnecting"));
        });
    }
}





