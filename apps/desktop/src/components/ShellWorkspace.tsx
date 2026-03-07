import { useEffect, useMemo, useState } from "react";
import type { SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { ActiveCommandSummary, TerminalTab } from "../types/app";
import { XtermShell } from "./XtermShell";

type ShellWorkspaceProps = {
  activeTab: TerminalTab;
  activeSession: TalonWorkspaceState["sessions"][number];
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
  onDisconnect: () => void;
  onToggleSessionMode: () => void;
  onSendRawInput: (data: string) => void;
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
  onDisconnect,
  onToggleSessionMode,
  onSendRawInput,
  onOpenInspect,
  onCloseInspect,
}: ShellWorkspaceProps) {
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());
  const inspectOpen = activeTab !== "shell";
  const managedBusy = activeSession.mode === "managed" && (["connecting", "reconnecting", "disconnecting"].includes(activeSession.state) || Boolean(activeCommand));
  const isTransitioning = ["connecting", "reconnecting", "disconnecting"].includes(activeSession.state);
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
    <section className="terminal-stage panel compact-panel terminal-stage-compact terminal-stage-clean">
      {activeConnectionIssueTitle ? (
        <div className="terminal-stage-banner tone-warning">
          <strong>{activeConnectionIssueTitle}</strong>
          <p>{activeConnectionIssueSummary}</p>
        </div>
      ) : null}

      <div className="terminal-stage-body">
        <XtermShell
          sessionId={activeSession.id}
          sessionMode={activeSession.mode}
          terminalTail={terminalTail}
          draft={composerValue}
          isBusy={managedBusy}
          onDraftChange={onSetComposerValue}
          onSubmitCommand={onSubmitCommand}
          onRecallPreviousCommand={onRecallPreviousCommand}
          onRecallNextCommand={onRecallNextCommand}
          onClearDraft={onClearComposerValue}
          onInterrupt={onInterrupt}
          onSendRawInput={onSendRawInput}
        />
      </div>

      <div className="terminal-statusline terminal-statusline-clean">
        <div className="terminal-status-meta terminal-status-meta-clean">
          <span className={`terminal-status-dot tone-${activeSession.state}`} />
          <span>{activeSession.state}</span>
          <span>{activeSession.mode}</span>
          <span>{selectedHost.config.label}</span>
          <span>{selectedHost.config.address}</span>
          <span>{activeSession.cwd}</span>
          <span>history {commandHistorySize}</span>
          {managedBusy ? <span className="tone-warn">command in flight</span> : null}
          {runningDurationLabel ? <span>{runningDurationLabel}</span> : null}
          {failure.exitCode !== 0 ? <span className="tone-warn">exit {failure.exitCode}</span> : null}
        </div>

        <div className="terminal-status-actions">
          <button className="ghost-button small terminal-footer-button" onClick={onToggleSessionMode} disabled={isTransitioning}>
            {activeSession.mode === "raw" ? "Use Managed" : "Use Raw"}
          </button>
          {activeAction && activeSession.mode === "managed" ? (
            <button className="ghost-button small terminal-footer-button" onClick={onUseSuggestedCommand} disabled={managedBusy}>
              Use suggested
            </button>
          ) : null}
          {(managedBusy || activeSession.mode === "raw") ? (
            <button className="ghost-button small terminal-footer-button" onClick={onInterrupt}>
              Interrupt
            </button>
          ) : null}
          {activeSession.state !== "disconnected" ? (
            <button className="ghost-button small terminal-footer-button" onClick={onDisconnect} disabled={activeSession.state === "disconnecting"}>
              {activeSession.state === "disconnecting" ? "Disconnecting" : "Disconnect"}
            </button>
          ) : null}
          <button className={`ghost-button small terminal-footer-button inspect-toggle ${inspectNotice ? "has-signal" : ""}`} onClick={inspectOpen ? onCloseInspect : onOpenInspect}>
            {inspectOpen ? "Hide Inspect" : "Inspect"}
          </button>
        </div>
      </div>
    </section>
  );
}
