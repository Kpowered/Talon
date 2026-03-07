export type HealthStatus = "healthy" | "warning" | "critical";

export type SessionState = "connecting" | "reconnecting" | "connected" | "degraded" | "disconnecting" | "disconnected";

export type SessionMode = "managed" | "raw";

export type DisconnectCause = "operator-disconnect" | "remote-exit" | "transport-drop" | "command-dispatch-failure" | "stream-failure";

export type CommandOutcomeType = "success" | "non-zero-exit" | "operator-interrupted" | "connection-issue";

export type DiagnosticTone = "neutral" | "warning" | "critical" | "success";

export type TimelineKind = "command" | "diagnosis" | "action";

export type SuggestedActionStatus = "ready" | "blocked" | "completed";

export interface HostConfig {
  label: string;
  address: string;
  region: string;
  tags: string[];
}

export interface HostObservedState {
  status: HealthStatus;
  latencyMs: number;
  cpuPercent: number;
  memoryPercent: number;
  lastSeenAt: string;
}

export interface Host {
  id: string;
  config: HostConfig;
  observed: HostObservedState;
}

export interface Session {
  id: string;
  hostId: string;
  state: SessionState;
  mode: SessionMode;
  shell: string;
  cwd: string;
  connectedAt: string;
  lastCommandAt: string;
  autoCaptureEnabled: boolean;
}

export interface CommandRecord {
  id: string;
  sessionId: string;
  command: string;
  startedAt: string;
  completedAt: string;
  exitCode: number;
  stdoutTail: string[];
  stderrTail: string[];
}

export interface FailureContext {
  id: string;
  sessionId: string;
  hostId: string;
  commandId: string;
  summary: string;
  severity: HealthStatus;
  stderrClass?: string | null;
  stderrEvidence?: string | null;
  outcomeType: CommandOutcomeType;
  cwd: string;
  shell: string;
  exitCode: number;
  stdoutTail: string[];
  stderrTail: string[];
  relatedArtifacts: string[];
  capturedAt: string;
}

export interface SuggestedAction {
  id: string;
  label: string;
  command: string;
  rationale: string;
  safetyLevel: "read-only" | "guarded";
  status: SuggestedActionStatus;
}

export interface DiagnosisMessage {
  id: string;
  source: "agent" | "system";
  tone: DiagnosticTone;
  title: string;
  body: string;
}

export interface DiagnosisResponse {
  id: string;
  sessionId: string;
  status: string;
  confidence: number;
  summary: string;
  likelyCauses: string[];
  messages: DiagnosisMessage[];
  suggestedActions: SuggestedAction[];
  provider: string;
  errorMessage?: string | null;
  contextPacketId: string;
  generatedAt: string;
}


export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  stderrClass?: string | null;
  stderrEvidence?: string | null;
  occurredAt: string;
  exitCode?: number | null;
}

export interface TerminalSnapshot {
  sessionId: string;
  lines: string[];
}

export interface TalonWorkspaceState {
  hosts: Host[];
  sessions: Session[];
  activeSessionId: string;
  latestFailure: FailureContext;
  latestDiagnosis: DiagnosisResponse;
  timeline: TimelineEvent[];
  terminal: TerminalSnapshot;
}

export interface RunbookActionResult {
  sessionId: string;
  actionId: string;
  status: HealthStatus;
  summary: string;
  appendedTerminalLines: string[];
}

export interface DiagnosisContextPacket {
  id: string;
  sessionId: string;
  trigger: string;
  host: Record<string, unknown>;
  connection: Record<string, unknown>;
  session: Record<string, unknown>;
  failure?: Record<string, unknown> | null;
  connectionIssue?: Record<string, unknown> | null;
  recentCommands: Record<string, unknown>[];
  timelineWindow: Record<string, unknown>[];
  artifacts: string[];
  generatedAt: string;
}



