use crate::session_registry::{
    CommandHistoryEntry, ManagedSessionRecord, SessionConnectionIssue, SessionLifecycleEvent,
};
use crate::session_store::{
    DiagnosisMessage, DiagnosisResponse, FailureContext, SuggestedAction, TimelineEvent,
};

fn stderr_class_causes(stderr_class: Option<&str>) -> Vec<String> {
    match stderr_class {
        Some("filesystem") => vec![
            "The captured stderr points to filesystem capacity or writeability problems on the remote host.".into(),
            "Inspect disk usage, mount flags, and quota state before retrying the failing command.".into(),
        ],
        Some("resource-pressure") => vec![
            "The captured stderr points to memory pressure or process termination under resource exhaustion.".into(),
            "Inspect memory availability and recent process kills before rerunning workload-heavy commands.".into(),
        ],
        Some("network-path") => vec![
            "The captured stderr points to a network-path or upstream reachability failure during command execution.".into(),
            "Verify DNS, target ports, and remote dependency reachability from the affected host.".into(),
        ],
        Some("permission") => vec![
            "The captured stderr points to permissions or execution policy preventing the command from completing.".into(),
            "Verify execution identity, file ownership, and required privileges before retrying.".into(),
        ],
        _ => vec![
            "The remote command returned a non-zero status and needs context-specific inspection.".into(),
            "Use the captured stdout/stderr tails to decide whether the failure is environmental, auth-related, or command-specific.".into(),
        ],
    }
}

fn stderr_class_message(stderr_class: Option<&str>) -> (String, String) {
    match stderr_class {
        Some("filesystem") => (
            "Filesystem pressure detected".into(),
            "Read-only checks should focus on disk usage, mount state, and quota or read-only filesystem signals.".into(),
        ),
        Some("resource-pressure") => (
            "Resource pressure detected".into(),
            "Read-only checks should focus on memory availability, recent kills, and workload pressure on the host.".into(),
        ),
        Some("network-path") => (
            "Network-path failure detected".into(),
            "Read-only checks should focus on outbound connectivity, dependency ports, and name resolution from the remote host.".into(),
        ),
        Some("permission") => (
            "Permission failure detected".into(),
            "Read-only checks should focus on who is running the command, effective groups, and file or directory permissions.".into(),
        ),
        _ => (
            "Suggested next step".into(),
            "Inspect read-only environment and command context before re-running or mutating anything on the target host.".into(),
        ),
    }
}

fn stderr_class_actions(stderr_class: Option<&str>) -> Vec<SuggestedAction> {
    match stderr_class {
        Some("filesystem") => vec![
            SuggestedAction {
                id: "action-check-disk-usage".into(),
                label: "Check disk usage".into(),
                command: "df -h && df -i".into(),
                rationale: "Inspect capacity and inode pressure without mutating host state.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
            SuggestedAction {
                id: "action-check-mount-flags".into(),
                label: "Check mount flags".into(),
                command: "mount | tail -n +1".into(),
                rationale: "Confirm whether the target filesystem is mounted read-only or under an unexpected device.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
        ],
        Some("resource-pressure") => vec![
            SuggestedAction {
                id: "action-check-memory".into(),
                label: "Check memory".into(),
                command: "free -h && vmstat 1 5".into(),
                rationale: "Inspect current memory pressure and reclaim behavior without changing host state.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
            SuggestedAction {
                id: "action-check-dmesg-kills".into(),
                label: "Check recent kills".into(),
                command: "dmesg | tail -n 50".into(),
                rationale: "Look for OOM or kernel kill signals around the failure window.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
        ],
        Some("network-path") => vec![
            SuggestedAction {
                id: "action-check-resolver".into(),
                label: "Check resolver".into(),
                command: "getent hosts localhost && cat /etc/resolv.conf".into(),
                rationale: "Inspect name-resolution baseline from the remote host.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
            SuggestedAction {
                id: "action-check-sockets".into(),
                label: "Check sockets".into(),
                command: "ss -tuna | tail -n 30".into(),
                rationale: "Inspect recent socket state before assuming the dependency is reachable.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
        ],
        Some("permission") => vec![
            SuggestedAction {
                id: "action-check-identity".into(),
                label: "Check identity".into(),
                command: "id && umask".into(),
                rationale: "Verify the effective user, groups, and default permission mask.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
            SuggestedAction {
                id: "action-check-target-perms".into(),
                label: "Check target perms".into(),
                command: "pwd && ls -ld . && ls -l".into(),
                rationale: "Inspect the current directory and nearby file permissions without modifying state.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
        ],
        _ => vec![
            SuggestedAction {
                id: "action-print-working-dir".into(),
                label: "Print working directory".into(),
                command: "pwd".into(),
                rationale: "Confirm the shell remained in the directory Talon captured at failure time.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
            SuggestedAction {
                id: "action-inspect-identity".into(),
                label: "Inspect user and shell".into(),
                command: "whoami && echo $SHELL".into(),
                rationale: "Validate execution identity and shell assumptions before deeper diagnosis.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
            SuggestedAction {
                id: "action-check-last-status".into(),
                label: "Check last status context".into(),
                command: "printf 'cwd=%s shell=%s\n' \"$PWD\" \"${SHELL:-sh}\"".into(),
                rationale: "Reconfirm shell context without changing remote state.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
        ],
    }
}

pub fn build_failure_context(
    session_id: &str,
    session: Option<&ManagedSessionRecord>,
    command: &CommandHistoryEntry,
) -> FailureContext {
    let (host_id, shell, cwd) = session
        .map(|session| {
            (
                session.host_id.clone(),
                session.shell.clone(),
                session.cwd.clone(),
            )
        })
        .unwrap_or_else(|| ("unknown-host".into(), "sh".into(), "~".into()));
    let interrupted = command.exit_code == 130;
    let severity = if interrupted || command.exit_code == 1 {
        "warning"
    } else {
        "critical"
    };
    let summary = if interrupted {
        format!(
            "Command '{}' was interrupted by the operator on {}.",
            command.command, host_id
        )
    } else {
        format!(
            "Command '{}' exited with status {} on {}.",
            command.command, command.exit_code, host_id
        )
    };
    let outcome = if interrupted {
        "outcome: operator-interrupted".into()
    } else {
        format!("outcome: exit-{}", command.exit_code)
    };

    FailureContext {
        id: format!("failure-{}", command.id),
        session_id: session_id.into(),
        host_id: host_id.clone(),
        command_id: command.id.clone(),
        summary,
        severity: severity.into(),
        stderr_class: command.stderr_class.clone(),
        stderr_evidence: command.stderr_evidence.clone(),
        cwd,
        shell,
        exit_code: command.exit_code,
        stdout_tail: command.stdout_tail.clone(),
        stderr_tail: command.stderr_tail.clone(),
        related_artifacts: vec![
            format!("command: {}", command.command),
            format!("captured from live SSH session {}", session_id),
            outcome,
            command
                .stderr_class
                .as_ref()
                .map(|class| format!("stderr-class: {}", class))
                .unwrap_or_else(|| "stderr-class: none".into()),
            command
                .stderr_evidence
                .as_ref()
                .map(|evidence| format!("stderr-evidence: {}", evidence))
                .unwrap_or_else(|| "stderr-evidence: none".into()),
        ],
        captured_at: command.completed_at.clone(),
    }
}

pub fn build_diagnosis_from_failure(failure: &FailureContext) -> DiagnosisResponse {
    let stderr_class = failure.stderr_class.as_deref();
    let likely_causes = stderr_class_causes(stderr_class);
    let (next_title, next_body) = stderr_class_message(stderr_class);
    let suggested_actions = stderr_class_actions(stderr_class);

    DiagnosisResponse {
        id: format!("diag-{}", failure.id),
        session_id: failure.session_id.clone(),
        status: failure.severity.clone(),
        confidence: 72,
        summary: format!(
            "Talon captured a live non-zero exit for {} in {}{}.",
            failure.host_id,
            failure.cwd,
            failure
                .stderr_class
                .as_ref()
                .map(|class| format!(" with {} stderr signals", class))
                .unwrap_or_default()
        ),
        likely_causes,
        messages: vec![
            DiagnosisMessage {
                id: format!("message-{}-capture", failure.id),
                source: "system".into(),
                tone: failure.severity.clone(),
                title: "Live failure captured".into(),
                body: format!(
                    "Talon packaged exit code {}, cwd {}, and the latest stdout/stderr tails from the managed SSH session{}{}.",
                    failure.exit_code,
                    failure.cwd,
                    failure
                        .stderr_class
                        .as_ref()
                        .map(|class| format!(", including '{}' stderr classification", class))
                        .unwrap_or_default(),
                    failure
                        .stderr_evidence
                        .as_ref()
                        .map(|evidence| format!(" Evidence: {}", evidence))
                        .unwrap_or_default()
                ),
            },
            DiagnosisMessage {
                id: format!("message-{}-next", failure.id),
                source: "system".into(),
                tone: "warning".into(),
                title: next_title,
                body: next_body,
            },
        ],
        suggested_actions,
        provider: "rule-engine".into(),
        error_message: None,
        context_packet_id: format!("packet-{}", failure.id),
        generated_at: failure.captured_at.clone(),
    }
}

pub fn build_diagnosis_from_connection_issue(issue: &SessionConnectionIssue) -> DiagnosisResponse {
    DiagnosisResponse {
        id: format!("diag-connection-{}", issue.session_id),
        session_id: issue.session_id.clone(),
        status: if issue.kind == "host-trust" || issue.kind == "auth" {
            "warning".into()
        } else {
            "critical".into()
        },
        confidence: 83,
        summary: issue.title.clone(),
        likely_causes: vec![issue.summary.clone(), issue.operator_action.clone()],
        messages: vec![
            DiagnosisMessage {
                id: format!("message-{}-connection", issue.session_id),
                source: "system".into(),
                tone: if issue.kind == "host-trust" || issue.kind == "auth" {
                    "warning".into()
                } else {
                    "critical".into()
                },
                title: issue.title.clone(),
                body: issue.summary.clone(),
            },
            DiagnosisMessage {
                id: format!("message-{}-operator", issue.session_id),
                source: "system".into(),
                tone: "neutral".into(),
                title: "Operator action".into(),
                body: issue.operator_action.clone(),
            },
        ],
        suggested_actions: vec![SuggestedAction {
            id: format!("action-connection-{}", issue.session_id),
            label: issue
                .in_app_action_label
                .clone()
                .unwrap_or_else(|| "Run suggested check".into()),
            command: issue.suggested_command.clone(),
            rationale: "Use the captured connection issue details before retrying the session."
                .into(),
            safety_level: "read-only".into(),
            status: if issue.in_app_action_kind.is_some() {
                "ready".into()
            } else {
                "ready".into()
            },
        }],
        provider: "rule-engine".into(),
        error_message: None,
        context_packet_id: format!("packet-{}-{}", issue.session_id, issue.kind),
        generated_at: issue.observed_at.clone(),
    }
}

pub fn timeline_for_session(
    command_history: &[CommandHistoryEntry],
    session_id: &str,
    failure: Option<&FailureContext>,
    connection_issue: Option<&SessionConnectionIssue>,
    recent_events: &[SessionLifecycleEvent],
) -> Vec<TimelineEvent> {
    let mut timeline: Vec<TimelineEvent> = command_history
        .iter()
        .filter(|entry| entry.session_id == session_id)
        .take(8)
        .map(|entry| TimelineEvent {
            id: format!("timeline-{}", entry.id),
            kind: "command".into(),
            title: entry.command.clone(),
            detail: format!(
                "Started at {}, completed at {}, exit {}, stdout lines {}, stderr lines {}{}{}",
                entry.started_at,
                entry.completed_at,
                entry.exit_code,
                entry.stdout_tail.len(),
                entry.stderr_tail.len(),
                entry
                    .stderr_class
                    .as_ref()
                    .map(|class| format!(", stderr class {}", class))
                    .unwrap_or_default(),
                entry
                    .stderr_evidence
                    .as_ref()
                    .map(|evidence| format!(", evidence {}", evidence))
                    .unwrap_or_default()
            ),
            stderr_class: entry.stderr_class.clone(),
            stderr_evidence: entry.stderr_evidence.clone(),
            occurred_at: entry.completed_at.clone(),
            exit_code: Some(entry.exit_code),
        })
        .collect();

    if let Some(failure) = failure {
        timeline.insert(
            0,
            TimelineEvent {
                id: format!("timeline-{}", failure.id),
                kind: "diagnosis".into(),
                title: "Failure context captured".into(),
                detail: format!(
                    "Captured stdout/stderr tails for command {} with exit {}{}{}",
                    failure.command_id,
                    failure.exit_code,
                    failure
                        .stderr_class
                        .as_ref()
                        .map(|class| format!(" and stderr class {}", class))
                        .unwrap_or_default(),
                    failure
                        .stderr_evidence
                        .as_ref()
                        .map(|evidence| format!(" and evidence {}", evidence))
                        .unwrap_or_default()
                ),
                stderr_class: failure.stderr_class.clone(),
                stderr_evidence: failure.stderr_evidence.clone(),
                occurred_at: failure.captured_at.clone(),
                exit_code: None,
            },
        );
    }

    if let Some(issue) = connection_issue {
        timeline.insert(
            0,
            TimelineEvent {
                id: format!("timeline-connection-{}", issue.session_id),
                kind: "diagnosis".into(),
                title: issue.title.clone(),
                detail: format!(
                    "{} Suggested check: {}",
                    issue.summary, issue.suggested_command
                ),
                stderr_class: Some(issue.kind.clone()),
                stderr_evidence: Some(issue.summary.clone()),
                occurred_at: issue.observed_at.clone(),
                exit_code: None,
            },
        );
    }

    if timeline.is_empty() {
        timeline.extend(
            recent_events
                .iter()
                .filter(|event| event.session_id == session_id)
                .take(8)
                .map(|event| TimelineEvent {
                    id: format!("timeline-event-{}", event.id),
                    kind: "action".into(),
                    title: event.event_type.replace('-', " "),
                    detail: event.detail.clone(),
                    stderr_class: None,
                    stderr_evidence: None,
                    occurred_at: event.occurred_at.clone(),
                    exit_code: None,
                }),
        );
    }

    timeline
}

#[cfg(test)]
mod tests {
    use super::{build_diagnosis_from_failure, timeline_for_session};
    use crate::session_registry::{CommandHistoryEntry, SessionConnectionIssue};
    use crate::session_store::FailureContext;

    fn sample_failure(stderr_class: Option<&str>) -> FailureContext {
        FailureContext {
            id: "failure-1".into(),
            session_id: "session-1".into(),
            host_id: "host-1".into(),
            command_id: "cmd-1".into(),
            summary: "failed".into(),
            severity: "critical".into(),
            stderr_class: stderr_class.map(|value| value.into()),
            stderr_evidence: stderr_class.map(|value| format!("matched: {}", value)),
            cwd: "/srv/app".into(),
            shell: "/bin/bash".into(),
            exit_code: 1,
            stdout_tail: Vec::new(),
            stderr_tail: Vec::new(),
            related_artifacts: Vec::new(),
            captured_at: "2026-03-07T00:00:00Z".into(),
        }
    }

    #[test]
    fn builds_filesystem_specific_actions() {
        let diagnosis = build_diagnosis_from_failure(&sample_failure(Some("filesystem")));
        assert!(diagnosis.summary.contains("filesystem"));
        assert_eq!(diagnosis.suggested_actions[0].command, "df -h && df -i");
        assert!(diagnosis.likely_causes[0].contains("filesystem"));
    }

    #[test]
    fn falls_back_to_generic_actions_without_stderr_class() {
        let diagnosis = build_diagnosis_from_failure(&sample_failure(None));
        assert_eq!(diagnosis.suggested_actions[0].command, "pwd");
        assert!(diagnosis.messages[1].title.contains("Suggested next step"));
    }

    #[test]
    fn projects_stderr_evidence_into_timeline_details() {
        let history = vec![CommandHistoryEntry {
            id: "cmd-1".into(),
            session_id: "session-1".into(),
            command: "cp file target".into(),
            started_at: "2026-03-07T00:00:00Z".into(),
            completed_at: "2026-03-07T00:00:01Z".into(),
            exit_code: 1,
            stderr_class: Some("filesystem".into()),
            stderr_evidence: Some("cp: No space left on device".into()),
            stdout_tail: Vec::new(),
            stderr_tail: Vec::new(),
        }];

        let failure = sample_failure(Some("filesystem"));
        let timeline = timeline_for_session(&history, "session-1", Some(&failure), None, &[]);

        assert!(timeline[0].detail.contains("stderr class filesystem"));
        assert!(timeline[0].detail.contains("evidence matched: filesystem"));
        assert!(timeline[1]
            .detail
            .contains("evidence cp: No space left on device"));
    }

    #[test]
    fn projects_connection_issue_into_structured_timeline_signal() {
        let issue = SessionConnectionIssue {
            session_id: "session-1".into(),
            kind: "network".into(),
            title: "SSH network path failed".into(),
            summary: "connection refused".into(),
            operator_action: "check route".into(),
            suggested_command: "ssh -vvv host".into(),
            observed_at: "2026-03-07T00:00:02Z".into(),
            fingerprint: None,
            expected_fingerprint_hint: None,
            host: Some("root@example-host".into()),
            port: Some(22),
            can_trust_in_app: false,
            in_app_action_kind: None,
            in_app_action_label: None,
        };

        let timeline = timeline_for_session(&[], "session-1", None, Some(&issue), &[]);
        assert_eq!(timeline[0].stderr_class.as_deref(), Some("network"));
        assert_eq!(
            timeline[0].stderr_evidence.as_deref(),
            Some("connection refused")
        );
    }
}
