import type { DiagnosisContextPacket, TalonWorkspaceState } from "@talon/core";

type ArtifactsViewProps = {
  failure: TalonWorkspaceState["latestFailure"];
  latestContextPacket: DiagnosisContextPacket | null;
};

export function ArtifactsView({ failure, latestContextPacket }: ArtifactsViewProps) {
  const hasArtifacts = failure.relatedArtifacts.length > 0;

  return (
    <div className="workspace-stack artifacts-view">
      <div className="timeline-header compact-panel-header">
        <div>
          <p className="panel-kicker">Artifacts</p>
          <h2>Captured context</h2>
        </div>
        <span className="pill subtle">{failure.relatedArtifacts.length}</span>
      </div>
      <div className="artifact-list">
        {latestContextPacket ? (
          <article className="artifact-card">
            <pre>{JSON.stringify(latestContextPacket, null, 2)}</pre>
          </article>
        ) : (
          <article className="artifact-card artifact-empty-state">
            <p className="empty-copy">No structured context packet is cached yet. Trigger a fresh diagnosis or failure capture to populate this view.</p>
          </article>
        )}
        {!hasArtifacts ? <p className="empty-copy">No related artifacts captured for this failure.</p> : null}
        {failure.relatedArtifacts.map((artifact, index) => (
          <article key={`${artifact}${index}`} className="artifact-card">
            {artifact}
          </article>
        ))}
      </div>
    </div>
  );
}
