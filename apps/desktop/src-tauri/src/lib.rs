mod session_manager;
mod session_registry;
mod session_store;

use session_manager::{
    connect_session as open_preview_session, get_session_events, get_session_registry,
    get_workspace_state as load_workspace_state, run_suggested_action as execute_suggested_action,
    ConnectSessionRequest, ConnectSessionResponse, SessionEventListResponse, SessionRegistryResponse,
};
use session_store::{RunbookActionResponse, SuggestedActionRequest, TalonWorkspaceState};

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
fn connect_session(payload: ConnectSessionRequest) -> ConnectSessionResponse {
    open_preview_session(payload)
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
            connect_session,
            run_suggested_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
