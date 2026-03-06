use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedActionRequest {
    pub session_id: String,
    pub action_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunbookActionResponse {
    pub session_id: String,
    pub action_id: String,
    pub status: String,
    pub summary: String,
    pub appended_terminal_lines: Vec<String>,
}

#[derive(Serialize)]
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

#[derive(Serialize)]
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

#[derive(Serialize)]
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

#[derive(Serialize)]
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

#[derive(Serialize)]
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisMessage {
    pub id: String,
    pub source: String,
    pub tone: String,
    pub title: String,
    pub body: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedAction {
    pub id: String,
    pub label: String,
    pub command: String,
    pub rationale: String,
    pub safety_level: String,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub occurred_at: String,
    pub exit_code: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub session_id: String,
    pub lines: Vec<String>,
}

pub fn get_workspace_state() -> TalonWorkspaceState {
    TalonWorkspaceState {
        hosts: vec![
            Host {
                id: "host-prod-web-1".into(),
                label: "prod-web-1".into(),
                address: "root@10.0.0.12".into(),
                region: "sjc-1".into(),
                tags: vec!["production".into(), "edge".into()],
                status: "critical".into(),
                latency_ms: 186,
                cpu_percent: 74,
                memory_percent: 81,
                last_seen_at: "2026-03-06T13:41:32Z".into(),
            },
            Host {
                id: "host-api-gateway".into(),
                label: "api-gateway".into(),
                address: "root@10.0.0.23".into(),
                region: "hkg-1".into(),
                tags: vec!["production".into(), "api".into()],
                status: "warning".into(),
                latency_ms: 92,
                cpu_percent: 46,
                memory_percent: 67,
                last_seen_at: "2026-03-06T13:41:09Z".into(),
            },
            Host {
                id: "host-db-primary".into(),
                label: "db-primary".into(),
                address: "postgres@10.0.0.31".into(),
                region: "hkg-1".into(),
                tags: vec!["production".into(), "database".into()],
                status: "healthy".into(),
                latency_ms: 41,
                cpu_percent: 31,
                memory_percent: 54,
                last_seen_at: "2026-03-06T13:40:58Z".into(),
            },
        ],
        sessions: vec![Session {
            id: "session-a91f".into(),
            host_id: "host-prod-web-1".into(),
            state: "connected".into(),
            shell: "bash".into(),
            cwd: "/etc/nginx".into(),
            connected_at: "2026-03-06T13:36:02Z".into(),
            last_command_at: "2026-03-06T13:42:02Z".into(),
            auto_capture_enabled: true,
        }],
        active_session_id: "session-a91f".into(),
        latest_failure: FailureContext {
            id: "failure-nginx-port".into(),
            session_id: "session-a91f".into(),
            host_id: "host-prod-web-1".into(),
            command_id: "cmd-restart-nginx".into(),
            summary: "Nginx restart failed because port 80 is already occupied.".into(),
            severity: "critical".into(),
            cwd: "/etc/nginx".into(),
            shell: "bash".into(),
            exit_code: 1,
            stdout_tail: vec![
                "Job for nginx.service failed because the control process exited with error code.".into(),
                "See systemctl status nginx.service and journalctl -xeu nginx.service for details.".into(),
            ],
            stderr_tail: vec![
                "nginx[18421]: bind() to 0.0.0.0:80 failed (98: Address already in use)".into(),
                "nginx[18421]: still could not bind()".into(),
            ],
            related_artifacts: vec![
                "journalctl excerpt: 40 lines".into(),
                "port listeners snapshot".into(),
                "docker published ports".into(),
            ],
            captured_at: "2026-03-06T13:42:02Z".into(),
        },
        latest_diagnosis: DiagnosisResponse {
            id: "diag-nginx-port".into(),
            session_id: "session-a91f".into(),
            status: "critical".into(),
            confidence: 87,
            summary: "Port 80 collision is blocking nginx from rebinding on the production web node.".into(),
            likely_causes: vec![
                "docker-proxy is still publishing 0.0.0.0:80 from a legacy container".into(),
                "this is an active port conflict, not an nginx syntax error".into(),
            ],
            messages: vec![
                DiagnosisMessage {
                    id: "message-root-cause".into(),
                    source: "agent".into(),
                    tone: "critical".into(),
                    title: "Likely root cause".into(),
                    body: "The failing unit is downstream of a listener conflict on :80. Talon should treat container port ownership as the first branch in the runbook.".into(),
                },
                DiagnosisMessage {
                    id: "message-safety".into(),
                    source: "agent".into(),
                    tone: "warning".into(),
                    title: "Safe next move".into(),
                    body: "Inspect the current listener and validate nginx config before stopping anything. The product should bias toward read-only diagnostics first.".into(),
                },
                DiagnosisMessage {
                    id: "message-context".into(),
                    source: "system".into(),
                    tone: "neutral".into(),
                    title: "Captured context".into(),
                    body: "Talon bundled the failed command, stderr tail, recent journal lines, and current listener state into a single diagnosis request.".into(),
                },
            ],
            suggested_actions: vec![
                SuggestedAction {
                    id: "action-list-port-owner".into(),
                    label: "Inspect listener on :80".into(),
                    command: "sudo lsof -i :80".into(),
                    rationale: "Confirm the owning process before touching nginx or Docker.".into(),
                    safety_level: "read-only".into(),
                    status: "ready".into(),
                },
                SuggestedAction {
                    id: "action-validate-nginx".into(),
                    label: "Validate nginx config".into(),
                    command: "sudo nginx -t".into(),
                    rationale: "Separate config validity from runtime port binding failure.".into(),
                    safety_level: "read-only".into(),
                    status: "ready".into(),
                },
                SuggestedAction {
                    id: "action-review-container".into(),
                    label: "Review Docker port mapping".into(),
                    command: "docker ps --format 'table {{.Names}}\t{{.Ports}}'".into(),
                    rationale: "Identify the container publishing :80 before proposing any fix.".into(),
                    safety_level: "read-only".into(),
                    status: "ready".into(),
                },
            ],
            generated_at: "2026-03-06T13:42:04Z".into(),
        },
        timeline: vec![
            TimelineEvent {
                id: "timeline-command-1".into(),
                kind: "command".into(),
                title: "Restart attempt failed".into(),
                detail: "sudo systemctl restart nginx exited non-zero on prod-web-1".into(),
                occurred_at: "2026-03-06T13:41:08Z".into(),
                exit_code: Some(1),
            },
            TimelineEvent {
                id: "timeline-command-2".into(),
                kind: "command".into(),
                title: "Listener scan captured".into(),
                detail: "docker-proxy is bound to 0.0.0.0:80".into(),
                occurred_at: "2026-03-06T13:41:31Z".into(),
                exit_code: Some(0),
            },
            TimelineEvent {
                id: "timeline-diagnosis-1".into(),
                kind: "diagnosis".into(),
                title: "Diagnosis packet generated".into(),
                detail: "Failure context sent to the agent with stderr tail and host metadata".into(),
                occurred_at: "2026-03-06T13:42:04Z".into(),
                exit_code: None,
            },
        ],
        terminal: TerminalSnapshot {
            session_id: "session-a91f".into(),
            lines: vec![
                "$ sudo systemctl restart nginx".into(),
                "Job for nginx.service failed because the control process exited with error code.".into(),
                "See systemctl status nginx.service and journalctl -xeu nginx.service for details.".into(),
                "".into(),
                "$ sudo journalctl -u nginx -n 40 --no-pager".into(),
                "nginx[18421]: bind() to 0.0.0.0:80 failed (98: Address already in use)".into(),
                "nginx[18421]: still could not bind()".into(),
                "".into(),
                "$ sudo ss -ltnp | grep :80".into(),
                "LISTEN 0 4096 0.0.0.0:80 0.0.0.0:* users:((\"docker-proxy\",pid=17302,fd=7))".into(),
            ],
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
