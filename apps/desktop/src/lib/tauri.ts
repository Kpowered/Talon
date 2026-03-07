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
  HostPasswordResponse,
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

function operatorHint(source: string, raw: string) {
  const normalized = raw.toLowerCase();

  if (source === "session.command.submit") {
    if (normalized.includes("in flight") || normalized.includes("busy")) {
      return "Wait for the current remote command to finish before sending another one.";
    }
    if (normalized.includes("no active ssh transport") || normalized.includes("not ready")) {
      return "Reconnect the SSH session before submitting another command.";
    }
  }

  if (source === "session.connect" || source === "session.reconnect") {
    if (normalized.includes("permission denied")) {
      return "Confirm the selected auth method matches the target host and that the credentials are still valid.";
    }
    if (normalized.includes("timed out") || normalized.includes("connection refused") || normalized.includes("resolve")) {
      return "Check host reachability, port, and any VPN or firewall path before retrying.";
    }
  }

  if (source === "host.trust.prepare" || source === "host.trust.confirm") {
    return "Verify the fingerprint out of band before trusting the host entry from Talon.";
  }

  if (source.startsWith("agent.")) {
    return "Review the provider base URL, model, timeout, and API key configuration in the host rail.";
  }

  if (source.startsWith("workspace.") || source.startsWith("registry.") || source.startsWith("terminal.")) {
    return "Retry the refresh. If the state still does not recover, restart the desktop app so the backend session registry can resync.";
  }

  if (source.startsWith("host.")) {
    return "Review the saved host defaults and make sure the selected host record still exists before retrying.";
  }

  return null;
}

function friendlyPrefix(kind: AppCommandError["kind"], source: string) {
  if (kind === "auth") return "Authentication failed.";
  if (kind === "host-trust") return "Host trust verification needs operator attention.";
  if (kind === "network") return "Network reachability to the SSH target failed.";
  if (kind === "agent") return "AI provider configuration or credentials need attention.";
  if (kind === "validation") return source.startsWith("host.") ? "The selected host record is incomplete or no longer available." : "The requested desktop action is missing required data or refers to a stale resource.";
  if (kind === "transport") return "The SSH transport could not complete the requested operation.";
  if (source.startsWith("workspace.") || source.startsWith("registry.") || source.startsWith("terminal.")) {
    return "The desktop app could not refresh live session state.";
  }
  return "The requested action failed.";
}

function friendlyMessage(kind: AppCommandError["kind"], source: string, raw: string) {
  const detail = raw.trim();
  const prefix = friendlyPrefix(kind, source);
  const hint = operatorHint(source, raw);
  return [prefix, detail, hint].filter(Boolean).join(" ");
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

export function getHostPassword(hostId: string) {
  return invokeCommand<HostPasswordResponse>("get_host_password", "host.password.load", {
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



