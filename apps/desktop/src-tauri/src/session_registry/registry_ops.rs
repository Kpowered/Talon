pub fn list_host_configs() -> Vec<HostConnectionConfig> {
    lock_registry()
        .host_configs
        .iter()
        .cloned()
        .map(|mut config| {
            config.has_saved_password = secrets::has_saved_host_password(&config.host_id);
            config
        })
        .collect()
}

pub fn upsert_host(host: Host) -> Result<Vec<Host>, String> {
    let mut registry = lock_registry();
    if let Some(existing) = registry.hosts.iter_mut().find(|existing| existing.id == host.id) {
        *existing = host;
    } else {
        registry.hosts.insert(0, host);
    }
    save_hosts(&registry.hosts)?;
    Ok(registry.hosts.clone())
}

pub fn upsert_host_config(config: HostConnectionConfig) -> Result<Vec<HostConnectionConfig>, String> {
    let updated_configs = {
        let mut registry = lock_registry();
        if let Some(existing) = registry
            .host_configs
            .iter_mut()
            .find(|existing| existing.host_id == config.host_id)
        {
            *existing = config.clone();
            existing.has_saved_password = secrets::has_saved_host_password(&existing.host_id);
        } else {
            let mut config = config;
            config.has_saved_password = secrets::has_saved_host_password(&config.host_id);
            registry.host_configs.insert(0, config);
        }
        save_host_configs(&registry.host_configs)?;
        registry.host_configs.clone()
    };

    Ok(updated_configs
        .into_iter()
        .map(|mut config| {
            config.has_saved_password = secrets::has_saved_host_password(&config.host_id);
            config
        })
        .collect())
}

pub fn delete_host_config(host_id: &str) -> Result<Vec<HostConnectionConfig>, String> {
    let updated_configs = {
        let mut registry = lock_registry();
        registry.host_configs.retain(|config| config.host_id != host_id);
        save_host_configs(&registry.host_configs)?;
        registry.host_configs.clone()
    };

    Ok(updated_configs
        .into_iter()
        .map(|mut config| {
            config.has_saved_password = secrets::has_saved_host_password(&config.host_id);
            config
        })
        .collect())
}

pub fn delete_host(host_id: &str) -> Result<Vec<Host>, String> {
    let mut registry = lock_registry();
    registry.hosts.retain(|host| host.id != host_id);
    registry.host_configs.retain(|config| config.host_id != host_id);
    save_hosts(&registry.hosts)?;
    save_host_configs(&registry.host_configs)?;
    Ok(registry.hosts.clone())
}

pub fn busy_session_ids() -> Vec<String> {
    lock_registry()
        .active_commands
        .keys()
        .cloned()
        .collect()
}

pub fn active_command_for(session_id: &str) -> Option<ActiveCommandState> {
    lock_registry()
        .active_commands
        .get(session_id)
        .cloned()
}

pub fn connection_issue_for(session_id: &str) -> Option<SessionConnectionIssue> {
    lock_registry()
        .connection_issues
        .get(session_id)
        .cloned()
}

pub fn host_config_for(host_id: &str) -> Option<HostConnectionConfig> {
    lock_registry()
        .host_configs
        .iter()
        .find(|config| config.host_id == host_id)
        .cloned()
}

pub fn host_for(host_id: &str) -> Option<Host> {
    lock_registry()
        .hosts
        .iter()
        .find(|host| host.id == host_id)
        .cloned()
}

pub fn first_host() -> Option<Host> {
    lock_registry().hosts.first().cloned()
}

pub fn recent_events() -> Vec<SessionLifecycleEvent> {
    lock_registry().recent_events.clone()
}

pub fn terminal_snapshot(session_id: &str) -> TerminalSnapshot {
    let registry = lock_registry();
    let lines = registry
        .terminal_buffers
        .get(session_id)
        .cloned()
        .or_else(|| registry.terminal_buffers.get(&registry.active_session_id).cloned())
        .unwrap_or_default();

    TerminalSnapshot {
        session_id: session_id.into(),
        lines,
    }
}

fn next_event_id(registry: &mut SessionRegistry, session_id: &str, event_type: &str) -> String {
    registry.event_counter += 1;
    format!("event-{}-{}-{}", session_id, event_type, registry.event_counter)
}

fn push_event(registry: &mut SessionRegistry, session_id: &str, event_type: &str, detail: String) {
    let event = SessionLifecycleEvent {
        id: next_event_id(registry, session_id, event_type),
        session_id: session_id.into(),
        event_type: event_type.into(),
        detail,
        occurred_at: now_iso(),
    };
    registry.recent_events.insert(0, event);
    registry.recent_events.truncate(24);
}

fn push_terminal_line(registry: &mut SessionRegistry, session_id: &str, line: String) {
    let lines = registry
        .terminal_buffers
        .entry(session_id.into())
        .or_insert_with(Vec::new);
    lines.push(line);
    if lines.len() > 400 {
        let drain = lines.len() - 400;
        lines.drain(0..drain);
    }
}

fn push_stream_tail(target: &mut Vec<String>, line: String) {
    target.push(line);
    if target.len() > 80 {
        let drain = target.len() - 80;
        target.drain(0..drain);
    }
}

fn capture_stream_line(registry: &mut SessionRegistry, session_id: &str, stream: &str, line: &str) {
    let state = registry
        .stream_state
        .entry(session_id.into())
        .or_insert_with(SessionStreamState::default);

    state.last_updated_at = now_iso();
    match stream {
        "stderr" => push_stream_tail(&mut state.stderr_tail, line.into()),
        _ => push_stream_tail(&mut state.stdout_tail, line.into()),
    }
}

fn capture_command_stream_line(registry: &mut SessionRegistry, session_id: &str, stream: &str, line: &str) {
    if let Some(command) = registry.active_commands.get_mut(session_id) {
        match stream {
            "stderr" => push_stream_tail(&mut command.stderr_tail, line.into()),
            _ => push_stream_tail(&mut command.stdout_tail, line.into()),
        }
    }
}

fn set_connection_issue(
    registry: &mut SessionRegistry,
    session_id: &str,
    kind: &str,
    title: &str,
    summary: String,
    operator_action: &str,
    suggested_command: String,
) {
    registry.connection_issues.insert(
        session_id.into(),
        SessionConnectionIssue {
            session_id: session_id.into(),
            kind: kind.into(),
            title: title.into(),
            summary,
            operator_action: operator_action.into(),
            suggested_command,
            observed_at: now_iso(),
            fingerprint: None,
            expected_fingerprint_hint: None,
            host: None,
            port: None,
            can_trust_in_app: false,
            in_app_action_kind: None,
            in_app_action_label: None,
        },
    );
}

fn clear_connection_issue(registry: &mut SessionRegistry, session_id: &str) {
    registry.connection_issues.remove(session_id);
}

fn classify_connection_issue(host: &Host, line: &str) -> Option<(String, String, String, String, String)> {
    let normalized = line.to_ascii_lowercase();
    let escaped_host = host.config.address.replace('\'', "''");

    if normalized.contains("host key verification failed")
        || normalized.contains("no host key is known")
        || normalized.contains("remote host identification has changed")
    {
        let title = if normalized.contains("changed") {
            "Host key mismatch"
        } else {
            "Host trust confirmation required"
        };
        let operator_action = if normalized.contains("changed") {
            "Compare the expected fingerprint with an operator-approved value before changing known_hosts."
        } else {
            "Review the server fingerprint out of band before trusting this host."
        };
        let suggested_command = if normalized.contains("changed") {
            format!("ssh-keygen -R \"{}\"", host.config.address)
        } else {
            format!("ssh-keyscan -H \"{}\"", escaped_host)
        };
        return Some((
            "host-trust".into(),
            title.into(),
            line.into(),
            operator_action.into(),
            suggested_command,
        ));
    }

    if normalized.contains("permission denied")
        || normalized.contains("no supported authentication methods available")
        || normalized.contains("publickey")
    {
        return Some((
            "auth".into(),
            "SSH authentication failed".into(),
            line.into(),
            "Confirm the username, agent state, and selected private key before retrying.".into(),
            "ssh-add -L".into(),
        ));
    }

    if normalized.contains("connection timed out") || normalized.contains("operation timed out") {
        return Some((
            "timeout".into(),
            "SSH connection timed out".into(),
            line.into(),
            "Confirm host reachability and network path before retrying.".into(),
            format!("ssh -vvv {}", host.config.address),
        ));
    }

    if normalized.contains("could not resolve hostname")
        || normalized.contains("connection refused")
        || normalized.contains("no route to host")
        || normalized.contains("name or service not known")
    {
        return Some((
            "network".into(),
            "SSH network path failed".into(),
            line.into(),
            "Verify DNS, port reachability, and whether sshd is accepting connections on the target.".into(),
            format!("ssh -vvv {}", host.config.address),
        ));
    }

    None
}

fn classify_local_connection_error(host: &Host, line: &str) -> (String, String, String, String, String) {
    classify_connection_issue(host, line).unwrap_or((
        "transport".into(),
        "SSH transport launch failed".into(),
        line.into(),
        "Review the local SSH configuration, selected auth method, and transport prerequisites before retrying.".into(),
        format!("ssh -vvv {}", host.config.address),
    ))
}

fn create_askpass_helper(session_id: &str) -> Result<PathBuf, String> {
    let sanitized = session_id
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>();
    let path = env::temp_dir().join(format!("talon_askpass_{}.cmd", sanitized));
    fs::write(&path, "@echo off\r\necho %TALON_SSH_PASSWORD%\r\n").map_err(|error| error.to_string())?;
    Ok(path)
}

fn next_command_id(registry: &mut SessionRegistry, session_id: &str) -> String {
    registry.command_counter += 1;
    format!("cmd-{}-{}", session_id, registry.command_counter)
}

fn parse_command_end(line: &str) -> Option<(String, i32, String, Option<String>)> {
    let marker_index = line.find(CMD_END_PREFIX)?;
    let payload = &line[(marker_index + CMD_END_PREFIX.len())..];
    let mut parts = payload.splitn(4, "__");
    let command_id = parts.next()?.to_string();
    let exit_code = parts.next()?.parse::<i32>().ok()?;
    let cwd = parts.next()?.to_string();
    let shell = parts.next().map(|value| value.to_string()).filter(|value| !value.trim().is_empty());
    Some((command_id, exit_code, cwd, shell))
}
fn complete_active_command(registry: &mut SessionRegistry, session_id: &str, command_id: &str, exit_code: i32, cwd: &str, shell: Option<&str>) {
    let Some(command) = registry.active_commands.remove(session_id) else {
        push_event(
            registry,
            session_id,
            "command-error",
            format!("Received completion marker for unknown command {}", command_id),
        );
        return;
    };

    if command.id != command_id {
        push_event(
            registry,
            session_id,
            "command-error",
            format!(
                "Received completion marker for {} while {} was active",
                command_id, command.id
            ),
        );
    }

    update_session_metadata(registry, session_id, shell, Some(cwd));
    let completed_at = now_iso();
    let stderr_signal = classify_command_stderr_signal(&command.stderr_tail);
    let stderr_class = stderr_signal.as_ref().map(|(class, _, _)| (*class).to_string());
    let stderr_evidence = stderr_signal.as_ref().map(|(_, _, evidence)| evidence.clone());
    registry.command_history.insert(
        0,
        CommandHistoryEntry {
            id: command.id.clone(),
            session_id: session_id.into(),
            command: command.command.clone(),
            started_at: command.started_at.clone(),
            completed_at: completed_at.clone(),
            exit_code,
            stderr_class,
            stderr_evidence,
            stdout_tail: command.stdout_tail.clone(),
            stderr_tail: command.stderr_tail.clone(),
        },
    );
    registry.command_history.truncate(48);

    push_event(
        registry,
        session_id,
        "command-completed",
        format!("{} exited with code {} in {}", command.command, exit_code, cwd),
    );

    let observed_status = command_health_status(registry, session_id, &command.stderr_tail);
    update_host_observed_for_session(registry, session_id, Some(observed_status), true);

    if exit_code != 0 {
        let session = registry.managed_sessions.iter().find(|session| session.id == session_id);
        if let Some(command_entry) = registry.command_history.first().cloned() {
            registry.latest_failures.insert(
                session_id.into(),
                context_builder::build_failure_context(session_id, session, &command_entry),
            );
        }
        push_event(
            registry,
            session_id,
            "command-failed",
            format!("{} failed with exit code {}", command.command, exit_code),
        );
    }
}

fn update_session_state(registry: &mut SessionRegistry, session_id: &str, state: &str) {
    if let Some(session) = registry.managed_sessions.iter_mut().find(|session| session.id == session_id) {
        session.state = state.into();
        if state == "connected" {
            session.connected_at = now_iso();
        }
    }
}

fn update_host_observed(
    registry: &mut SessionRegistry,
    host_id: &str,
    status: Option<&str>,
    last_seen_at: Option<&str>,
    latency_ms: Option<u32>,
) {
    if let Some(host) = registry.hosts.iter_mut().find(|host| host.id == host_id) {
        if let Some(status) = status {
            host.observed.status = status.into();
        }
        if let Some(last_seen_at) = last_seen_at {
            host.observed.last_seen_at = last_seen_at.into();
        }
        if let Some(latency_ms) = latency_ms {
            host.observed.latency_ms = latency_ms;
        }
        let _ = save_hosts(&registry.hosts);
    }
}

fn update_host_observed_for_session(
    registry: &mut SessionRegistry,
    session_id: &str,
    status: Option<&str>,
    touch_last_seen: bool,
) {
    let host_id = registry
        .managed_sessions
        .iter()
        .find(|session| session.id == session_id)
        .map(|session| session.host_id.clone());

    if let Some(host_id) = host_id {
        let last_seen = if touch_last_seen { Some(now_iso()) } else { None };
        update_host_observed(registry, &host_id, status, last_seen.as_deref(), None);
    }
}

fn capture_connect_latency_ms(registry: &SessionRegistry, session_id: &str) -> Option<u32> {
    registry
        .runtimes
        .get(session_id)
        .map(|runtime| runtime.started_at.elapsed().as_millis().min(u128::from(u32::MAX)) as u32)
}

fn classify_command_stderr_signal(stderr_tail: &[String]) -> Option<(&'static str, &'static str, String)> {
    for line in stderr_tail.iter().rev() {
        let normalized = line.to_ascii_lowercase();

        if normalized.contains("connection refused")
            || normalized.contains("connection reset")
            || normalized.contains("no route to host")
            || normalized.contains("network is unreachable")
        {
            return Some(("network-path", "critical", line.clone()));
        }

        if normalized.contains("no space left on device")
            || normalized.contains("disk quota exceeded")
            || normalized.contains("read-only file system")
        {
            return Some(("filesystem", "critical", line.clone()));
        }

        if normalized.contains("out of memory")
            || normalized.contains("cannot allocate memory")
            || normalized.contains(" killed")
            || normalized.starts_with("killed")
            || normalized.contains("oom")
        {
            return Some(("resource-pressure", "critical", line.clone()));
        }

        if normalized.contains("permission denied")
            || normalized.contains("access denied")
            || normalized.contains("operation not permitted")
        {
            return Some(("permission", "warning", line.clone()));
        }
    }

    None
}

fn classify_command_stderr_severity(stderr_tail: &[String]) -> Option<&'static str> {
    classify_command_stderr_signal(stderr_tail).map(|(_, severity, _)| severity)
}

fn host_health_from_recent_commands(registry: &SessionRegistry, session_id: &str) -> &'static str {
    let mut consecutive_failures = 0;

    for entry in registry.command_history.iter().filter(|entry| entry.session_id == session_id) {
        if entry.exit_code == 0 {
            break;
        }
        consecutive_failures += 1;
        if consecutive_failures >= 3 {
            return "critical";
        }
    }

    if consecutive_failures > 0 {
        "warning"
    } else {
        "healthy"
    }
}

fn command_health_status(registry: &SessionRegistry, session_id: &str, stderr_tail: &[String]) -> &'static str {
    classify_command_stderr_severity(stderr_tail).unwrap_or_else(|| host_health_from_recent_commands(registry, session_id))
}

fn update_session_metadata(registry: &mut SessionRegistry, session_id: &str, shell: Option<&str>, cwd: Option<&str>) {
    if let Some(session) = registry.managed_sessions.iter_mut().find(|session| session.id == session_id) {
        if let Some(shell) = shell {
            session.shell = shell.into();
        }
        if let Some(cwd) = cwd {
            session.cwd = cwd.into();
        }
    }
}

fn parse_host_target(host: &Host, config: Option<&HostConnectionConfig>) -> (String, String) {
    let fallback_username = config
        .map(|value| value.username.clone())
        .unwrap_or_else(|| "root".into());

    let address = host.config.address.trim();
    if let Some((username, hostname)) = address.split_once('@') {
        return (username.to_string(), hostname.to_string());
    }

    (fallback_username, address.to_string())
}

fn known_hosts_path() -> Option<PathBuf> {
    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    Some(home.join(".ssh").join("known_hosts"))
}

fn recent_commands_for_session(session_id: &str, command_history: &[CommandHistoryEntry]) -> Vec<serde_json::Value> {
    command_history
        .iter()
        .rev()
        .filter(|entry| entry.session_id == session_id)
        .take(6)
        .map(|entry| serde_json::json!({
            "id": entry.id,
            "command": entry.command,
            "startedAt": entry.started_at,
            "completedAt": entry.completed_at,
            "exitCode": entry.exit_code,
            "stderrClass": entry.stderr_class,
            "stderrEvidence": entry.stderr_evidence,
            "stdoutTail": entry.stdout_tail,
            "stderrTail": entry.stderr_tail,
        }))
        .collect()
}

fn host_and_connection_values(host: &Host, config: &HostConnectionConfig) -> (serde_json::Value, serde_json::Value) {
    (
        serde_json::json!({
            "id": host.id,
            "config": host.config,
            "observed": host.observed,
        }),
        serde_json::json!({
            "port": config.port,
            "username": config.username,
            "authMethod": config.auth_method,
            "fingerprintHint": config.fingerprint_hint,
            "privateKeyPath": config.private_key_path,
            "hasSavedPassword": secrets::has_saved_host_password(&config.host_id),
        }),
    )
}

fn session_value(session: &ManagedSessionRecord) -> serde_json::Value {
    serde_json::json!({
        "id": session.id,
        "state": session.state,
        "shell": session.shell,
        "cwd": session.cwd,
        "connectedAt": session.connected_at,
        "lastCommandAt": session.last_command_at,
        "autoCaptureEnabled": session.auto_capture_enabled,
    })
}


#[cfg(test)]
mod registry_ops_tests {
    use super::push_stream_tail;

    #[test]
    fn truncates_stream_tail_to_eighty_lines() {
        let mut tail = (0..80).map(|index| format!("line-{index}")).collect::<Vec<_>>();
        push_stream_tail(&mut tail, "line-80".into());
        assert_eq!(tail.len(), 80);
        assert_eq!(tail.first().map(String::as_str), Some("line-1"));
        assert_eq!(tail.last().map(String::as_str), Some("line-80"));
    }
}


