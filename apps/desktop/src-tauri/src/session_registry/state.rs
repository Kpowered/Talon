fn now_iso() -> String {
    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg("[DateTime]::UtcNow.ToString('o')")
        .output();

    match output {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout).trim().to_string(),
        _ => "2026-03-06T00:00:00.0000000Z".into(),
    }
}

fn default_host_configs() -> Vec<HostConnectionConfig> {
    vec![
        HostConnectionConfig {
            host_id: "host-prod-web-1".into(),
            port: 22,
            username: "root".into(),
            auth_method: "agent".into(),
            fingerprint_hint: "SHA256:prod-web-1".into(),
            private_key_path: None,
            has_saved_password: false,
        },
        HostConnectionConfig {
            host_id: "host-api-gateway".into(),
            port: 22,
            username: "root".into(),
            auth_method: "agent".into(),
            fingerprint_hint: "SHA256:api-gateway".into(),
            private_key_path: None,
            has_saved_password: false,
        },
        HostConnectionConfig {
            host_id: "host-db-primary".into(),
            port: 22,
            username: "postgres".into(),
            auth_method: "private-key".into(),
            fingerprint_hint: "SHA256:db-primary".into(),
            private_key_path: None,
            has_saved_password: false,
        },
    ]
}

fn default_hosts() -> Vec<Host> {
    vec![
        Host {
            id: "host-prod-web-1".into(),
            config: HostRecordConfig {
                label: "prod-web-1".into(),
                address: "root@10.0.0.12".into(),
                region: "sjc-1".into(),
                tags: vec!["production".into(), "edge".into()],
            },
            observed: HostObservedState {
                status: "critical".into(),
                latency_ms: 186,
                cpu_percent: 74,
                memory_percent: 81,
                last_seen_at: "2026-03-06T13:41:32Z".into(),
            },
        },
        Host {
            id: "host-api-gateway".into(),
            config: HostRecordConfig {
                label: "api-gateway".into(),
                address: "root@10.0.0.23".into(),
                region: "hkg-1".into(),
                tags: vec!["production".into(), "api".into()],
            },
            observed: HostObservedState {
                status: "warning".into(),
                latency_ms: 92,
                cpu_percent: 46,
                memory_percent: 67,
                last_seen_at: "2026-03-06T13:41:09Z".into(),
            },
        },
        Host {
            id: "host-db-primary".into(),
            config: HostRecordConfig {
                label: "db-primary".into(),
                address: "postgres@10.0.0.31".into(),
                region: "hkg-1".into(),
                tags: vec!["production".into(), "database".into()],
            },
            observed: HostObservedState {
                status: "healthy".into(),
                latency_ms: 41,
                cpu_percent: 31,
                memory_percent: 54,
                last_seen_at: "2026-03-06T13:40:58Z".into(),
            },
        },
    ]
}

fn host_configs_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir().or_else(dirs::data_dir)?;
    Some(base.join("Talon").join(HOST_CONFIGS_FILE_NAME))
}

fn hosts_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir().or_else(dirs::data_dir)?;
    Some(base.join("Talon").join(HOSTS_FILE_NAME))
}

fn load_host_configs() -> Vec<HostConnectionConfig> {
    let Some(path) = host_configs_path() else {
        return default_host_configs();
    };

    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str::<Vec<HostConnectionConfig>>(&contents).unwrap_or_else(|_| default_host_configs()),
        Err(_) => default_host_configs(),
    }
}

fn load_hosts() -> Vec<Host> {
    let Some(path) = hosts_path() else {
        return default_hosts();
    };

    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str::<Vec<Host>>(&contents).unwrap_or_else(|_| default_hosts()),
        Err(_) => default_hosts(),
    }
}

fn save_host_configs(host_configs: &[HostConnectionConfig]) -> Result<(), String> {
    let Some(path) = host_configs_path() else {
        return Err("Could not resolve local data directory for Talon host configs.".into());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload = serde_json::to_string_pretty(host_configs).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

fn save_hosts(hosts: &[Host]) -> Result<(), String> {
    let Some(path) = hosts_path() else {
        return Err("Could not resolve local data directory for Talon hosts.".into());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload = serde_json::to_string_pretty(hosts).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

fn default_session() -> ManagedSessionRecord {
    ManagedSessionRecord {
        id: "session-a91f".into(),
        host_id: "host-prod-web-1".into(),
        state: "disconnected".into(),
        shell: "bash".into(),
        cwd: "/etc/nginx".into(),
        connected_at: "2026-03-06T13:36:02Z".into(),
        last_command_at: "2026-03-06T13:42:02Z".into(),
        auto_capture_enabled: true,
    }
}

fn default_events() -> Vec<SessionLifecycleEvent> {
    vec![SessionLifecycleEvent {
        id: "event-bootstrap-session-registry".into(),
        session_id: "session-a91f".into(),
        event_type: "bootstrap".into(),
        detail: "Session registry initialized. Real SSH transport is now wired through ssh.exe.".into(),
        occurred_at: "2026-03-06T13:36:02Z".into(),
    }]
}

fn default_terminal_buffer() -> Vec<String> {
    vec!["Talon session registry ready. Connect a host to start a real SSH shell.".into()]
}

fn registry() -> &'static Mutex<SessionRegistry> {
    REGISTRY.get_or_init(|| {
        let default_session = default_session();
        let mut terminal_buffers = HashMap::new();
        terminal_buffers.insert(default_session.id.clone(), default_terminal_buffer());

        Mutex::new(SessionRegistry {
            hosts: load_hosts(),
            host_configs: load_host_configs(),
            managed_sessions: vec![default_session.clone()],
            active_session_id: default_session.id.clone(),
            recent_events: default_events(),
            terminal_buffers,
            stream_state: HashMap::new(),
            connection_issues: HashMap::new(),
            latest_failures: HashMap::new(),
            active_commands: HashMap::new(),
            command_history: Vec::new(),
            runtimes: HashMap::new(),
            diagnosis_cache: HashMap::new(),
            event_counter: 0,
            command_counter: 0,
        })
    })
}

fn lock_registry() -> MutexGuard<'static, SessionRegistry> {
    registry().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn lock_stdin(stdin: &Arc<Mutex<ChildStdin>>) -> MutexGuard<'_, ChildStdin> {
    stdin.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}


