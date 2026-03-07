import type { Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import { useEffect, useState } from "react";
import type { ActiveCommandSummary, TerminalTab } from "../types/app";
import { statusLabel } from "../lib/formatters";
import { XtermShell } from "./XtermShell";

type ShellWorkspaceProps = {
  activeTab: TerminalTab;
  activeSession: Session;
  activeSessionBusy: boolean;
  selectedHost: TalonWorkspaceState["hosts"][number];
  failure: TalonWorkspaceState["latestFailure"];
  activeConnectionIssueTitle: string | null;
  activeConnectionIssueSummary: string | null;
  activeCommand: ActiveCommandSummary | null;
  showOperationalPanels: boolean;
  terminalTail: string[];
  isSubmittingCommand: boolean;
  composerValue: string;
  commandHistorySize: number;
  activeAction: SuggestedAction | null;
  onSetActiveTab: (tab: TerminalTab) => void;
  onSetComposerValue: (value: string) => void;
  onClearComposerValue: () => void;
  onSubmitCommand: () => void;
  onUseSuggestedCommand: () => void;
  onRecallPreviousCommand: () => void;
  onRecallNextCommand: () => void;
  onInterrupt: () => void;
};

export function ShellWorkspace({
  activeTab,
  activeSession,
  activeSessionBusy,
  selectedHost,
  failure,
  activeConnectionIssueTitle,
  activeConnectionIssueSummary,
  activeCommand,
  showOperationalPanels,
  terminalTail,
  isSubmittingCommand,
  composerValue,
  commandHistorySize,
  activeAction,
  onSetActiveTab,
  onSetComposerValue,
  onClearComposerValue,
  onSubmitCommand,
  onUseSuggestedCommand,
  onRecallPreviousCommand,
  onRecallNextCommand,
  onInterrupt,
}: ShellWorkspaceProps) {
  const managedBusy = isSubmittingCommand || activeSessionBusy;
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());

  useEffect(() => {
    if (!managedBusy || !activeCommand?.startedAt) {
      return;
    }
    const interval = window.setInterval(() => {
      setRuntimeNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeCommand?.startedAt, managedBusy]);

  const runningDurationLabel = activeCommand?.startedAt
    ? (() => {
        const elapsedSeconds = Math.max(0, Math.floor((runtimeNow - Date.parse(activeCommand.startedAt)) / 1000));
        const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
        const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
        return `${minutes}:${seconds}`;
      })()
    : null;

  return (
    <section className="panel panel-terminal compact-panel main-workspace shell-workspace">
      <div className="panel-header compact-panel-header terminal-header-row">
        <div>
          <p className="panel-kicker">Workspace</p>
          <div className="title-row compact">
            <h2>{selectedHost.config.label}</h2>
            <span className={`live-dot status-${failure.severity}`}>{statusLabel(failure.severity)}</span>
          </div>
        </div>
        <div className="terminal-tabs compact-tabs">
          <button className={`tab ${activeTab === "shell" ? "active" : ""}`} onClick={() => onSetActiveTab("shell")}>
            Shell
          </button>
          <button className={`tab ${activeTab === "timeline" ? "active" : ""}`} onClick={() => onSetActiveTab("timeline")}>
            Timeline
          </button>
          <button className={`tab ${activeTab === "diagnosis" ? "active" : ""}`} onClick={() => onSetActiveTab("diagnosis")}>
            Diagnosis
          </button>
          <button className={`tab ${activeTab === "artifacts" ? "active" : ""}`} onClick={() => onSetActiveTab("artifacts")}>
            Artifacts
          </button>
        </div>
      </div>

      {!showOperationalPanels || activeConnectionIssueTitle ? (
        <div className="connection-banner shell-banner">
          <strong>{activeConnectionIssueTitle ?? "Terminal-first workspace"}</strong>
          <p>
            {activeConnectionIssueSummary ??
              "Pick a host, adjust the next-connect override only if needed, then connect. Talon will expand the rest of the operator UI after the session is live."}
          </p>
        </div>
      ) : null}

      <div className="terminal-toolbar compact-terminal-toolbar">
        <span className="terminal-path">{activeSession.cwd}</span>
        <span className="terminal-meta-chip">{selectedHost.config.address}</span>
        <span className="terminal-meta-chip">{activeSession.state}</span>
        <span className="terminal-meta-chip">{failure.exitCode !== 0 ? `exit ${failure.exitCode}` : "clean"}</span>
        <span className="terminal-mode">
          {activeSession.state === "connecting"
            ? "Connecting"
            : managedBusy
              ? "Command in flight"
              : activeSession.autoCaptureEnabled
                ? "Auto-capture ON"
                : "Auto-capture OFF"}
        </span>
        {managedBusy && activeCommand ? <span className="terminal-meta-chip">{activeCommand.command}</span> : null}
        {managedBusy && runningDurationLabel ? <span className="terminal-meta-chip">running {runningDurationLabel}</span> : null}
        {managedBusy ? (
          <button className="ghost-button small" onClick={onInterrupt}>
            Interrupt
          </button>
        ) : null}
      </div>

      {activeTab === "shell" ? (
        <div className="shell-pane shell-pane-xterm">
          <div className="terminal-command-bar single-mode">
            <div className="composer-meta-row terminal-hints-row">
              <span className="composer-shortcut">Direct terminal input</span>
              <span className="composer-shortcut">Enter submits</span>
              <span className="composer-shortcut">Up/Down history {commandHistorySize > 0 ? `(${commandHistorySize})` : ""}</span>
              <span className="composer-shortcut">Esc clears</span>
            </div>
            <div className="composer-actions terminal-inline-actions">
              <button className="ghost-button small" onClick={onUseSuggestedCommand} disabled={!activeAction || managedBusy}>
                Use suggested
              </button>
              {managedBusy ? (
                <span className="terminal-inline-status">
                  {runningDurationLabel ? `Running for ${runningDurationLabel}` : "Waiting for command completion"}
                </span>
              ) : null}
            </div>
          </div>

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
      ) : null}
    </section>
  );
}
