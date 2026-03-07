import { invoke } from "@tauri-apps/api/core";
import type {
  RunbookActionResult,
  SuggestedAction,
  TalonWorkspaceState,
  TerminalSnapshot,
} from "@talon/core";
import type {
  AgentSettingsResponse,
  AppCommandError,
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

function rawErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Unknown command failure.";
}

function classifyError(message: string): AppCommandError["kind"] {
  const normalized = message.toLowerCase();
  if (normalized.includes("permission denied") || normalized.includes("authentication")) return "auth";
  if (normalized.includes("host key") || normalized.includes("known_hosts") || normalized.includes("trust")) return "host-trust";
  if (normalized.includes("connection refused") || normalized.includes("timed out") || normalized.includes("resolve") || normalized.includes("route")) return "network";
  if (normalized.includes("api key") || normalized.includes("provider") || normalized.includes("model")) return "agent";
  if (normalized.includes("invalid") || normalized.includes("missing") || normalized.includes("not found")) return "validation";
  if (normalized.includes("transport") || normalized.includes("write to remote shell") || normalized.includes("ssh")) return "transport";
  return "unknown";
}

function friendlyMessage(kind: AppCommandError["kind"], source: string, raw: string) {
  const detail = raw.trim();
  const withDetail = (prefix: string) => (detail ? `${prefix} ${detail}` : prefix);

  if (kind === "auth") {
    return withDetail("Authentication failed. Confirm the username, password, agent state, or selected key and try again.");
  }
  if (kind === "host-trust") {
    return withDetail("Host trust verification needs operator attention before Talon can continue.");
  }
  if (kind === "network") {
    return withDetail("Network reachability to the SSH target failed.");
  }
  if (kind === "agent") {
    return withDetail("AI provider configuration or credentials need attention.");
  }
  if (kind === "validation") {
    return withDetail("The requested desktop action is missing required data or refers to a resource that is no longer available.");
  }
  if (kind === "transport") {
    return withDetail("The SSH transport could not complete the requested operation.");
  }
  if (source.startsWith("workspace.") || source.startsWith("registry.") || source.startsWith("terminal.")) {
    return withDetail("The desktop app could not refresh live session state.");
  }
  return withDetail("The requested action failed.");
}

function normalizeError(error: unknown, source: string): AppCommandError {
  const raw = rawErrorMessage(error).trim() || "Unknown command failure.";
  const kind = classifyError(raw);
  return {
    message: friendlyMessage(kind, source, raw),
    kind,
    source,
    raw,
  };
}

async function invokeCommand<T>(commandName: string, source: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(commandName, args);
  } catch (error) {
    throw normalizeError(error, source);
  }
}

export function getWorkspaceState() {
  return invokeCommand<TalonWorkspaceState>("get_workspace_state", "workspace.load");
}

export function getSessionRegistry() {
  return invokeCommand<SessionRegistryResponse>("get_session_registry", "registry.load");
}

export function getAgentSettings() {
  return invokeCommand<AgentSettingsResponse>("get_agent_settings", "agent.settings.load");
}

export function getTerminalSnapshot(sessionId: string) {
  return invokeCommand<TerminalSnapshot>("get_terminal_snapshot", "terminal.snapshot.load", { sessionId });
}

export function getLatestContextPacket(sessionId: string) {
  return invokeCommand<ContextPacketResponse>("get_latest_context_packet", "context.packet.load", { payload: { sessionId } });
}

export function connectSession(payload: {
  hostId: string;
  address: string;
  port: number;
  username: string;
  authMethod: ConnectionAuthMethod;
  password?: string;
}) {
  return invokeCommand<ConnectSessionResponse>("connect_session", "session.connect", { payload });
}

export function reconnectSession(payload: {
  hostId: string;
  address: string;
  port: number;
  username: string;
  authMethod: ConnectionAuthMethod;
  password?: string;
}) {
  return invokeCommand<ConnectSessionResponse>("reconnect_session", "session.reconnect", { payload });
}

export function submitSessionCommand(sessionId: string, command: string) {
  return invokeCommand<SubmitCommandResponse>("submit_session_command", "session.command.submit", { payload: { sessionId, command } });
}

export function disconnectSession(sessionId: string) {
  return invokeCommand<DisconnectSessionResponse>("disconnect_session", "session.disconnect", { payload: { sessionId } });
}

export function runSuggestedAction(sessionId: string, action: SuggestedAction) {
  return invokeCommand<RunbookActionResult>("run_suggested_action", "session.action.run", {
    payload: { sessionId, actionId: action.id },
  });
}

export function saveHostPassword(hostId: string, password: string) {
  return invokeCommand<HostConfigMutationResponse>("save_host_password", "host.password.save", {
    payload: { hostId, password },
  });
}

export function clearHostPassword(hostId: string) {
  return invokeCommand<HostConfigMutationResponse>("clear_host_password", "host.password.clear", {
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
  return invokeCommand<AgentSettingsResponse>("save_agent_settings", "agent.settings.save", { payload });
}

export function saveAgentApiKey(apiKey: string) {
  return invokeCommand<AgentSettingsResponse>("save_agent_api_key", "agent.api_key.save", { payload: { apiKey } });
}

export function clearAgentApiKey() {
  return invokeCommand<AgentSettingsResponse>("clear_agent_api_key", "agent.api_key.clear");
}

export function prepareHostTrust(sessionId: string) {
  return invokeCommand<{ issue: SessionConnectionIssue }>("prepare_host_trust", "host.trust.prepare", {
    payload: { sessionId },
  });
}

export function confirmHostTrust(sessionId: string, fingerprint: string) {
  return invokeCommand<void>("confirm_host_trust", "host.trust.confirm", {
    payload: { sessionId, fingerprint },
  });
}

export function retryDiagnosis(sessionId: string) {
  return invokeCommand<TalonWorkspaceState>("retry_diagnosis", "diagnosis.retry", {
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
  return invokeCommand<HostConfigMutationResponse>("upsert_host_config", "host.config.save", { payload });
}

export function upsertHost(payload: {
  id: string;
  label: string;
  address: string;
  region: string;
  tags: string[];
}) {
  return invokeCommand<HostMutationResponse>("upsert_host", "host.save", { payload });
}

export function deleteHost(hostId: string) {
  return invokeCommand<HostMutationResponse>("delete_host", "host.delete", { payload: { hostId } });
}
