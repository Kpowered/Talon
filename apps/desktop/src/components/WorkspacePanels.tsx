import type { DiagnosisContextPacket, Host, Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { AgentSettings, TerminalInputMode, TerminalTab } from "../types/app";
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
  showOperationalPanels: boolean;
  terminalTail: string[];
  isRunningAction: string | null;
  isSubmittingCommand: boolean;
  composerValue: string;
  commandHistorySize: number;
  inputMode: TerminalInputMode;
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
  onSetInputMode: (mode: TerminalInputMode) => void;
  onWriteRawInput: (data: string) => void;
  onToggleSignalFilter: (signal: string) => void;
  onClearSignalFilter: () => void;
  onRerunDiagnosis: () => void;
  onRunAction: (action: SuggestedAction) => void;
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
  showOperationalPanels,
  terminalTail,
  isRunningAction,
  isSubmittingCommand,
  composerValue,
  commandHistorySize,
  inputMode,
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
  onSetInputMode,
  onWriteRawInput,
  onToggleSignalFilter,
  onClearSignalFilter,
  onRerunDiagnosis,
  onRunAction,
}: WorkspacePanelsProps) {
  return (
    <>
      <ShellWorkspace
        activeTab={activeTab}
        activeSession={activeSession}
        activeSessionBusy={activeSessionBusy}
        selectedHost={selectedHost}
        failure={failure}
        activeConnectionIssueTitle={activeConnectionIssueTitle}
        activeConnectionIssueSummary={activeConnectionIssueSummary}
        showOperationalPanels={showOperationalPanels}
        terminalTail={terminalTail}
        isRunningAction={isRunningAction}
        isSubmittingCommand={isSubmittingCommand}
        composerValue={composerValue}
        commandHistorySize={commandHistorySize}
        inputMode={inputMode}
        activeAction={activeAction}
        onSetActiveTab={onSetActiveTab}
        onSetComposerValue={onSetComposerValue}
        onClearComposerValue={onClearComposerValue}
        onSubmitCommand={onSubmitCommand}
        onUseSuggestedCommand={onUseSuggestedCommand}
        onRecallPreviousCommand={onRecallPreviousCommand}
        onRecallNextCommand={onRecallNextCommand}
        onSetInputMode={onSetInputMode}
        onWriteRawInput={onWriteRawInput}
      />

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
    </>
  );
}
