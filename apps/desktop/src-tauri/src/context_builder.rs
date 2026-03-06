use crate::session_registry::{CommandHistoryEntry, ManagedSessionRecord};
use crate::session_store::{
    DiagnosisMessage, DiagnosisResponse, FailureContext, SuggestedAction, TimelineEvent,
};

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
    let severity = if command.exit_code == 1 { "warning" } else { "critical" };

    FailureContext {
        id: format!("failure-{}", command.id),
        session_id: session_id.into(),
        host_id: host_id.clone(),
        command_id: command.id.clone(),
        summary: format!(
            "Command '{}' exited with status {} on {}.",
            command.command, command.exit_code, host_id
        ),
        severity: severity.into(),
        cwd,
        shell,
        exit_code: command.exit_code,
        stdout_tail: command.stdout_tail.clone(),
        stderr_tail: command.stderr_tail.clone(),
        related_artifacts: vec![
            format!("command: {}", command.command),
            format!("captured from live SSH session {}", session_id),
        ],
        captured_at: command.completed_at.clone(),
    }
}

pub fn build_diagnosis_from_failure(failure: &FailureContext) -> DiagnosisResponse {
    DiagnosisResponse {
        id: format!("diag-{}", failure.id),
        session_id: failure.session_id.clone(),
        status: failure.severity.clone(),
        confidence: 72,
        summary: format!(
            "Talon captured a live non-zero exit for {} in {}.",
            failure.host_id, failure.cwd
        ),
        likely_causes: vec![
            "The remote command returned a non-zero status and needs context-specific inspection.".into(),
            "Use the captured stdout/stderr tails to decide whether the failure is environmental, auth-related, or command-specific.".into(),
        ],
        messages: vec![
            DiagnosisMessage {
                id: format!("message-{}-capture", failure.id),
                source: "system".into(),
                tone: failure.severity.clone(),
                title: "Live failure captured".into(),
                body: format!(
                    "Talon packaged exit code {}, cwd {}, and the latest stdout/stderr tails from the managed SSH session.",
                    failure.exit_code, failure.cwd
                ),
            },
            DiagnosisMessage {
                id: format!("message-{}-next", failure.id),
                source: "system".into(),
                tone: "warning".into(),
                title: "Suggested next step".into(),
                body: "Inspect read-only environment and command context before re-running or mutating anything on the target host.".into(),
            },
        ],
        suggested_actions: vec![
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
                command: "printf 'cwd=%s shell=%s\\n' \"$PWD\" \"${SHELL:-sh}\"".into(),
                rationale: "Reconfirm shell context without changing remote state.".into(),
                safety_level: "read-only".into(),
                status: "ready".into(),
            },
        ],
        generated_at: failure.captured_at.clone(),
    }
}

pub fn timeline_for_session(
    command_history: &[CommandHistoryEntry],
    session_id: &str,
    failure: Option<&FailureContext>,
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
                "Started at {}, completed at {}, exit {}, stdout lines {}, stderr lines {}",
                entry.started_at,
                entry.completed_at,
                entry.exit_code,
                entry.stdout_tail.len(),
                entry.stderr_tail.len()
            ),
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
                    "Captured stdout/stderr tails for command {} with exit {}",
                    failure.command_id, failure.exit_code
                ),
                occurred_at: failure.captured_at.clone(),
                exit_code: None,
            },
        );
    }

    timeline
}
