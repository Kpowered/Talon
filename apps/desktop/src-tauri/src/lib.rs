mod session_store;

use session_store::{
    get_workspace_state as load_workspace_state, run_suggested_action as execute_suggested_action,
    RunbookActionResponse, SuggestedActionRequest, TalonWorkspaceState,
};

#[tauri::command]
fn get_workspace_state() -> TalonWorkspaceState {
    load_workspace_state()
}

#[tauri::command]
fn run_suggested_action(payload: SuggestedActionRequest) -> RunbookActionResponse {
    execute_suggested_action(payload)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_workspace_state, run_suggested_action])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
