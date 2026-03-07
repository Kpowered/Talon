import type { Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { TerminalInputMode, TerminalTab } from "../types/app";
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
  showOperationalPanels: boolean;
  terminalTail: string[];
  isRunningAction: string | null;
  isSubmittingCommand: boolean;
  composerValue: string;
  commandHistorySize: number;
  inputMode: TerminalInputMode;
  activeAction: SuggestedAction | null;
  onSetActiveTab: (tab: TerminalTab) => void;
  onSetComposerValue: (value: string) => void;
  onClearComposerValue: () => void;
  onSubmitCommand: () => void;
  onUseSuggestedCommand: () => void;
  onRecallPreviousCommand: () => void;
  onRecallNextCommand: () => void;
  onSetInputMode: (mode: TerminalInputMode) => void;
  onWriteRawInput: (data: string) => void;
};

export function ShellWorkspace({
  activeTab,
  activeSession,
  activeSessionBusy,
  selectedHost,
  failure,
  activeConnectionIssueTitle,
  activeConnectionIssueSummary,
  showOperationalPanels,
  terminalTail,
  isRunningAction,
  isSubmittingCommand,
  composerValue,
  commandHistorySize,
  inputMode,
  activeAction,
  onSetActiveTab,
  onSetComposerValue,
  onClearComposerValue,
  onSubmitCommand,
  onUseSuggestedCommand,
  onRecallPreviousCommand,
  onRecallNextCommand,
  onSetInputMode,
  onWriteRawInput,
}: ShellWorkspaceProps) {
  const managedBusy = isSubmittingCommand || activeSessionBusy;

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
        <span className="terminal-mode">{managedBusy ? "Command in flight" : activeSession.autoCaptureEnabled ? "Auto-capture ON" : "Auto-capture OFF"}</span>
      </div>

      {activeTab === "shell" ? (
        <div className="shell-pane shell-pane-xterm">
          <div className="terminal-command-bar">
            <div className="terminal-mode-toggle" role="tablist" aria-label="Terminal input mode">
              <button
                type="button"
                className={`mode-chip ${inputMode === "managed" ? "active" : ""}`}
                onClick={() => onSetInputMode("managed")}
              >
                Managed
              </button>
              <button
                type="button"
                className={`mode-chip ${inputMode === "raw" ? "active" : ""}`}
                onClick={() => onSetInputMode("raw")}
                disabled={managedBusy}
              >
                Raw
              </button>
            </div>
            <div className="composer-meta-row terminal-hints-row">
              {inputMode === "managed" ? (
                <>
                  <span className="composer-shortcut">Direct terminal input</span>
                  <span className="composer-shortcut">Enter submits</span>
                  <span className="composer-shortcut">Up/Down history {commandHistorySize > 0 ? `(${commandHistorySize})` : ""}</span>
                </>
              ) : (
                <>
                  <span className="composer-shortcut">Raw input beta</span>
                  <span className="composer-shortcut">Output remains line-buffered</span>
                  <span className="composer-shortcut">Auto-capture limited</span>
                </>
              )}
            </div>
            <div className="composer-actions terminal-inline-actions">
              <button className="ghost-button small" onClick={onUseSuggestedCommand} disabled={!activeAction || inputMode !== "managed"}>
                Use suggested
              </button>
              {managedBusy && inputMode === "managed" ? <span className="terminal-inline-status">Waiting for command completion</span> : null}
            </div>
          </div>

          {inputMode === "raw" ? (
            <div className="terminal-mode-banner warning">
              Raw terminal mode is enabled. Keystrokes go directly to SSH stdin, but Talon command completion and failure capture stay limited until you switch back to Managed mode.
            </div>
          ) : null}

          <XtermShell
            sessionId={activeSession.id}
            terminalTail={[
              ...terminalTail,
              ...(isRunningAction ? ["...running suggested action through Tauri backend"] : []),
              ...(isSubmittingCommand ? ["...submitting command to managed session"] : []),
            ]}
            draft={composerValue}
            inputMode={inputMode}
            isBusy={managedBusy}
            onDraftChange={onSetComposerValue}
            onSubmitCommand={onSubmitCommand}
            onRecallPreviousCommand={onRecallPreviousCommand}
            onRecallNextCommand={onRecallNextCommand}
            onClearDraft={onClearComposerValue}
            onWriteRawInput={onWriteRawInput}
          />
        </div>
      ) : null}
    </section>
  );
}
