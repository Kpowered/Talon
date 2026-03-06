use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

use crate::session_store::{self, Host, Session, TalonWorkspaceState, TerminalSnapshot};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostConnectionConfig {
    pub host_id: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub fingerprint_hint: String,
}

#[derive(Clone)]
pub struct ManagedSessionRecord {
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
pub struct SessionLifecycleEvent {
    pub id: String,
    pub session_id: String,
    pub event_type: String,
    pub detail: String,
    pub occurred_at: String,
}

#[derive(Clone)]
pub struct CommandHistoryEntry {
    pub session_id: String,
    pub command: String,
    pub occurred_at: String,
}

pub struct SessionRegistry {
    pub host_configs: Vec<HostConnectionConfig>,
    pub managed_sessions: Vec<ManagedSessionRecord>,
    pub active_session_id: String,
    pub recent_events: Vec<SessionLifecycleEvent>,
    pub terminal_buffers: HashMap<String, Vec<String>>,
    pub command_history: Vec<CommandHistoryEntry>,
}

static REGISTRY: OnceLock<Mutex<SessionRegistry>> = OnceLock::new();

fn default_host_configs() -> Vec<HostConnectionConfig> {
    vec![
        HostConnectionConfig {
            host_id: "host-prod-web-1".into(),
            port: 22,
            username: "root".into(),
            auth_method: "agent".into(),
            fingerprint_hint: "SHA256:prod-web-1".into(),
        },
        HostConnectionConfig {
            host_id: "host-api-gateway".into(),
            port: 22,
            username: "root".into(),
            auth_method: "agent".into(),
            fingerprint_hint: "SHA256:api-gateway".into(),
        },
        HostConnectionConfig {
            host_id: "host-db-primary".into(),
            port: 22,
            username: "postgres".into(),
            auth_method: "private-key".into(),
            fingerprint_hint: "SHA256:db-primary".into(),
        },
    ]
}

fn default_session() -> ManagedSessionRecord {
    ManagedSessionRecord {
        id: "session-a91f".into(),
        host_id: "host-prod-web-1".into(),
        state: "connected".into(),
        shell: "bash".into(),
        cwd: "/etc/nginx".into(),
        connected_at: "2026-03-06T13:36:02Z".into(),
        last_command_at: "2026-03-06T13:42:02Z".into(),
        auto_capture_enabled: true,
    }
}

fn default_events() -> Vec<SessionLifecycleEvent> {
    vec![
        SessionLifecycleEvent {
            id: "event-bootstrap-connected".into(),
            session_id: "session-a91f".into(),
            event_type: "connected".into(),
            detail: "Bootstrap mock session loaded for prod-web-1".into(),
            occurred_at: "2026-03-06T13:36:02Z".into(),
        },
        SessionLifecycleEvent {
            id: "event-bootstrap-capture".into(),
            session_id: "session-a91f".into(),
            event_type: "capture-mode".into(),
            detail: "Automatic failure capture armed for non-zero exits".into(),
            occurred_at: "2026-03-06T13:36:03Z".into(),
        },
    ]
}

fn default_terminal_buffer() -> Vec<String> {
    vec![
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
    ]
}

fn registry() -> &'static Mutex<SessionRegistry> {
    REGISTRY.get_or_init(|| {
        let default_session = default_session();
        let mut terminal_buffers = HashMap::new();
        terminal_buffers.insert(default_session.id.clone(), default_terminal_buffer());

        Mutex::new(SessionRegistry {
            host_configs: default_host_configs(),
            managed_sessions: vec![default_session.clone()],
            active_session_id: default_session.id.clone(),
            recent_events: default_events(),
            terminal_buffers,
            command_history: Vec::new(),
        })
    })
}

pub fn list_host_configs() -> Vec<HostConnectionConfig> {
    registry().lock().expect("session registry lock poisoned").host_configs.clone()
}

pub fn recent_events() -> Vec<SessionLifecycleEvent> {
    registry().lock().expect("session registry lock poisoned").recent_events.clone()
}

pub fn terminal_snapshot(session_id: &str) -> TerminalSnapshot {
    let registry = registry().lock().expect("session registry lock poisoned");
    let lines = registry
        .terminal_buffers
        .get(session_id)
        .cloned()
        .or_else(|| registry.terminal_buffers.get(&registry.active_session_id).cloned())
        .unwrap_or_default();

    TerminalSnapshot {
        session_id: session_id.into(),
        lines,
    }
}

pub fn connect_host(host: &Host) -> ManagedSessionRecord {
    let mut registry = registry().lock().expect("session registry lock poisoned");
    let session_id = format!("session-{}", host.id);

    let record = ManagedSessionRecord {
        id: session_id.clone(),
        host_id: host.id.clone(),
        state: if host.status == "critical" {
            "degraded".into()
        } else {
            "connected".into()
        },
        shell: "bash".into(),
        cwd: format!("/srv/{}", host.label),
        connected_at: "2026-03-06T14:15:10Z".into(),
        last_command_at: "2026-03-06T14:15:10Z".into(),
        auto_capture_enabled: true,
    };

    registry.managed_sessions.retain(|session| session.host_id != host.id);
    registry.managed_sessions.insert(0, record.clone());
    registry.active_session_id = record.id.clone();
    registry.terminal_buffers.insert(
        record.id.clone(),
        vec![
            format!("$ ssh {}@{}", record.shell, host.address),
            format!("Connected to {} on port 22", host.address),
            format!("{} ready in {}", record.shell, record.cwd),
        ],
    );
    registry.recent_events = vec![
        SessionLifecycleEvent {
            id: format!("event-connect-start-{}", host.id),
            session_id: record.id.clone(),
            event_type: "connected".into(),
            detail: format!("Connected managed preview session to {}", host.address),
            occurred_at: "2026-03-06T14:15:10Z".into(),
        },
        SessionLifecycleEvent {
            id: format!("event-shell-ready-{}", host.id),
            session_id: record.id.clone(),
            event_type: "shell-ready".into(),
            detail: format!("Shell {} ready in {}", record.shell, record.cwd),
            occurred_at: "2026-03-06T14:15:11Z".into(),
        },
        SessionLifecycleEvent {
            id: format!("event-capture-mode-{}", host.id),
            session_id: record.id.clone(),
            event_type: "capture-mode".into(),
            detail: "Automatic failure capture armed for non-zero exits".into(),
            occurred_at: "2026-03-06T14:15:12Z".into(),
        },
    ];

    record
}

pub fn submit_command(session_id: &str, command: &str) -> TerminalSnapshot {
    let mut registry = registry().lock().expect("session registry lock poisoned");
    let trimmed = command.trim();
    let lines = registry
        .terminal_buffers
        .entry(session_id.into())
        .or_insert_with(Vec::new);

    lines.push(format!("$ {}", trimmed));
    lines.push(format!("preview: command '{}' accepted by managed session", trimmed));
    lines.push("preview: live SSH output will stream here once the backend transport is wired".into());

    registry.command_history.insert(
        0,
        CommandHistoryEntry {
            session_id: session_id.into(),
            command: trimmed.into(),
            occurred_at: "2026-03-06T14:22:10Z".into(),
        },
    );

    if let Some(session) = registry.managed_sessions.iter_mut().find(|session| session.id == session_id) {
        session.last_command_at = "2026-03-06T14:22:10Z".into();
    }

    registry.recent_events.insert(
        0,
        SessionLifecycleEvent {
            id: format!("event-command-{}", registry.command_history.len()),
            session_id: session_id.into(),
            event_type: "command-submitted".into(),
            detail: format!("Queued command: {}", trimmed),
            occurred_at: "2026-03-06T14:22:10Z".into(),
        },
    );
    registry.recent_events.truncate(12);

    TerminalSnapshot {
        session_id: session_id.into(),
        lines: lines.clone(),
    }
}

pub fn workspace_state() -> TalonWorkspaceState {
    let registry = registry().lock().expect("session registry lock poisoned");
    let mut state = session_store::get_workspace_state();
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

    if let Some(active) = state.sessions.iter().find(|session| session.id == state.active_session_id) {
        state.terminal = TerminalSnapshot {
            session_id: active.id.clone(),
            lines: registry
                .terminal_buffers
                .get(&active.id)
                .cloned()
                .unwrap_or_else(default_terminal_buffer),
        };
        state.latest_failure.session_id = active.id.clone();
        state.latest_diagnosis.session_id = active.id.clone();
    }

    state
}
