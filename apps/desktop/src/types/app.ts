import type { DiagnosisContextPacket, Host, TerminalSnapshot } from "@talon/core";

export type TerminalTab = "shell" | "timeline" | "diagnosis" | "artifacts";

export type ActionNotice = {
  kind: "success" | "error";
  message: string;
};

export type AppCommandError = {
  message: string;
  kind: "transport" | "validation" | "auth" | "host-trust" | "network" | "agent" | "unknown";
  source: string;
  raw?: string;
};

export type SessionLifecycleEvent = {
  id: string;
  sessionId: string;
  eventType: string;
  detail: string;
  occurredAt: string;
};

export type HostConnectionConfig = {
  hostId: string;
  port: number;
  username: string;
  authMethod: string;
  fingerprintHint: string;
  privateKeyPath?: string | null;
  hasSavedPassword?: boolean;
};

export type ConnectionAuthMethod = "agent" | "private-key" | "password";

export type NewHostDraft = {
  label: string;
  address: string;
  port: string;
  username: string;
  authMethod: ConnectionAuthMethod;
  password: string;
  region: string;
  tags: string;
};

export type ConnectSessionResponse = {
  session: {
    sessionId: string;
    hostId: string;
    state: string;
    shell: string;
    cwd: string;
    autoCaptureEnabled: boolean;
  };
  events: SessionLifecycleEvent[];
};

export type SessionRegistryResponse = {
  hostConfigs: HostConnectionConfig[];
  activeSessionId: string;
  busySessionIds: string[];
  activeConnectionIssue: SessionConnectionIssue | null;
};

export type SubmitCommandResponse = {
  terminal: TerminalSnapshot;
  events: SessionLifecycleEvent[];
  accepted: boolean;
  message: string;
};

export type DisconnectSessionResponse = {
  terminal: TerminalSnapshot;
  events: SessionLifecycleEvent[];
};

export type HostConfigMutationResponse = {
  hostConfigs: HostConnectionConfig[];
};

export type HostMutationResponse = {
  hosts: Host[];
};

export type AgentSettings = {
  providerType: string;
  baseUrl: string;
  model: string;
  autoDiagnose: boolean;
  requestTimeoutSec: number;
  hasApiKey: boolean;
};

export type AgentSettingsResponse = {
  settings: AgentSettings;
};

export type ContextPacketResponse = {
  packet: DiagnosisContextPacket | null;
};

export type SessionConnectionIssue = {
  sessionId: string;
  kind: string;
  title: string;
  summary: string;
  operatorAction: string;
  suggestedCommand: string;
  observedAt: string;
  fingerprint?: string | null;
  expectedFingerprintHint?: string | null;
  host?: string | null;
  port?: number | null;
  canTrustInApp?: boolean;
  inAppActionKind?: string | null;
  inAppActionLabel?: string | null;
};

export type AgentFormState = {
  baseUrl: string;
  model: string;
  autoDiagnose: boolean;
  apiKey: string;
};

export type SavedHostFormState = {
  label: string;
  address: string;
  region: string;
  tags: string;
  port: string;
  username: string;
  authMethod: ConnectionAuthMethod;
  fingerprintHint: string;
  privateKeyPath: string;
  savedPassword: string;
};

export type SessionOverrideFormState = {
  address: string;
  port: string;
  username: string;
  authMethod: ConnectionAuthMethod;
  password: string;
};
