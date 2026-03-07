import type { DiagnosisContextPacket, Host, Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { ActiveCommandSummary, AgentSettings, TerminalTab } from "../types/app";
import { ShellWorkspace } from "./ShellWorkspace";
import { TimelineView } from "./views/TimelineView";
import { DiagnosisView } from "./views/DiagnosisView";
import { ArtifactsView } from "./views/ArtifactsView";

type WorkspacePanelsProps = {
  activeTab: TerminalTab;
  activeSession: Session;
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
  terminalTail: string[];
  isRunningAction: string | null;
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
  onDisconnect: () => void;
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
  selectedHost,
  failure,
  diagnosis,
  activeConnectionIssueTitle,
  activeConnectionIssueSummary,
  activeCommand,
  terminalTail,
  isRunningAction,
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
  onInterrupt,
  onDisconnect,
  onClearSignalFilter,
  onRerunDiagnosis,
  onRunAction,
  onOpenInspect,
  onCloseInspect,
  inspectNotice,
}: WorkspacePanelsProps) {
  const inspectOpen = activeTab !== "shell";
  const inspectTitle = activeConnectionIssueTitle ?? (failure.exitCode === 130 ? "Operator interrupt" : failure.exitCode !== 0 ? "Failure context" : "Session details");
  const inspectSummary = activeConnectionIssueSummary
    ?? (failure.exitCode === 130
      ? "The operator interrupted the managed command. Review the partial output before rerunning it."
      : failure.exitCode !== 0
        ? failure.summary
        : null);

  return (
    <section className={`workspace-main ${inspectOpen ? "inspect-open" : "inspect-closed"}`}>
      <ShellWorkspace
        activeTab={activeTab}
        activeSession={activeSession}
        selectedHost={selectedHost}
        failure={failure}
        activeConnectionIssueTitle={activeConnectionIssueTitle}
        activeConnectionIssueSummary={activeConnectionIssueSummary}
        activeCommand={activeCommand}
        terminalTail={terminalTail}
        composerValue={composerValue}
        commandHistorySize={commandHistorySize}
        activeAction={activeAction}
        inspectNotice={inspectNotice}
        onSetComposerValue={onSetComposerValue}
        onClearComposerValue={onClearComposerValue}
        onSubmitCommand={onSubmitCommand}
        onUseSuggestedCommand={onUseSuggestedCommand}
        onRecallPreviousCommand={onRecallPreviousCommand}
        onRecallNextCommand={onRecallNextCommand}
        onInterrupt={onInterrupt}
        onDisconnect={onDisconnect}
        onOpenInspect={onOpenInspect}
        onCloseInspect={onCloseInspect}
      />

      {inspectOpen ? (
        <aside className="inspect-drawer panel compact-panel">
          <div className="inspect-drawer-header compact">
            <h2>{inspectTitle}</h2>
            <button className="ghost-button small" onClick={onCloseInspect}>
              Close
            </button>
          </div>

          {inspectSummary ? <p className="inspect-drawer-copy compact">{inspectSummary}</p> : null}

          <div className="inspect-tabbar compact">
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

          <div className="inspect-drawer-body compact">
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
