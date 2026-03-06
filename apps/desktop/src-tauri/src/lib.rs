mod context_builder;
mod session_manager;
mod session_registry;
mod session_store;

use session_manager::{
    connect_session as open_preview_session, get_session_events as load_session_events,
    get_session_registry as load_session_registry, get_terminal_snapshot as load_terminal_snapshot,
    get_workspace_state as load_workspace_state, run_suggested_action as execute_suggested_action,
    submit_session_command as dispatch_session_command, disconnect_session as close_session,
    reconnect_session as reopen_session, ConnectSessionRequest, ConnectSessionResponse,
    DisconnectSessionRequest, DisconnectSessionResponse, SessionEventListResponse, SessionRegistryResponse,
    SubmitCommandRequest, SubmitCommandResponse,
};
use session_store::{RunbookActionResponse, SuggestedActionRequest, TalonWorkspaceState, TerminalSnapshot};

#[tauri::command]
fn get_workspace_state() -> TalonWorkspaceState {
    load_workspace_state()
}

#[tauri::command]
fn get_session_registry() -> SessionRegistryResponse {
    load_session_registry()
}

#[tauri::command]
fn get_session_events() -> SessionEventListResponse {
    load_session_events()
}

#[tauri::command]
fn get_terminal_snapshot(session_id: String) -> TerminalSnapshot {
    load_terminal_snapshot(session_id)
}

#[tauri::command]
fn connect_session(payload: ConnectSessionRequest) -> ConnectSessionResponse {
    open_preview_session(payload)
}

#[tauri::command]
fn submit_session_command(payload: SubmitCommandRequest) -> SubmitCommandResponse {
    dispatch_session_command(payload)
}

#[tauri::command]
fn disconnect_session(payload: DisconnectSessionRequest) -> DisconnectSessionResponse {
    close_session(payload)
}

#[tauri::command]
fn reconnect_session(payload: ConnectSessionRequest) -> ConnectSessionResponse {
    reopen_session(payload)
}

#[tauri::command]
fn run_suggested_action(payload: SuggestedActionRequest) -> RunbookActionResponse {
    execute_suggested_action(payload)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_workspace_state,
            get_session_registry,
            get_session_events,
            get_terminal_snapshot,
            connect_session,
            submit_session_command,
            disconnect_session,
            reconnect_session,
            run_suggested_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::env;
    use std::thread;
    use std::time::{Duration, Instant};

    use crate::session_manager::{
        connect_session, disconnect_session, get_session_events, get_terminal_snapshot, get_workspace_state,
        submit_session_command, ConnectSessionRequest, DisconnectSessionRequest, SubmitCommandRequest,
    };

    fn env_required(key: &str) -> Option<String> {
        env::var(key).ok().filter(|value| !value.trim().is_empty())
    }

    #[test]
    #[ignore = "requires unsandboxed network access for child ssh.exe spawned by the test process"]
    fn validates_password_auth_flow_against_external_host() {
        let Some(address) = env_required("TALON_TEST_SSH_ADDRESS") else {
            return;
        };
        let Some(password) = env_required("TALON_TEST_SSH_PASSWORD") else {
            return;
        };

        let host_id = env_required("TALON_TEST_SSH_HOST_ID").unwrap_or_else(|| "host-prod-web-1".into());
        let username = env_required("TALON_TEST_SSH_USERNAME").unwrap_or_else(|| "root".into());
        let port = env_required("TALON_TEST_SSH_PORT")
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(22);

        let connection = connect_session(ConnectSessionRequest {
            host_id,
            address: Some(address),
            port: Some(port),
            username: Some(username),
            auth_method: Some("password".into()),
            password: Some(password),
        });

        let session_id = connection.session.session_id.clone();
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let workspace = get_workspace_state();
            if let Some(session) = workspace.sessions.iter().find(|session| session.id == session_id) {
                if session.state == "connected" {
                    break;
                }
            }
            if Instant::now() >= deadline {
                let terminal = get_terminal_snapshot(session_id.clone()).lines.join("\n");
                let events = get_session_events()
                    .events
                    .into_iter()
                    .map(|event| format!("{}: {}", event.event_type, event.detail))
                    .collect::<Vec<_>>()
                    .join("\n");
                panic!(
                    "session did not reach connected state in time\nterminal:\n{}\n\nevents:\n{}",
                    terminal, events
                );
            }
            thread::sleep(Duration::from_millis(500));
        }

        submit_session_command(SubmitCommandRequest {
            session_id: session_id.clone(),
            command: "pwd".into(),
        });

        let command_deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let workspace = get_workspace_state();
            let terminal = workspace.terminal.lines.join("\n");
            if workspace.active_session_id == session_id && terminal.contains("/root") {
                break;
            }
            assert!(Instant::now() < command_deadline, "pwd output did not appear in time");
            thread::sleep(Duration::from_millis(500));
        }

        submit_session_command(SubmitCommandRequest {
            session_id: session_id.clone(),
            command: "sh -c 'exit 7'".into(),
        });

        let failure_deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let workspace = get_workspace_state();
            if workspace.latest_failure.session_id == session_id && workspace.latest_failure.exit_code == 7 {
                break;
            }
            assert!(Instant::now() < failure_deadline, "non-zero failure context was not captured in time");
            thread::sleep(Duration::from_millis(500));
        }

        disconnect_session(DisconnectSessionRequest { session_id });
    }
}
