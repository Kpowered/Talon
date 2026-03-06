pub fn workspace_state() -> TalonWorkspaceState {
    let (mut state, generation_input, active_session_id) = {
        let registry = lock_registry();
        let mut state = session_store::get_workspace_state();
        state.hosts = registry.hosts.clone();
        state.sessions = registry
            .managed_sessions
            .iter()
            .map(|session| Session {
                id: session.id.clone(),
                host_id: session.host_id.clone(),
                state: session.state.clone(),
                shell: session.shell.clone(),
                cwd: session.cwd.clone(),
                connected_at: session.connected_at.clone(),
                last_command_at: session.last_command_at.clone(),
                auto_capture_enabled: session.auto_capture_enabled,
            })
            .collect();
        state.active_session_id = registry.active_session_id.clone();

        let mut generation_input: Option<(String, DiagnosisGenerationInput)> = None;
        if let Some(active) = registry.managed_sessions.iter().find(|session| session.id == state.active_session_id) {
            state.terminal = TerminalSnapshot {
                session_id: active.id.clone(),
                lines: registry
                    .terminal_buffers
                    .get(&active.id)
                    .cloned()
                    .unwrap_or_else(default_terminal_buffer),
            };

            let host = registry
                .hosts
                .iter()
                .find(|host| host.id == active.host_id)
                .cloned();
            let config = registry
                .host_configs
                .iter()
                .find(|config| config.host_id == active.host_id)
                .cloned();
            let timeline = context_builder::timeline_for_session(
                &registry.command_history,
                &active.id,
                registry.latest_failures.get(&active.id),
                registry.connection_issues.get(&active.id),
            );
            state.timeline = timeline.clone();

            if let (Some(host), Some(config)) = (host, config) {
                let (host_value, connection_value) = host_and_connection_values(&host, &config);
                let session_value = session_value(active);
                let recent_commands = recent_commands_for_session(&active.id, &registry.command_history);

                if let Some(failure) = registry.latest_failures.get(&active.id) {
                    state.latest_failure = failure.clone();
                    let fallback = diagnosis_engine::fallback_for_failure(failure);
                    let packet = diagnosis_engine::build_packet_from_failure(
                        failure,
                        host_value,
                        connection_value,
                        session_value,
                        recent_commands,
                        timeline.iter().cloned().map(|item| serde_json::json!(item)).collect(),
                    );
                    let trigger_key = packet.id.clone();
                    if let Some(cached) = registry.diagnosis_cache.get(&active.id) {
                        if cached.trigger_key == trigger_key {
                            state.latest_diagnosis = cached.response.clone();
                        } else {
                            generation_input = Some((active.id.clone(), DiagnosisGenerationInput { packet, fallback }));
                        }
                    } else {
                        generation_input = Some((active.id.clone(), DiagnosisGenerationInput { packet, fallback }));
                    }
                } else if let Some(issue) = registry.connection_issues.get(&active.id) {
                    let fallback = diagnosis_engine::fallback_for_connection_issue(issue);
                    let packet = diagnosis_engine::build_packet_from_connection_issue(
                        issue,
                        host_value,
                        connection_value,
                        session_value,
                        recent_commands,
                        timeline.iter().cloned().map(|item| serde_json::json!(item)).collect(),
                    );
                    let trigger_key = packet.id.clone();
                    if let Some(cached) = registry.diagnosis_cache.get(&active.id) {
                        if cached.trigger_key == trigger_key {
                            state.latest_diagnosis = cached.response.clone();
                        } else {
                            generation_input = Some((active.id.clone(), DiagnosisGenerationInput { packet, fallback }));
                        }
                    } else {
                        generation_input = Some((active.id.clone(), DiagnosisGenerationInput { packet, fallback }));
                    }
                }
            }
        }

        (state, generation_input, registry.active_session_id.clone())
    };

    if let Some((session_id, input)) = generation_input {
        let response = diagnosis_engine::generate(input.clone());
        let mut registry = lock_registry();
        registry.diagnosis_cache.insert(
            session_id.clone(),
            DiagnosisCacheEntry {
                trigger_key: input.packet.id.clone(),
                response: response.clone(),
                packet: input.packet,
            },
        );
        if session_id == active_session_id {
            state.latest_diagnosis = response;
        }
    }

    state
}

#[cfg(test)]
mod tests {
    use super::{classify_command_stderr_severity, command_health_status, CommandHistoryEntry, SessionRegistry};
    use std::collections::HashMap;

    fn registry_with_history(entries: Vec<CommandHistoryEntry>) -> SessionRegistry {
        SessionRegistry {
            hosts: Vec::new(),
            host_configs: Vec::new(),
            managed_sessions: Vec::new(),
            active_session_id: String::new(),
            recent_events: Vec::new(),
            terminal_buffers: HashMap::new(),
            stream_state: HashMap::new(),
            connection_issues: HashMap::new(),
            latest_failures: HashMap::new(),
            active_commands: HashMap::new(),
            command_history: entries,
            runtimes: HashMap::new(),
            diagnosis_cache: HashMap::new(),
            event_counter: 0,
            command_counter: 0,
        }
    }

    fn history_entry(session_id: &str, exit_code: i32) -> CommandHistoryEntry {
        CommandHistoryEntry {
            id: format!("cmd-{}-{}", session_id, exit_code),
            session_id: session_id.into(),
            command: "test".into(),
            started_at: "2026-03-07T00:00:00Z".into(),
            completed_at: "2026-03-07T00:00:01Z".into(),
            exit_code,
            stderr_class: None,
            stderr_evidence: None,
            stdout_tail: Vec::new(),
            stderr_tail: Vec::new(),
        }
    }

    #[test]
    fn classifies_high_signal_stderr_patterns() {
        assert_eq!(
            classify_command_stderr_severity(&["cp: permission denied".into()]),
            Some("warning")
        );
        assert_eq!(
            classify_command_stderr_severity(&["write failed: No space left on device".into()]),
            Some("critical")
        );
        assert_eq!(
            classify_command_stderr_severity(&["dial tcp: connection refused".into()]),
            Some("critical")
        );
    }

    #[test]
    fn uses_stderr_severity_before_consecutive_failure_rule() {
        let registry = registry_with_history(vec![history_entry("session-1", 1)]);
        assert_eq!(
            command_health_status(&registry, "session-1", &["operation not permitted".into()]),
            "warning"
        );
        assert_eq!(
            command_health_status(&registry, "session-1", &["out of memory".into()]),
            "critical"
        );
    }

    #[test]
    fn falls_back_to_consecutive_failure_rule_when_stderr_has_no_match() {
        let warning_registry = registry_with_history(vec![history_entry("session-1", 1), history_entry("session-1", 1)]);
        assert_eq!(command_health_status(&warning_registry, "session-1", &[]), "warning");

        let critical_registry = registry_with_history(vec![
            history_entry("session-1", 1),
            history_entry("session-1", 2),
            history_entry("session-1", 127),
        ]);
        assert_eq!(command_health_status(&critical_registry, "session-1", &["plain failure".into()]), "critical");

        let healthy_registry = registry_with_history(vec![history_entry("session-1", 0), history_entry("session-1", 1)]);
        assert_eq!(command_health_status(&healthy_registry, "session-1", &[]), "healthy");
    }
}


