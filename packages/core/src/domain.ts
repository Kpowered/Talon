export type HealthStatus = "healthy" | "warning" | "critical";

export type SessionState = "connected" | "degraded" | "disconnected";

export type DiagnosticTone = "neutral" | "warning" | "critical" | "success";

export type TimelineKind = "command" | "diagnosis" | "action";

export type SuggestedActionStatus = "ready" | "blocked" | "completed";

export interface Host {
  id: string;
  label: string;
  address: string;
  region: string;
  tags: string[];
  status: HealthStatus;
  latencyMs: number;
  cpuPercent: number;
  memoryPercent: number;
  lastSeenAt: string;
}

export interface Session {
  id: string;
  hostId: string;
  state: SessionState;
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
  status: HealthStatus;
  confidence: number;
  summary: string;
  likelyCauses: string[];
  messages: DiagnosisMessage[];
  suggestedActions: SuggestedAction[];
  generatedAt: string;
}

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  title: string;
  detail: string;
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
