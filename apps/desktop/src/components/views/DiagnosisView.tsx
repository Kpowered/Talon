import type { DiagnosisMessage, Host, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { AgentSettings } from "../../types/app";
import { sourceLabel, stderrClassLabel } from "../../lib/formatters";

type DiagnosisViewProps = {
  actionSummary: string | null;
  diagnosis: TalonWorkspaceState["latestDiagnosis"];
  failure: TalonWorkspaceState["latestFailure"];
  agentSettings: AgentSettings | null;
  selectedHost: Host;
  isRunningAction: string | null;
  onRerunDiagnosis: () => void;
  onRunAction: (action: SuggestedAction) => void;
};

export function DiagnosisView({
  actionSummary,
  diagnosis,
  failure,
  agentSettings,
  selectedHost,
  isRunningAction,
  onRerunDiagnosis,
  onRunAction,
}: DiagnosisViewProps) {
  return (
    <div className="workspace-stack diagnosis-view">
      <article className="incident-hero compact-hero">
        <div>
          <p className="incident-label">Primary finding</p>
          <h3>{actionSummary ?? diagnosis.summary}</h3>
        </div>
        <div className="hero-badges">
          {failure.stderrClass ? <span className="confidence-badge signal-badge">{stderrClassLabel(failure.stderrClass)}</span> : null}
          <span className="confidence-badge">{diagnosis.confidence}%</span>
          <span className="confidence-badge">{diagnosis.provider}</span>
        </div>
      </article>

      <div className="insight-grid compact-insight-grid compact-insight-grid-two">
        <article className="insight-card">
          <span>Provider</span>
          <strong>{diagnosis.provider}</strong>
          <p>{diagnosis.errorMessage ?? (agentSettings?.hasApiKey ? "Using configured model access" : "Using local rule fallback")}</p>
        </article>
        <article className="insight-card">
          <span>Host</span>
          <strong>{selectedHost.config.label}</strong>
          <p>{selectedHost.config.address}</p>
        </article>
        <article className="insight-card">
          <span>Signal</span>
          <strong>{stderrClassLabel(failure.stderrClass)}</strong>
          <p>{failure.stderrEvidence ?? "Using exit and stderr heuristics"}</p>
        </article>
      </div>

      <div className="diagnosis-feed compact-diagnosis-feed">
        {diagnosis.messages.map((message: DiagnosisMessage) => (
          <article key={message.id} className={`diagnosis-card tone-${message.tone}`}>
            <div className="diagnosis-meta">
              <span>{sourceLabel(message.source)}</span>
              <strong>{message.title}</strong>
            </div>
            <p>{message.body}</p>
          </article>
        ))}
      </div>

      <div className="action-box compact-action-box">
        <button className="ghost-button small" onClick={onRerunDiagnosis}>
          Regenerate diagnosis
        </button>
        <p className="action-label">Suggested actions</p>
        {diagnosis.suggestedActions.map((action: SuggestedAction) => (
          <button
            key={action.id}
            className="ghost-button full action-button"
            onClick={() => onRunAction(action)}
            disabled={isRunningAction !== null}
          >
            <span>{action.label}</span>
            <span>{action.safetyLevel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
