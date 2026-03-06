import type { TimelineEvent } from "@talon/core";
import { formatTime, stderrClassLabel } from "../../lib/formatters";

type TimelineViewProps = {
  failure: {
    summary: string;
    capturedAt: string;
  };
  timelineSignalSummary: Array<[string, number]>;
  activeTimelineSignalFilter: string | null;
  onToggleSignalFilter: (signal: string) => void;
  onClearSignalFilter: () => void;
  visibleTimeline: TimelineEvent[];
  repeatedSignalCounts: Map<string, number>;
};

export function TimelineView({
  failure,
  timelineSignalSummary,
  activeTimelineSignalFilter,
  onToggleSignalFilter,
  onClearSignalFilter,
  visibleTimeline,
  repeatedSignalCounts,
}: TimelineViewProps) {
  return (
    <div className="workspace-stack">
      <div className="timeline-header compact-panel-header">
        <div>
          <p className="panel-kicker">Failure context</p>
          <h2>{failure.summary}</h2>
        </div>
        <span className="pill subtle">{formatTime(failure.capturedAt)}</span>
      </div>

      {timelineSignalSummary.length > 0 ? (
        <div className="timeline-signal-summary">
          {timelineSignalSummary.map(([signal, count]) => (
            <button
              key={signal}
              className={`timeline-summary-pill ${activeTimelineSignalFilter === signal ? "active" : ""}`}
              onClick={() => onToggleSignalFilter(signal)}
            >
              {stderrClassLabel(signal)} x{count}
            </button>
          ))}
        </div>
      ) : null}

      {activeTimelineSignalFilter ? (
        <div className="timeline-filter-state">
          Showing only {stderrClassLabel(activeTimelineSignalFilter)} signals.
          <button className="ghost-button small" onClick={onClearSignalFilter}>
            Clear filter
          </button>
        </div>
      ) : null}

      <div className="timeline compact-timeline">
        {visibleTimeline.map((item) => (
          <article
            key={item.id}
            className={`timeline-item ${
              item.stderrClass && (repeatedSignalCounts.get(item.stderrClass) ?? 0) >= 2 ? "repeated-signal" : ""
            }`}
          >
            <div className="timeline-time">{formatTime(item.occurredAt)}</div>
            <div className="timeline-content">
              <div className="timeline-command-row">
                <div className="timeline-command">{item.title}</div>
                {item.stderrClass ? (
                  <span className="timeline-signal-badge">
                    {stderrClassLabel(item.stderrClass)}
                    {(repeatedSignalCounts.get(item.stderrClass) ?? 0) >= 2 ? " x2+" : ""}
                  </span>
                ) : null}
              </div>
              <p>{item.detail}</p>
            </div>
            <div className={`exit-code ${item.exitCode === 0 ? "ok" : "fail"}`}>
              {item.exitCode == null ? item.kind : `exit ${item.exitCode}`}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
