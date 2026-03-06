use serde::{Deserialize, Serialize};

use crate::session_store;
use crate::session_store::{RunbookActionResponse, SuggestedActionRequest, TalonWorkspaceState};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSessionRequest {
    pub host_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub host_id: String,
    pub state: String,
    pub shell: String,
    pub cwd: String,
    pub auto_capture_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLifecycleEvent {
    pub id: String,
    pub session_id: String,
    pub event_type: String,
    pub detail: String,
    pub occurred_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSessionResponse {
    pub session: SessionSummary,
    pub events: Vec<SessionLifecycleEvent>,
}

pub fn get_workspace_state() -> TalonWorkspaceState {
    session_store::get_workspace_state()
}

pub fn connect_session(payload: ConnectSessionRequest) -> ConnectSessionResponse {
    let state = session_store::get_workspace_state();
    let host = state
        .hosts
        .iter()
        .find(|host| host.id == payload.host_id)
        .or_else(|| state.hosts.first())
        .expect("workspace state must include at least one host");

    let session = SessionSummary {
        session_id: format!("session-preview-{}", host.id),
        host_id: host.id.clone(),
        state: if host.status == "critical" {
            "degraded".into()
        } else {
            "connected".into()
        },
        shell: "bash".into(),
        cwd: format!("/srv/{}", host.label),
        auto_capture_enabled: true,
    };

    let events = vec![
        SessionLifecycleEvent {
            id: format!("event-connect-start-{}", host.id),
            session_id: session.session_id.clone(),
            event_type: "connected".into(),
            detail: format!("Connected preview session to {}", host.address),
            occurred_at: "2026-03-06T14:02:10Z".into(),
        },
        SessionLifecycleEvent {
            id: format!("event-shell-ready-{}", host.id),
            session_id: session.session_id.clone(),
            event_type: "shell-ready".into(),
            detail: format!("Shell {} ready in {}", session.shell, session.cwd),
            occurred_at: "2026-03-06T14:02:11Z".into(),
        },
        SessionLifecycleEvent {
            id: format!("event-capture-mode-{}", host.id),
            session_id: session.session_id.clone(),
            event_type: "capture-mode".into(),
            detail: "Automatic failure capture armed for non-zero exits".into(),
            occurred_at: "2026-03-06T14:02:12Z".into(),
        },
    ];

    ConnectSessionResponse { session, events }
}

pub fn run_suggested_action(payload: SuggestedActionRequest) -> RunbookActionResponse {
    session_store::run_suggested_action(payload)
}
