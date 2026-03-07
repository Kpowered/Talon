import { useMemo, useState } from "react";
import type { DiagnosisContextPacket, Host, Session, TalonWorkspaceState } from "@talon/core";

type ArtifactsViewProps = {
  failure: TalonWorkspaceState["latestFailure"];
  latestContextPacket: DiagnosisContextPacket | null;
  activeSession: Session;
  selectedHost: Host;
};

export function ArtifactsView({ failure, latestContextPacket, activeSession, selectedHost }: ArtifactsViewProps) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const operatorHandoff = useMemo(() => [
    `Host: ${selectedHost.config.label} (${selectedHost.config.address})`,
    `Session: ${activeSession.id} [${activeSession.state}/${activeSession.mode}]`,
    `Shell: ${activeSession.shell}`,
    `CWD: ${failure.cwd}`,
    `Outcome: ${failure.outcomeType}`,
    `Exit: ${failure.exitCode}`,
    `Summary: ${failure.summary}`,
    `Stdout tail lines: ${failure.stdoutTail.length}`,
    `Stderr tail lines: ${failure.stderrTail.length}`,
  ].join("\n"), [activeSession, failure, selectedHost]);

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
          <h2>Captured context</h2>
        </div>
        <div className="terminal-status-actions">
          <button className="ghost-button small" onClick={() => void copy("Summary", operatorHandoff)}>Copy summary</button>
          <button className="ghost-button small" onClick={() => void copy("Packet JSON", JSON.stringify(latestContextPacket ?? {}, null, 2))}>Copy packet JSON</button>
        </div>
      </div>
      {copyNotice ? <p className="empty-copy">{copyNotice}</p> : null}

      <article className="artifact-card">
        <strong>Operator handoff</strong>
        <pre>{operatorHandoff}</pre>
      </article>
      <article className="artifact-card">
        <strong>Failure summary</strong>
        <pre>{JSON.stringify({
          outcomeType: failure.outcomeType,
          exitCode: failure.exitCode,
          stderrClass: failure.stderrClass,
          stderrEvidence: failure.stderrEvidence,
          capturedAt: failure.capturedAt,
        }, null, 2)}</pre>
      </article>
      <article className="artifact-card">
        <strong>Structured packet</strong>
        <pre>{latestContextPacket ? JSON.stringify(latestContextPacket, null, 2) : "No structured context packet is cached yet."}</pre>
      </article>
      <article className="artifact-card">
        <strong>Related artifacts</strong>
        <pre>{failure.relatedArtifacts.length > 0 ? failure.relatedArtifacts.join("\n") : "No related artifacts captured for this failure."}</pre>
      </article>
    </div>
  );
}
