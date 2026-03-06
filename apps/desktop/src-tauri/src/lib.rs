mod session_manager;
mod session_registry;
mod session_store;

use session_manager::{
    connect_session as open_preview_session, get_session_events, get_session_registry,
    get_terminal_snapshot, get_workspace_state as load_workspace_state,
    run_suggested_action as execute_suggested_action, submit_session_command,
    ConnectSessionRequest, ConnectSessionResponse, SessionEventListResponse, SessionRegistryResponse,
    SubmitCommandRequest, SubmitCommandResponse,
};
use session_store::{RunbookActionResponse, SuggestedActionRequest, TalonWorkspaceState, TerminalSnapshot};

#[tauri::command]
fn get_workspace_state() -> TalonWorkspaceState {
    load_workspace_state()
}

#[tauri::command]
fn get_session_registry() -> SessionRegistryResponse {
    get_session_registry()
}

#[tauri::command]
fn get_session_events() -> SessionEventListResponse {
    get_session_events()
}

#[tauri::command]
fn get_terminal_snapshot(session_id: String) -> TerminalSnapshot {
    get_terminal_snapshot(session_id)
}

#[tauri::command]
fn connect_session(payload: ConnectSessionRequest) -> ConnectSessionResponse {
    open_preview_session(payload)
}

#[tauri::command]
fn submit_session_command(payload: SubmitCommandRequest) -> SubmitCommandResponse {
    submit_session_command(payload)
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
            run_suggested_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
