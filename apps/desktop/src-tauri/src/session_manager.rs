use serde::{Deserialize, Serialize};

use crate::session_registry;
use crate::session_registry::{HostConnectionConfig, SessionConnectionIssue, SessionLifecycleEvent};
use crate::session_store;
use crate::session_store::{RunbookActionResponse, SuggestedActionRequest, TalonWorkspaceState, TerminalSnapshot};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSessionRequest {
    pub host_id: String,
    pub address: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub auth_method: Option<String>,
    pub password: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitCommandRequest {
    pub session_id: String,
    pub command: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectSessionRequest {
    pub session_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertHostConfigRequest {
    pub host_id: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub fingerprint_hint: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteHostConfigRequest {
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
pub struct ConnectSessionResponse {
    pub session: SessionSummary,
    pub events: Vec<SessionLifecycleEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRegistryResponse {
    pub host_configs: Vec<HostConnectionConfig>,
    pub active_session_id: String,
    pub busy_session_ids: Vec<String>,
    pub active_connection_issue: Option<SessionConnectionIssue>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEventListResponse {
    pub events: Vec<SessionLifecycleEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitCommandResponse {
    pub terminal: TerminalSnapshot,
    pub events: Vec<SessionLifecycleEvent>,
    pub accepted: bool,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectSessionResponse {
    pub terminal: TerminalSnapshot,
    pub events: Vec<SessionLifecycleEvent>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostConfigMutationResponse {
    pub host_configs: Vec<HostConnectionConfig>,
}

pub fn get_workspace_state() -> TalonWorkspaceState {
    session_registry::workspace_state()
}

pub fn get_session_registry() -> SessionRegistryResponse {
    let state = session_registry::workspace_state();
    let active_session_id = state.active_session_id.clone();
    SessionRegistryResponse {
        host_configs: session_registry::list_host_configs(),
        active_session_id: active_session_id.clone(),
        busy_session_ids: session_registry::busy_session_ids(),
        active_connection_issue: session_registry::connection_issue_for(&active_session_id),
    }
}

pub fn get_session_events() -> SessionEventListResponse {
    SessionEventListResponse {
        events: session_registry::recent_events(),
    }
}

pub fn get_terminal_snapshot(session_id: String) -> TerminalSnapshot {
    session_registry::terminal_snapshot(&session_id)
}

pub fn connect_session(payload: ConnectSessionRequest) -> ConnectSessionResponse {
    let state = session_store::get_workspace_state();
    let host = state
        .hosts
        .iter()
        .find(|host| host.id == payload.host_id)
        .or_else(|| state.hosts.first())
        .expect("workspace state must include at least one host");
    let mut effective_host = host.clone();
    if let Some(address) = payload.address.as_ref().filter(|value| !value.trim().is_empty()) {
        effective_host.address = address.trim().into();
    }
    if let Some(username) = payload.username.as_ref().filter(|value| !value.trim().is_empty()) {
        let target = effective_host
            .address
            .split_once('@')
            .map(|(_, hostname)| hostname.to_string())
            .unwrap_or_else(|| effective_host.address.clone());
        effective_host.address = format!("{}@{}", username.trim(), target);
    }

    let mut host_config = session_registry::host_config_for(&host.id).unwrap_or(HostConnectionConfig {
        host_id: host.id.clone(),
        port: 22,
        username: "root".into(),
        auth_method: "agent".into(),
        fingerprint_hint: "unknown".into(),
    });
    if let Some(port) = payload.port {
        host_config.port = port;
    }
    if let Some(username) = payload.username.as_ref().filter(|value| !value.trim().is_empty()) {
        host_config.username = username.trim().into();
    }
    if let Some(auth_method) = payload.auth_method.as_ref().filter(|value| !value.trim().is_empty()) {
        host_config.auth_method = auth_method.trim().into();
    }

    let session = session_registry::connect_host(&effective_host, Some(&host_config), payload.password.as_deref());

    ConnectSessionResponse {
        session: SessionSummary {
            session_id: session.id,
            host_id: session.host_id,
            state: session.state,
            shell: session.shell,
            cwd: session.cwd,
            auto_capture_enabled: session.auto_capture_enabled,
        },
        events: session_registry::recent_events(),
    }
}

pub fn submit_session_command(payload: SubmitCommandRequest) -> SubmitCommandResponse {
    let before = session_registry::busy_session_ids();
    let accepted = !before.iter().any(|session_id| session_id == &payload.session_id);
    SubmitCommandResponse {
        terminal: session_registry::submit_command(&payload.session_id, &payload.command),
        events: session_registry::recent_events(),
        accepted,
        message: if accepted {
            format!("Queued command for {}", payload.session_id)
        } else {
            format!("Rejected command for {} because another command is still in flight", payload.session_id)
        },
    }
}

pub fn disconnect_session(payload: DisconnectSessionRequest) -> DisconnectSessionResponse {
    DisconnectSessionResponse {
        terminal: session_registry::disconnect_session(&payload.session_id),
        events: session_registry::recent_events(),
    }
}

pub fn reconnect_session(payload: ConnectSessionRequest) -> ConnectSessionResponse {
    connect_session(payload)
}

pub fn upsert_host_config(payload: UpsertHostConfigRequest) -> HostConfigMutationResponse {
    HostConfigMutationResponse {
        host_configs: session_registry::upsert_host_config(HostConnectionConfig {
            host_id: payload.host_id,
            port: payload.port,
            username: payload.username,
            auth_method: payload.auth_method,
            fingerprint_hint: payload.fingerprint_hint,
        })
        .expect("host config update must succeed"),
    }
}

pub fn delete_host_config(payload: DeleteHostConfigRequest) -> HostConfigMutationResponse {
    HostConfigMutationResponse {
        host_configs: session_registry::delete_host_config(&payload.host_id)
            .expect("host config deletion must succeed"),
    }
}

pub fn run_suggested_action(payload: SuggestedActionRequest) -> RunbookActionResponse {
    session_store::run_suggested_action(payload)
}
