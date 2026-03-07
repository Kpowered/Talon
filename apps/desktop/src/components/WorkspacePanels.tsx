import type { DiagnosisContextPacket, Host, Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { ActiveCommandSummary, AgentSettings, TerminalTab } from "../types/app";
import { ShellWorkspace } from "./ShellWorkspace";
import { TimelineView } from "./views/TimelineView";
import { DiagnosisView } from "./views/DiagnosisView";
import { ArtifactsView } from "./views/ArtifactsView";

type WorkspacePanelsProps = {
  activeTab: TerminalTab;
  activeSession: Session;
  activeSessionBusy: boolean;
  selectedHost: Host;
  failure: TalonWorkspaceState["latestFailure"];
  diagnosis: TalonWorkspaceState["latestDiagnosis"] & {
    provider?: string;
    errorMessage?: string | null;
    contextPacketId?: string;
  };
  activeConnectionIssueTitle: string | null;
  activeConnectionIssueSummary: string | null;
  activeCommand: ActiveCommandSummary | null;
  showOperationalPanels: boolean;
  terminalTail: string[];
  isRunningAction: string | null;
  isSubmittingCommand: boolean;
  composerValue: string;
  commandHistorySize: number;
  activeAction: SuggestedAction | null;
  actionSummary: string | null;
  agentSettings: AgentSettings | null;
  latestContextPacket: DiagnosisContextPacket | null;
  timelineSignalSummary: Array<[string, number]>;
  activeTimelineSignalFilter: string | null;
  visibleTimeline: TalonWorkspaceState["timeline"];
  repeatedSignalCounts: Map<string, number>;
  onSetActiveTab: (tab: TerminalTab) => void;
  onSetComposerValue: (value: string) => void;
  onClearComposerValue: () => void;
  onSubmitCommand: () => void;
  onUseSuggestedCommand: () => void;
  onRecallPreviousCommand: () => void;
  onRecallNextCommand: () => void;
  onToggleSignalFilter: (signal: string) => void;
  onInterrupt: () => void;
  onClearSignalFilter: () => void;
  onRerunDiagnosis: () => void;
  onRunAction: (action: SuggestedAction) => void;
  onOpenInspect: () => void;
  onCloseInspect: () => void;
  inspectNotice: string | null;
};

export function WorkspacePanels({
  activeTab,
  activeSession,
  activeSessionBusy,
  selectedHost,
  failure,
  diagnosis,
  activeConnectionIssueTitle,
  activeConnectionIssueSummary,
  activeCommand,
  showOperationalPanels,
  terminalTail,
  isRunningAction,
  isSubmittingCommand,
  composerValue,
  commandHistorySize,
  activeAction,
  actionSummary,
  agentSettings,
  latestContextPacket,
  timelineSignalSummary,
  activeTimelineSignalFilter,
  visibleTimeline,
  repeatedSignalCounts,
  onSetActiveTab,
  onSetComposerValue,
  onClearComposerValue,
  onSubmitCommand,
  onUseSuggestedCommand,
  onRecallPreviousCommand,
  onRecallNextCommand,
  onToggleSignalFilter,
  onClearSignalFilter,
  onInterrupt,
  onRerunDiagnosis,
  onRunAction,
  onOpenInspect,
  onCloseInspect,
  inspectNotice,
}: WorkspacePanelsProps) {
  const inspectOpen = activeTab !== "shell";
  const inspectTitle = activeConnectionIssueTitle ?? (failure.exitCode !== 0 ? "Captured failure context" : "Session details");
  const inspectSummary = activeConnectionIssueSummary
    ?? (failure.exitCode !== 0
      ? failure.summary
      : "Timeline, diagnosis, and captured artifacts stay here so the shell remains the primary workspace.");

  return (
    <section className={`workspace-panels ${inspectOpen ? "inspect-open" : "inspect-collapsed"}`}>
      <ShellWorkspace
        activeTab={activeTab}
        activeSession={activeSession}
        activeSessionBusy={activeSessionBusy}
        selectedHost={selectedHost}
        failure={failure}
        activeConnectionIssueTitle={activeConnectionIssueTitle}
        activeConnectionIssueSummary={activeConnectionIssueSummary}
        activeCommand={activeCommand}
        showOperationalPanels={showOperationalPanels}
        terminalTail={terminalTail}
        isSubmittingCommand={isSubmittingCommand}
        composerValue={composerValue}
        commandHistorySize={commandHistorySize}
        activeAction={activeAction}
        inspectNotice={inspectNotice}        onSetComposerValue={onSetComposerValue}
        onClearComposerValue={onClearComposerValue}
        onSubmitCommand={onSubmitCommand}
        onUseSuggestedCommand={onUseSuggestedCommand}
        onRecallPreviousCommand={onRecallPreviousCommand}
        onRecallNextCommand={onRecallNextCommand}
        onInterrupt={onInterrupt}
        onOpenInspect={onOpenInspect}
        onCloseInspect={onCloseInspect}
      />

      {inspectOpen ? (
        <aside className="panel compact-panel inspect-drawer">
          <div className="inspect-drawer-header">
            <div>
              <p className="panel-kicker">Inspect</p>
              <h2>{inspectTitle}</h2>
              <p className="inspect-drawer-copy">{inspectSummary}</p>
            </div>
            <button className="ghost-button small" onClick={onCloseInspect}>
              Close
            </button>
          </div>

          <div className="inspect-tabbar">
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

          <div className="inspect-drawer-body">
            {activeTab === "timeline" ? (
              <TimelineView
                failure={failure}
                timelineSignalSummary={timelineSignalSummary}
                activeTimelineSignalFilter={activeTimelineSignalFilter}
                onToggleSignalFilter={onToggleSignalFilter}
                onClearSignalFilter={onClearSignalFilter}
                visibleTimeline={visibleTimeline}
                repeatedSignalCounts={repeatedSignalCounts}
              />
            ) : null}

            {activeTab === "diagnosis" ? (
              <DiagnosisView
                actionSummary={actionSummary}
                diagnosis={diagnosis}
                failure={failure}
                agentSettings={agentSettings}
                selectedHost={selectedHost}
                isRunningAction={isRunningAction}
                onRerunDiagnosis={onRerunDiagnosis}
                onRunAction={onRunAction}
              />
            ) : null}

            {activeTab === "artifacts" ? <ArtifactsView failure={failure} latestContextPacket={latestContextPacket} /> : null}
          </div>
        </aside>
      ) : null}
    </section>
  );
}
