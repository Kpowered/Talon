import type { FailureContext, Host, Session, TalonWorkspaceState } from "@talon/core";

export interface SshHostConfig {
  id: string;
  label: string;
  address: string;
  port: number;
  username: string;
  authMethod: "agent" | "password" | "private-key";
  tags: string[];
}

export interface SshSessionLifecycleEvent {
  type: "connected" | "stdout" | "stderr" | "command-start" | "command-end" | "disconnected";
  sessionId: string;
  occurredAt: string;
  detail: string;
}

export interface FailureCaptureHook {
  session: Session;
  host: Host;
  failure: FailureContext;
}

export interface WorkspaceStateProvider {
  getWorkspaceState(): Promise<TalonWorkspaceState>;
}
