fn ssh_keyscan(host: &str, port: u16) -> Result<String, String> {
    let output = Command::new("ssh-keyscan")
        .arg("-p")
        .arg(port.to_string())
        .arg(host)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn fingerprint_for_key_line(key_line: &str) -> Result<String, String> {
    let temp_path = env::temp_dir().join(format!("talon-known-host-{}.pub", now_iso().replace(':', "-").replace('.', "-")));
    fs::write(&temp_path, key_line).map_err(|error| error.to_string())?;
    let output = Command::new("ssh-keygen")
        .arg("-lf")
        .arg(&temp_path)
        .arg("-E")
        .arg("sha256")
        .output()
        .map_err(|error| error.to_string())?;
    let _ = fs::remove_file(&temp_path);
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let line = String::from_utf8_lossy(&output.stdout);
    let fingerprint = line.split_whitespace().nth(1).unwrap_or("").trim().to_string();
    if fingerprint.is_empty() {
        return Err("Could not parse ssh-keygen fingerprint output.".into());
    }
    Ok(fingerprint)
}

pub fn cached_context_packet_for(session_id: &str) -> Option<DiagnosisContextPacket> {
    lock_registry()
        .diagnosis_cache
        .get(session_id)
        .map(|entry| entry.packet.clone())
}

pub fn invalidate_diagnosis(session_id: &str) {
    lock_registry()
        .diagnosis_cache
        .remove(session_id);
}

pub fn prepare_host_trust(session_id: &str) -> Result<SessionConnectionIssue, String> {
    let (host, port, hint) = {
        let registry = lock_registry();
        let session = registry
            .managed_sessions
            .iter()
            .find(|session| session.id == session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;
        let host = registry
            .hosts
            .iter()
            .find(|host| host.id == session.host_id)
            .cloned()
            .ok_or_else(|| format!("Host {} not found", session.host_id))?;
        let config = registry
            .host_configs
            .iter()
            .find(|config| config.host_id == host.id)
            .cloned()
            .ok_or_else(|| format!("Host config {} not found", host.id))?;
        let (_, hostname) = parse_host_target(&host, Some(&config));
        (hostname, config.port, config.fingerprint_hint)
    };

    let key_line = ssh_keyscan(&host, port)?;
    let fingerprint = fingerprint_for_key_line(key_line.lines().next().unwrap_or(&key_line))?;

    let mut registry = lock_registry();
    let issue = SessionConnectionIssue {
        session_id: session_id.into(),
        kind: "host-trust".into(),
        title: "Host trust confirmation required".into(),
        summary: format!("Scanned host fingerprint {} for {}:{}.", fingerprint, host, port),
        operator_action: "Review the scanned fingerprint and confirm only if it matches an operator-approved value.".into(),
        suggested_command: format!("ssh-keyscan -p {} {}", port, host),
        observed_at: now_iso(),
        fingerprint: Some(fingerprint),
        expected_fingerprint_hint: Some(hint),
        host: Some(host),
        port: Some(port),
        can_trust_in_app: true,
        in_app_action_kind: Some("confirm-host-trust".into()),
        in_app_action_label: Some("Trust host".into()),
        disconnect_cause: None,
    };
    registry.connection_issues.insert(session_id.into(), issue.clone());
    Ok(issue)
}

fn persist_confirmed_host_trust(
    session_id: &str,
    issue: &SessionConnectionIssue,
    fingerprint: &str,
    key_line: &str,
) -> Result<Option<SessionConnectionIssue>, String> {
    let path = known_hosts_path().ok_or_else(|| "Could not resolve known_hosts path.".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let existing = fs::read_to_string(&path).unwrap_or_default();
    if !existing.contains(key_line) {
        let mut next = existing;
        if !next.is_empty() && !next.ends_with('\n') {
            next.push('\n');
        }
        next.push_str(key_line);
        next.push('\n');
        fs::write(&path, next).map_err(|error| error.to_string())?;
    }

    let mut registry = lock_registry();
    let host_id = registry
        .managed_sessions
        .iter()
        .find(|session| session.id == session_id)
        .map(|session| session.host_id.clone())
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    if let Some(config) = registry.host_configs.iter_mut().find(|config| config.host_id == host_id) {
        config.fingerprint_hint = fingerprint.into();
    }
    registry.connection_issues.insert(session_id.into(), issue.clone());
    clear_connection_issue(&mut registry, session_id);
    Ok(None)
}

pub fn confirm_host_trust(session_id: &str, fingerprint: &str) -> Result<Option<SessionConnectionIssue>, String> {
    let issue = prepare_host_trust(session_id)?;
    let actual = issue.fingerprint.clone().unwrap_or_default();
    if actual != fingerprint {
        return Err(format!("Fingerprint mismatch: expected scanned value {}, got {}", actual, fingerprint));
    }
    let key_line = ssh_keyscan(issue.host.as_deref().unwrap_or(""), issue.port.unwrap_or(22))?;
    persist_confirmed_host_trust(session_id, &issue, &actual, &key_line)
}

fn resolve_private_key_path(host_id: &str) -> Option<PathBuf> {
    let env_key = format!(
        "TALON_SSH_KEY_PATH_{}",
        host_id.replace('-', "_").to_ascii_uppercase()
    );

    if let Ok(path) = env::var(&env_key) {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(path);
        }
    }

    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    for candidate in ["id_ed25519", "id_rsa"] {
        let path = home.join(".ssh").join(candidate);
        if path.exists() {
            return Some(path);
        }
    }

    None
}


#[cfg(test)]
mod trust_tests {
    use super::{
        classify_connection_issue, classify_local_connection_error, persist_confirmed_host_trust,
        prepare_host_trust, run_with_test_registry, Host, HostConnectionConfig, HostObservedState,
        HostRecordConfig, ManagedSessionRecord, SessionConnectionIssue, SessionRegistry,
    };
    use std::collections::HashMap;
    use std::env;
    use std::fs;

    fn sample_host() -> Host {
        Host {
            id: "host-1".into(),
            config: HostRecordConfig {
                label: "prod-1".into(),
                address: "root@example.com".into(),
                region: "test".into(),
                tags: vec!["test".into()],
            },
            observed: HostObservedState {
                status: "warning".into(),
                latency_ms: 0,
                cpu_percent: 0,
                memory_percent: 0,
                last_seen_at: "2026-03-07T00:00:00Z".into(),
            },
        }
    }

    fn trust_registry() -> SessionRegistry {
        SessionRegistry {
            hosts: vec![sample_host()],
            host_configs: vec![HostConnectionConfig {
                host_id: "host-1".into(),
                port: 22,
                username: "root".into(),
                auth_method: "password".into(),
                fingerprint_hint: "Pending trust".into(),
                private_key_path: None,
                has_saved_password: true,
            }],
            managed_sessions: vec![ManagedSessionRecord {
                id: "session-1".into(),
                host_id: "host-1".into(),
                state: "degraded".into(),
                mode: "managed".into(),
                shell: "sh".into(),
                cwd: "~".into(),
                connected_at: "2026-03-07T00:00:00Z".into(),
                last_command_at: "2026-03-07T00:00:00Z".into(),
                auto_capture_enabled: true,
            }],
            active_session_id: "session-1".into(),
            recent_events: Vec::new(),
            terminal_buffers: HashMap::new(),
            stream_state: HashMap::new(),
            connection_issues: HashMap::new(),
            latest_failures: HashMap::new(),
            active_commands: HashMap::new(),
            command_history: Vec::new(),
            runtimes: HashMap::new(),
            diagnosis_cache: HashMap::new(),
            event_counter: 0,
            command_counter: 0,
        }
    }

    #[test]
    fn classifies_host_trust_lines() {
        let host = sample_host();
        let issue = classify_connection_issue(&host, "Host key verification failed.").expect("issue should classify");
        assert_eq!(issue.0, "host-trust");
        assert_eq!(issue.2, "Host key verification failed.");
    }

    #[test]
    fn classifies_local_network_errors() {
        let host = sample_host();
        let issue = classify_local_connection_error(&host, "connect to host example.com port 22: Connection refused");
        assert_eq!(issue.0, "network");
        assert!(issue.2.contains("Connection refused"));
    }

    #[test]
    fn prepare_host_trust_rejects_missing_session() {
        run_with_test_registry(trust_registry(), || {
            let error = prepare_host_trust("session-missing").err().expect("missing session should fail");
            assert!(error.contains("Session session-missing not found"));
        });
    }

    #[test]
    fn persist_confirmed_host_trust_updates_host_config_and_clears_issue() {
        run_with_test_registry(trust_registry(), || {
            let temp_home = env::temp_dir().join("talon-trust-test-home");
            let ssh_dir = temp_home.join(".ssh");
            let _ = fs::remove_dir_all(&temp_home);
            fs::create_dir_all(&ssh_dir).expect("ssh dir should exist");
            let previous_user_profile = env::var("USERPROFILE").ok();
            unsafe { env::set_var("USERPROFILE", &temp_home); }

            let issue = SessionConnectionIssue {
                session_id: "session-1".into(),
                kind: "host-trust".into(),
                title: "Host trust confirmation required".into(),
                summary: "Scanned host fingerprint SHA256:test for example.com:22.".into(),
                operator_action: "Review fingerprint".into(),
                suggested_command: "ssh-keyscan -p 22 example.com".into(),
                observed_at: "2026-03-07T00:00:00Z".into(),
                fingerprint: Some("SHA256:test".into()),
                expected_fingerprint_hint: Some("Pending trust".into()),
                host: Some("example.com".into()),
                port: Some(22),
                can_trust_in_app: true,
                in_app_action_kind: Some("confirm-host-trust".into()),
                in_app_action_label: Some("Trust host".into()),
                disconnect_cause: None,
            };

            let result = persist_confirmed_host_trust(
                "session-1",
                &issue,
                "SHA256:test",
                "example.com ssh-ed25519 AAAATESTKEY",
            );

            if let Some(value) = previous_user_profile {
                unsafe { env::set_var("USERPROFILE", value); }
            } else {
                unsafe { env::remove_var("USERPROFILE"); }
            }

            assert!(result.is_ok());
            let registry = super::lock_registry();
            assert_eq!(registry.host_configs[0].fingerprint_hint, "SHA256:test");
            assert!(!registry.connection_issues.contains_key("session-1"));
            let known_hosts = fs::read_to_string(ssh_dir.join("known_hosts")).expect("known_hosts should exist");
            assert!(known_hosts.contains("AAAATESTKEY"));
            let _ = fs::remove_dir_all(&temp_home);
        });
    }
}


