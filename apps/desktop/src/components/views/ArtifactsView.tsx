import { useMemo, useState } from "react";
import type { DiagnosisContextPacket, Host, Session, TalonWorkspaceState } from "@talon/core";
import type { SessionConnectionIssue } from "../../types/app";

type ArtifactsViewProps = {
  failure: TalonWorkspaceState["latestFailure"];
  latestContextPacket: DiagnosisContextPacket | null;
  activeSession: Session;
  selectedHost: Host;
  activeConnectionIssue: SessionConnectionIssue | null;
};

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function ArtifactsView({ failure, latestContextPacket, activeSession, selectedHost, activeConnectionIssue }: ArtifactsViewProps) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const operatorHandoff = useMemo(() => [
    `Host: ${selectedHost.config.label} (${selectedHost.config.address})`,
    `Session: ${activeSession.id} [${activeSession.state}/${activeSession.mode}]`,
    `Shell: ${activeSession.shell}`,
    `CWD: ${failure.cwd}`,
    `Outcome: ${failure.outcomeType}`,
    `Exit: ${failure.exitCode}`,
    `Summary: ${failure.summary}`,
    activeConnectionIssue ? `Connection issue: ${activeConnectionIssue.title}` : null,
    activeConnectionIssue ? `Operator action: ${activeConnectionIssue.operatorAction}` : null,
    `Stdout tail lines: ${failure.stdoutTail.length}`,
    `Stderr tail lines: ${failure.stderrTail.length}`,
  ].filter(Boolean).join("\n"), [activeConnectionIssue, activeSession, failure, selectedHost]);

  const summaryPacket = useMemo(() => ({
    host: {
      label: selectedHost.config.label,
      address: selectedHost.config.address,
    },
    session: {
      id: activeSession.id,
      state: activeSession.state,
      mode: activeSession.mode,
      shell: activeSession.shell,
      cwd: activeSession.cwd,
    },
    failure: {
      outcomeType: failure.outcomeType,
      exitCode: failure.exitCode,
      stderrClass: failure.stderrClass,
      stderrEvidence: failure.stderrEvidence,
      capturedAt: failure.capturedAt,
    },
    connectionIssue: activeConnectionIssue
      ? {
          title: activeConnectionIssue.title,
          summary: activeConnectionIssue.summary,
          disconnectCause: activeConnectionIssue.disconnectCause,
          operatorAction: activeConnectionIssue.operatorAction,
          suggestedCommand: activeConnectionIssue.suggestedCommand,
        }
      : null,
    artifacts: failure.relatedArtifacts,
  }), [activeConnectionIssue, activeSession, failure, selectedHost]);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopyNotice(`${label} copied`);
    window.setTimeout(() => setCopyNotice(null), 1600);
  }

  return (
    <div className="workspace-stack artifacts-view">
      <div className="timeline-header compact-panel-header">
        <div>
          <p className="panel-kicker">Artifacts</p>
          <h2>Operator packet</h2>
        </div>
        <div className="terminal-status-actions">
          <button className="ghost-button small" onClick={() => void copy("Summary", operatorHandoff)}>Copy summary</button>
          <button className="ghost-button small" onClick={() => void copy("Packet JSON", compactJson(latestContextPacket ?? summaryPacket))}>Copy packet JSON</button>
        </div>
      </div>
      {copyNotice ? <p className="empty-copy">{copyNotice}</p> : null}

      <article className="artifact-card">
        <strong>Operator handoff</strong>
        <pre>{operatorHandoff}</pre>
      </article>

      <article className="artifact-card">
        <strong>At a glance</strong>
        <pre>{compactJson(summaryPacket)}</pre>
      </article>

      <article className="artifact-card">
        <strong>Evidence tails</strong>
        <pre>{[
          `stdout tail: ${failure.stdoutTail.length === 0 ? "none" : failure.stdoutTail.join("\n")}`,
          "",
          `stderr tail: ${failure.stderrTail.length === 0 ? "none" : failure.stderrTail.join("\n")}`,
        ].join("\n")}</pre>
      </article>

      <article className="artifact-card">
        <strong>Related artifacts</strong>
        <pre>{failure.relatedArtifacts.length > 0 ? failure.relatedArtifacts.join("\n") : "No related artifacts captured for this failure."}</pre>
      </article>

      <details className="artifact-card artifact-details">
        <summary>Full structured packet</summary>
        <pre>{latestContextPacket ? compactJson(latestContextPacket) : "No structured context packet is cached yet."}</pre>
      </details>
    </div>
  );
}
