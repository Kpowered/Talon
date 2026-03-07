import type { Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import { useEffect, useMemo, useState } from "react";
import type { ActiveCommandSummary, TerminalTab } from "../types/app";
import { XtermShell } from "./XtermShell";

type ShellWorkspaceProps = {
  activeTab: TerminalTab;
  activeSession: Session;
  selectedHost: TalonWorkspaceState["hosts"][number];
  failure: TalonWorkspaceState["latestFailure"];
  activeConnectionIssueTitle: string | null;
  activeConnectionIssueSummary: string | null;
  activeCommand: ActiveCommandSummary | null;
  terminalTail: string[];
  composerValue: string;
  commandHistorySize: number;
  activeAction: SuggestedAction | null;
  inspectNotice: string | null;
  onSetComposerValue: (value: string) => void;
  onClearComposerValue: () => void;
  onSubmitCommand: () => void;
  onUseSuggestedCommand: () => void;
  onRecallPreviousCommand: () => void;
  onRecallNextCommand: () => void;
  onInterrupt: () => void;
  onOpenInspect: () => void;
  onCloseInspect: () => void;
};

export function ShellWorkspace({
  activeTab,
  activeSession,
  selectedHost,
  failure,
  activeConnectionIssueTitle,
  activeConnectionIssueSummary,
  activeCommand,
  terminalTail,
  composerValue,
  commandHistorySize,
  activeAction,
  inspectNotice,
  onSetComposerValue,
  onClearComposerValue,
  onSubmitCommand,
  onUseSuggestedCommand,
  onRecallPreviousCommand,
  onRecallNextCommand,
  onInterrupt,
  onOpenInspect,
  onCloseInspect,
}: ShellWorkspaceProps) {
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());
  const inspectOpen = activeTab !== "shell";
  const managedBusy = activeSession.state === "connecting" || Boolean(activeCommand);
  const runningDurationLabel = useMemo(() => {
    if (!activeCommand?.startedAt) {
      return null;
    }
    const elapsedSeconds = Math.max(0, Math.floor((runtimeNow - Date.parse(activeCommand.startedAt)) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
    const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [activeCommand?.startedAt, runtimeNow]);

  useEffect(() => {
    if (!managedBusy) {
      return undefined;
    }
    const intervalId = window.setInterval(() => setRuntimeNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [managedBusy]);

  return (
    <section className="terminal-stage panel compact-panel">
      <div className="terminal-stage-header">
        <div className="terminal-stage-copy">
          <p className="panel-kicker">Live terminal</p>
          <h2>{selectedHost.config.label}</h2>
          <span>{selectedHost.config.address}</span>
        </div>
        <div className="terminal-stage-actions">
          {inspectNotice ? <span className="inspect-summary-pill">{inspectNotice}</span> : null}
          <button className={`ghost-button small inspect-toggle ${inspectNotice ? "has-signal" : ""}`} onClick={inspectOpen ? onCloseInspect : onOpenInspect}>
            {inspectOpen ? "Hide Inspect" : "Inspect"}
          </button>
        </div>
      </div>

      {activeConnectionIssueTitle ? (
        <div className="terminal-stage-banner tone-warning">
          <strong>{activeConnectionIssueTitle}</strong>
          <p>{activeConnectionIssueSummary}</p>
        </div>
      ) : null}

      {inspectNotice && !inspectOpen ? (
        <div className="inspect-hint-banner">
          <strong>Inspect ready</strong>
          <p>Timeline, diagnosis, and artifacts stay available on demand without taking over the terminal.</p>
          <button className="ghost-button small" onClick={onOpenInspect}>
            Open inspect
          </button>
        </div>
      ) : null}

      <div className="terminal-stage-toolbar">
        <span className="terminal-meta-chip strong">{activeSession.cwd}</span>
        <span className="terminal-meta-chip">{activeSession.shell}</span>
        <span className="terminal-meta-chip">{activeSession.state}</span>
        {failure.exitCode !== 0 ? <span className="terminal-meta-chip tone-warn">exit {failure.exitCode}</span> : null}
        {managedBusy ? <span className="terminal-meta-chip tone-busy">command in flight</span> : null}
        {runningDurationLabel ? <span className="terminal-meta-chip">running {runningDurationLabel}</span> : null}
        {activeCommand?.command ? <span className="terminal-meta-chip truncate">{activeCommand.command}</span> : null}
        <div className="terminal-stage-toolbar-actions">
          <button className="ghost-button small" onClick={onUseSuggestedCommand} disabled={!activeAction || managedBusy}>
            Use suggested
          </button>
          {managedBusy ? (
            <button className="ghost-button small" onClick={onInterrupt}>
              Interrupt
            </button>
          ) : null}
        </div>
      </div>

      <div className="terminal-stage-hints">
        <span>Direct terminal input</span>
        <span>Enter submits</span>
        <span>Up/Down history {commandHistorySize > 0 ? `(${commandHistorySize})` : ""}</span>
        <span>Esc clears</span>
      </div>

      <div className="terminal-stage-body">
        <XtermShell
          sessionId={activeSession.id}
          terminalTail={terminalTail}
          draft={composerValue}
          isBusy={managedBusy}
          onDraftChange={onSetComposerValue}
          onSubmitCommand={onSubmitCommand}
          onRecallPreviousCommand={onRecallPreviousCommand}
          onRecallNextCommand={onRecallNextCommand}
          onClearDraft={onClearComposerValue}
          onInterrupt={onInterrupt}
        />
      </div>
    </section>
  );
}
