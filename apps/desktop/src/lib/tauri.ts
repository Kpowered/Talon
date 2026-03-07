import { invoke } from "@tauri-apps/api/core";
import type {
  RunbookActionResult,
  SuggestedAction,
  TalonWorkspaceState,
  TerminalSnapshot,
} from "@talon/core";
import type {
  AgentSettingsResponse,
  ConnectSessionResponse,
  ConnectionAuthMethod,
  ContextPacketResponse,
  DisconnectSessionResponse,
  HostConfigMutationResponse,
  HostMutationResponse,
  SessionConnectionIssue,
  SessionRegistryResponse,
  SubmitCommandResponse,
} from "../types/app";

export function getWorkspaceState() {
  return invoke<TalonWorkspaceState>("get_workspace_state");
}

export function getSessionRegistry() {
  return invoke<SessionRegistryResponse>("get_session_registry");
}

export function getAgentSettings() {
  return invoke<AgentSettingsResponse>("get_agent_settings");
}

export function getTerminalSnapshot(sessionId: string) {
  return invoke<TerminalSnapshot>("get_terminal_snapshot", { sessionId });
}

export function getLatestContextPacket(sessionId: string) {
  return invoke<ContextPacketResponse>("get_latest_context_packet", { payload: { sessionId } });
}

export function connectSession(payload: {
  hostId: string;
  address: string;
  port: number;
  username: string;
  authMethod: ConnectionAuthMethod;
  password?: string;
}) {
  return invoke<ConnectSessionResponse>("connect_session", { payload });
}

export function reconnectSession(payload: {
  hostId: string;
  address: string;
  port: number;
  username: string;
  authMethod: ConnectionAuthMethod;
  password?: string;
}) {
  return invoke<ConnectSessionResponse>("reconnect_session", { payload });
}

export function submitSessionCommand(sessionId: string, command: string) {
  return invoke<SubmitCommandResponse>("submit_session_command", { payload: { sessionId, command } });
}

export function disconnectSession(sessionId: string) {
  return invoke<DisconnectSessionResponse>("disconnect_session", { payload: { sessionId } });
}

export function runSuggestedAction(sessionId: string, action: SuggestedAction) {
  return invoke<RunbookActionResult>("run_suggested_action", {
    payload: { sessionId, actionId: action.id },
  });
}

export function saveHostPassword(hostId: string, password: string) {
  return invoke<HostConfigMutationResponse>("save_host_password", {
    payload: { hostId, password },
  });
}

export function clearHostPassword(hostId: string) {
  return invoke<HostConfigMutationResponse>("clear_host_password", {
    payload: { hostId },
  });
}

export function saveAgentConfiguration(payload: {
  providerType: string;
  baseUrl: string;
  model: string;
  autoDiagnose: boolean;
  requestTimeoutSec: number;
}) {
  return invoke<AgentSettingsResponse>("save_agent_settings", { payload });
}

export function saveAgentApiKey(apiKey: string) {
  return invoke<AgentSettingsResponse>("save_agent_api_key", { payload: { apiKey } });
}

export function clearAgentApiKey() {
  return invoke<AgentSettingsResponse>("clear_agent_api_key");
}

export function prepareHostTrust(sessionId: string) {
  return invoke<{ issue: SessionConnectionIssue }>("prepare_host_trust", {
    payload: { sessionId },
  });
}

export function confirmHostTrust(sessionId: string, fingerprint: string) {
  return invoke("confirm_host_trust", {
    payload: { sessionId, fingerprint },
  });
}

export function retryDiagnosis(sessionId: string) {
  return invoke<TalonWorkspaceState>("retry_diagnosis", {
    payload: { sessionId },
  });
}

export function upsertHostConfig(payload: {
  hostId: string;
  port: number;
  username: string;
  authMethod: ConnectionAuthMethod;
  fingerprintHint: string;
  privateKeyPath: string | null;
}) {
  return invoke<HostConfigMutationResponse>("upsert_host_config", { payload });
}

export function upsertHost(payload: {
  id: string;
  label: string;
  address: string;
  region: string;
  tags: string[];
}) {
  return invoke<HostMutationResponse>("upsert_host", { payload });
}

export function deleteHost(hostId: string) {
  return invoke<HostMutationResponse>("delete_host", { payload: { hostId } });
}
