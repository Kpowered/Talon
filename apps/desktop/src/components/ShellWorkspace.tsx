import type { Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { TerminalTab } from "../types/app";
import { statusLabel } from "../lib/formatters";

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
  activeAction: SuggestedAction | null;
  onSetActiveTab: (tab: TerminalTab) => void;
  onSetComposerValue: (value: string) => void;
  onSubmitCommand: () => void;
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
  activeAction,
  onSetActiveTab,
  onSetComposerValue,
  onSubmitCommand,
}: ShellWorkspaceProps) {
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
          {activeSessionBusy ? "Command in flight" : activeSession.autoCaptureEnabled ? "Auto-capture ON" : "Auto-capture OFF"}
        </span>
      </div>

      {activeTab === "shell" ? (
        <div className="shell-pane">
          <div className="terminal-window compact-terminal-window">
            {terminalTail.map((line, index) => (
              <div
                key={`${line}${index}`}
                className={line.startsWith("$") || /^\d{2}:\d{2}:\d{2}/.test(line) ? "terminal-line prompt" : "terminal-line"}
              >
                {line || <span>&nbsp;</span>}
              </div>
            ))}
            {isRunningAction ? <div className="terminal-line prompt">...running suggested action through Tauri backend</div> : null}
            {isSubmittingCommand ? <div className="terminal-line prompt">...submitting command to managed session</div> : null}
          </div>

          <div className="command-composer compact-composer terminal-composer">
            <input
              className="composer-field"
              value={composerValue}
              onChange={(event) => onSetComposerValue(event.target.value)}
              placeholder="Type a command to send to the active session"
            />
            <div className="composer-actions">
              <button className="ghost-button small" onClick={() => activeAction && onSetComposerValue(activeAction.command)}>
                Use suggested
              </button>
              <button
                className="primary-button small"
                onClick={onSubmitCommand}
                disabled={isSubmittingCommand || activeSessionBusy || !composerValue.trim()}
              >
                {isSubmittingCommand ? "Sending..." : activeSessionBusy ? "Busy..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
