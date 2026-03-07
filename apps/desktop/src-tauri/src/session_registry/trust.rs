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

pub fn confirm_host_trust(session_id: &str, fingerprint: &str) -> Result<Option<SessionConnectionIssue>, String> {
    let issue = prepare_host_trust(session_id)?;
    let actual = issue.fingerprint.clone().unwrap_or_default();
    if actual != fingerprint {
        return Err(format!("Fingerprint mismatch: expected scanned value {}, got {}", actual, fingerprint));
    }
    let key_line = ssh_keyscan(issue.host.as_deref().unwrap_or(""), issue.port.unwrap_or(22))?;
    let path = known_hosts_path().ok_or_else(|| "Could not resolve known_hosts path.".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let existing = fs::read_to_string(&path).unwrap_or_default();
    if !existing.contains(&key_line) {
        let mut next = existing;
        if !next.is_empty() && !next.ends_with('\n') {
            next.push('\n');
        }
        next.push_str(&key_line);
        next.push('\n');
        fs::write(&path, next).map_err(|error| error.to_string())?;
    }

    let mut registry = lock_registry();
    if let Some(config) = registry.host_configs.iter_mut().find(|config| config.host_id == issue.session_id.trim_start_matches("session-")) {
        config.fingerprint_hint = actual;
    }
    clear_connection_issue(&mut registry, session_id);
    Ok(None)
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
    use super::{classify_connection_issue, classify_local_connection_error, Host, HostObservedState, HostRecordConfig};

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
}


