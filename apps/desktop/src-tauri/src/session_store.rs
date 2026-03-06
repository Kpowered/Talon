use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedActionRequest {
    pub session_id: String,
    pub action_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunbookActionResponse {
    pub session_id: String,
    pub action_id: String,
    pub status: String,
    pub summary: String,
    pub appended_terminal_lines: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TalonWorkspaceState {
    pub hosts: Vec<Host>,
    pub sessions: Vec<Session>,
    pub active_session_id: String,
    pub latest_failure: FailureContext,
    pub latest_diagnosis: DiagnosisResponse,
    pub timeline: Vec<TimelineEvent>,
    pub terminal: TerminalSnapshot,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Host {
    pub id: String,
    pub label: String,
    pub address: String,
    pub region: String,
    pub tags: Vec<String>,
    pub status: String,
    pub latency_ms: u32,
    pub cpu_percent: u8,
    pub memory_percent: u8,
    pub last_seen_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub host_id: String,
    pub state: String,
    pub shell: String,
    pub cwd: String,
    pub connected_at: String,
    pub last_command_at: String,
    pub auto_capture_enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureContext {
    pub id: String,
    pub session_id: String,
    pub host_id: String,
    pub command_id: String,
    pub summary: String,
    pub severity: String,
    pub cwd: String,
    pub shell: String,
    pub exit_code: i32,
    pub stdout_tail: Vec<String>,
    pub stderr_tail: Vec<String>,
    pub related_artifacts: Vec<String>,
    pub captured_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisResponse {
    pub id: String,
    pub session_id: String,
    pub status: String,
    pub confidence: u8,
    pub summary: String,
    pub likely_causes: Vec<String>,
    pub messages: Vec<DiagnosisMessage>,
    pub suggested_actions: Vec<SuggestedAction>,
    pub generated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisMessage {
    pub id: String,
    pub source: String,
    pub tone: String,
    pub title: String,
    pub body: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedAction {
    pub id: String,
    pub label: String,
    pub command: String,
    pub rationale: String,
    pub safety_level: String,
    pub status: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub occurred_at: String,
    pub exit_code: Option<i32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub session_id: String,
    pub lines: Vec<String>,
}

pub fn get_workspace_state() -> TalonWorkspaceState {
    TalonWorkspaceState {
        hosts: vec![],
        sessions: vec![Session {
            id: "session-a91f".into(),
            host_id: "host-prod-web-1".into(),
            state: "disconnected".into(),
            shell: "sh".into(),
            cwd: "~".into(),
            connected_at: "2026-03-06T13:36:02Z".into(),
            last_command_at: "2026-03-06T13:42:02Z".into(),
            auto_capture_enabled: true,
        }],
        active_session_id: "session-a91f".into(),
        latest_failure: FailureContext {
            id: "failure-placeholder".into(),
            session_id: "session-a91f".into(),
            host_id: "host-prod-web-1".into(),
            command_id: "cmd-placeholder".into(),
            summary: "No live failure has been captured for the active session yet.".into(),
            severity: "warning".into(),
            cwd: "~".into(),
            shell: "sh".into(),
            exit_code: 0,
            stdout_tail: vec![],
            stderr_tail: vec![],
            related_artifacts: vec!["Waiting for a real non-zero command exit or connection issue.".into()],
            captured_at: "2026-03-06T13:42:02Z".into(),
        },
        latest_diagnosis: DiagnosisResponse {
            id: "diag-placeholder".into(),
            session_id: "session-a91f".into(),
            status: "warning".into(),
            confidence: 42,
            summary: "Open a managed session and run a read-only command to begin collecting live context.".into(),
            likely_causes: vec![
                "No connection issue or non-zero command has been captured yet.".into(),
                "Current diagnosis content is a neutral placeholder until live runtime evidence exists.".into(),
            ],
            messages: vec![
                DiagnosisMessage {
                    id: "message-placeholder-status".into(),
                    source: "system".into(),
                    tone: "neutral".into(),
                    title: "No live incident yet".into(),
                    body: "Talon will replace this placeholder once a connection issue or non-zero command is captured from the active SSH session.".into(),
                },
                DiagnosisMessage {
                    id: "message-placeholder-safety".into(),
                    source: "system".into(),
                    tone: "warning".into(),
                    title: "Safe next move".into(),
                    body: "Connect to a host and start with read-only commands such as pwd, whoami, or service status checks.".into(),
                },
            ],
            suggested_actions: vec![
                SuggestedAction {
                    id: "action-print-working-dir".into(),
                    label: "Print working directory".into(),
                    command: "pwd".into(),
                    rationale: "Confirm remote shell bootstrap and current working directory.".into(),
                    safety_level: "read-only".into(),
                    status: "ready".into(),
                },
                SuggestedAction {
                    id: "action-inspect-user".into(),
                    label: "Inspect current user".into(),
                    command: "whoami".into(),
                    rationale: "Verify the execution identity before deeper troubleshooting.".into(),
                    safety_level: "read-only".into(),
                    status: "ready".into(),
                },
                SuggestedAction {
                    id: "action-inspect-shell".into(),
                    label: "Inspect shell".into(),
                    command: "echo ${SHELL:-sh}".into(),
                    rationale: "Validate which shell Talon is interacting with for command framing.".into(),
                    safety_level: "read-only".into(),
                    status: "ready".into(),
                },
            ],
            generated_at: "2026-03-06T13:42:04Z".into(),
        },
        timeline: vec![],
        terminal: TerminalSnapshot {
            session_id: "session-a91f".into(),
            lines: vec!["Connect a host to start a real SSH session.".into()],
        },
    }
}

pub fn run_suggested_action(payload: SuggestedActionRequest) -> RunbookActionResponse {
    let (summary, lines) = match payload.action_id.as_str() {
        "action-validate-nginx" => (
            "nginx config is syntactically valid, which narrows the incident to runtime port ownership.",
            vec![
                "$ sudo nginx -t".into(),
                "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok".into(),
                "nginx: configuration file /etc/nginx/nginx.conf test is successful".into(),
            ],
        ),
        "action-review-container" => (
            "A legacy certbot container is still publishing port 80, so Docker remains the blocking dependency.",
            vec![
                "$ docker ps --format 'table {{.Names}}\t{{.Ports}}'".into(),
                "NAMES            PORTS".into(),
                "legacy-certbot   0.0.0.0:80->80/tcp, :::80->80/tcp".into(),
            ],
        ),
        _ => (
            "docker-proxy still owns :80. Talon should keep recommending read-only inspection until the operator confirms the next mutation.",
            vec![
                "$ sudo lsof -i :80".into(),
                "COMMAND      PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME".into(),
                "docker-proxy 17302 root    7u  IPv4  42119      0t0  TCP *:http (LISTEN)".into(),
            ],
        ),
    };

    RunbookActionResponse {
        session_id: payload.session_id,
        action_id: payload.action_id,
        status: "critical".into(),
        summary: summary.into(),
        appended_terminal_lines: lines,
    }
}
