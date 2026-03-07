use session_manager::{
    clear_agent_api_key as clear_saved_agent_api_key,
    clear_host_password as clear_saved_host_password, confirm_host_trust as apply_host_trust,
    connect_session as open_preview_session, disconnect_session as close_session,
    get_agent_settings as load_agent_settings, get_host_password as load_host_password,
    get_latest_context_packet as load_latest_context_packet,
    get_session_events as load_session_events, get_session_registry as load_session_registry,
    get_terminal_snapshot as load_terminal_snapshot, get_workspace_state as load_workspace_state,
    prepare_host_trust as begin_host_trust, reconnect_session as reopen_session,
    retry_diagnosis as rerun_diagnosis, run_suggested_action as execute_suggested_action,
    save_agent_api_key as save_default_agent_api_key,
    save_agent_settings as persist_agent_settings, save_host_password as persist_host_password,
    submit_session_command as dispatch_session_command,
    write_session_input as dispatch_session_input, AgentSettingsResponse, ConfirmHostTrustRequest,
    ConnectSessionRequest, ConnectSessionResponse, ContextPacketResponse, DeleteHostConfigRequest,
    DeleteHostRequest, DisconnectSessionRequest, DisconnectSessionResponse,
    HostConfigMutationResponse, HostMutationResponse, HostPasswordResponse, HostSecretRequest,
    SaveAgentApiKeyRequest, SaveAgentSettingsRequest, SaveHostPasswordRequest,
    SessionEventListResponse, SessionModeMutationResponse, SessionRegistryResponse,
    SessionScopedRequest, SubmitCommandRequest, SubmitCommandResponse, SwitchSessionModeRequest,
    TrustConfirmationResponse, TrustPreparationResponse, UpsertHostConfigRequest,
    UpsertHostRequest, WriteSessionInputRequest,
};
use session_store::{
    RunbookActionResponse, SuggestedActionRequest, TalonWorkspaceState, TerminalSnapshot,
};

mod context_builder;
mod diagnosis_engine;
mod secrets;
mod session_manager;
mod session_registry;
mod session_store;

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
fn get_agent_settings() -> AgentSettingsResponse {
    load_agent_settings()
}

#[tauri::command]
fn save_agent_settings(payload: SaveAgentSettingsRequest) -> Result<AgentSettingsResponse, String> {
    persist_agent_settings(payload)
}

#[tauri::command]
fn save_agent_api_key(payload: SaveAgentApiKeyRequest) -> Result<AgentSettingsResponse, String> {
    save_default_agent_api_key(payload)
}

#[tauri::command]
fn clear_agent_api_key() -> Result<AgentSettingsResponse, String> {
    clear_saved_agent_api_key()
}

#[tauri::command]
fn save_host_password(
    payload: SaveHostPasswordRequest,
) -> Result<HostConfigMutationResponse, String> {
    persist_host_password(payload)
}

#[tauri::command]
fn clear_host_password(payload: HostSecretRequest) -> Result<HostConfigMutationResponse, String> {
    clear_saved_host_password(payload)
}

#[tauri::command]
fn get_host_password(payload: HostSecretRequest) -> HostPasswordResponse {
    load_host_password(payload)
}

#[tauri::command]
fn prepare_host_trust(payload: SessionScopedRequest) -> Result<TrustPreparationResponse, String> {
    begin_host_trust(payload)
}

#[tauri::command]
fn confirm_host_trust(
    payload: ConfirmHostTrustRequest,
) -> Result<TrustConfirmationResponse, String> {
    apply_host_trust(payload)
}

#[tauri::command]
fn retry_diagnosis(payload: SessionScopedRequest) -> Result<TalonWorkspaceState, String> {
    rerun_diagnosis(payload)
}

#[tauri::command]
fn get_latest_context_packet(payload: SessionScopedRequest) -> ContextPacketResponse {
    load_latest_context_packet(payload)
}

#[tauri::command]
fn connect_session(payload: ConnectSessionRequest) -> Result<ConnectSessionResponse, String> {
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
fn write_session_input(payload: WriteSessionInputRequest) -> Result<(), String> {
    dispatch_session_input(payload)
}

#[tauri::command]
fn switch_session_mode(
    payload: SwitchSessionModeRequest,
) -> Result<SessionModeMutationResponse, String> {
    session_manager::switch_session_mode(payload)
}

#[tauri::command]
fn reconnect_session(payload: ConnectSessionRequest) -> Result<ConnectSessionResponse, String> {
    reopen_session(payload)
}

#[tauri::command]
fn upsert_host_config(
    payload: UpsertHostConfigRequest,
) -> Result<HostConfigMutationResponse, String> {
    session_manager::upsert_host_config(payload)
}

#[tauri::command]
fn delete_host_config(
    payload: DeleteHostConfigRequest,
) -> Result<HostConfigMutationResponse, String> {
    session_manager::delete_host_config(payload)
}

#[tauri::command]
fn upsert_host(payload: UpsertHostRequest) -> Result<HostMutationResponse, String> {
    session_manager::upsert_host(payload)
}

#[tauri::command]
fn delete_host(payload: DeleteHostRequest) -> Result<HostMutationResponse, String> {
    session_manager::delete_host(payload)
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
            get_agent_settings,
            save_agent_settings,
            save_agent_api_key,
            clear_agent_api_key,
            save_host_password,
            clear_host_password,
            get_host_password,
            prepare_host_trust,
            confirm_host_trust,
            retry_diagnosis,
            get_latest_context_packet,
            connect_session,
            submit_session_command,
            disconnect_session,
            write_session_input,
            switch_session_mode,
            reconnect_session,
            upsert_host_config,
            delete_host_config,
            upsert_host,
            delete_host,
            run_suggested_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
