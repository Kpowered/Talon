import type { Host, Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { AgentSettings, SessionConnectionIssue } from "../../types/app";

type DiagnosisViewProps = {
  actionSummary: string | null;
  diagnosis: TalonWorkspaceState["latestDiagnosis"] & {
    provider?: string;
    errorMessage?: string | null;
    contextPacketId?: string;
  };
  failure: TalonWorkspaceState["latestFailure"];
  agentSettings: AgentSettings | null;
  selectedHost: Host;
  activeSession: Session;
  activeConnectionIssue: SessionConnectionIssue | null;
  isRunningAction: string | null;
  onRerunDiagnosis: () => void;
  onRunAction: (action: SuggestedAction) => void;
};

function stderrClassLabel(value?: string | null) {
  if (!value) return "No stderr class";
  return value.replace(/-/g, " ");
}

function outcomeLabel(value: string) {
  return value.replace(/-/g, " ");
}

function sourceLabel(source: string) {
  return source === "agent" ? "Model" : "System";
}

function primaryFinding(
  actionSummary: string | null,
  diagnosisSummary: string,
  activeConnectionIssue: SessionConnectionIssue | null,
  activeSession: Session,
  failure: TalonWorkspaceState["latestFailure"],
) {
  if (activeConnectionIssue) {
    return {
      title: activeConnectionIssue.title,
      summary: activeConnectionIssue.summary,
      badge: activeConnectionIssue.disconnectCause ?? activeConnectionIssue.kind,
    };
  }
  if (failure.outcomeType === "operator-interrupted") {
    return {
      title: "Operator interrupt recorded",
      summary: "The remote command was interrupted by the operator. No remediation is required unless the command needs to be re-run.",
      badge: "operator-interrupted",
    };
  }
  if (activeSession.state === "degraded") {
    return {
      title: "SSH transport degraded",
      summary: "The session lost reliable transport or stream state. Reconnect before trusting any partial command result.",
      badge: "transport-drop",
    };
  }
  if (activeSession.state === "disconnected") {
    return {
      title: "Remote shell exited",
      summary: "The SSH session is no longer attached to a live shell. Reconnect if you need a fresh terminal.",
      badge: "remote-exit",
    };
  }
  return {
    title: (actionSummary ?? diagnosisSummary).trim() || "Session details",
    summary: activeSession.mode === "raw"
      ? "Raw mode is active, so structured command boundaries are reduced until you switch back to managed mode."
      : "Managed mode is active for structured capture, exit detection, and failure packaging.",
    badge: activeSession.mode,
  };
}

export function DiagnosisView({
  actionSummary,
  diagnosis,
  failure,
  agentSettings,
  selectedHost,
  activeSession,
  activeConnectionIssue,
  isRunningAction,
  onRerunDiagnosis,
  onRunAction,
}: DiagnosisViewProps) {
  const hasMessages = diagnosis.messages.length > 0;
  const hasActions = diagnosis.suggestedActions.length > 0;
  const finding = primaryFinding(actionSummary, diagnosis.summary, activeConnectionIssue, activeSession, failure);

  return (
    <div className="workspace-stack diagnosis-view">
      <article className="incident-hero compact-hero">
        <div>
          <p className="incident-label">Primary finding</p>
          <h3>{finding.title}</h3>
          <p>{finding.summary}</p>
        </div>
        <div className="hero-badges">
          <span className="confidence-badge">{finding.badge}</span>
          <span className="confidence-badge">{activeSession.mode}</span>
          <span className="confidence-badge">{diagnosis.provider}</span>
        </div>
      </article>

      <div className="insight-grid compact-insight-grid compact-insight-grid-two">
        <article className="insight-card">
          <span>Host</span>
          <strong>{selectedHost.config.label}</strong>
          <p>{selectedHost.config.address}</p>
        </article>
        <article className="insight-card">
          <span>Session</span>
          <strong>{activeSession.state}</strong>
          <p>{activeSession.shell} in {activeSession.cwd}</p>
        </article>
        <article className="insight-card">
          <span>Capture</span>
          <strong>{outcomeLabel(failure.outcomeType)}</strong>
          <p>Exit {failure.exitCode} ¡¤ {stderrClassLabel(failure.stderrClass)}</p>
        </article>
        <article className="insight-card">
          <span>Provider</span>
          <strong>{diagnosis.provider}</strong>
          <p>{diagnosis.errorMessage ?? (agentSettings?.hasApiKey ? "Using configured model access" : "Using local rule fallback")}</p>
        </article>
      </div>

      <div className="diagnosis-feed compact-diagnosis-feed">
        {activeConnectionIssue ? (
          <article className="diagnosis-card tone-warning">
            <div className="diagnosis-meta">
              <span>System</span>
              <strong>{activeConnectionIssue.operatorAction}</strong>
            </div>
            <p>
              {activeConnectionIssue.suggestedCommand
                ? `Suggested next check: ${activeConnectionIssue.suggestedCommand}`
                : "No in-band command was suggested for this transport issue."}
            </p>
          </article>
        ) : null}

        {hasMessages ? diagnosis.messages.map((message) => (
          <article key={message.id} className={`diagnosis-card tone-${message.tone}`}>
            <div className="diagnosis-meta">
              <span>{sourceLabel(message.source)}</span>
              <strong>{message.title}</strong>
            </div>
            <p>{message.body}</p>
          </article>
        )) : (
          <article className="diagnosis-card tone-neutral">
            <div className="diagnosis-meta">
              <span>Talon</span>
              <strong>No diagnosis narrative available yet</strong>
            </div>
            <p>Run another diagnosis pass after a fresh command failure or transport issue so Talon can rebuild operator-facing incident notes.</p>
          </article>
        )}
      </div>

      <div className="action-box compact-action-box">
        <button className="ghost-button small" onClick={onRerunDiagnosis}>
          Regenerate diagnosis
        </button>
        <p className="action-label">Suggested actions</p>
        {hasActions ? diagnosis.suggestedActions.map((action) => (
          <button
            key={action.id}
            className="ghost-button full action-button"
            onClick={() => onRunAction(action)}
            disabled={isRunningAction !== null || activeSession.mode === "raw"}
          >
            <span>{action.label}</span>
            <span>{action.safetyLevel}</span>
          </button>
        )) : <p className="empty-copy">No suggested actions are available for the current evidence set yet.</p>}
      </div>
    </div>
  );
}
