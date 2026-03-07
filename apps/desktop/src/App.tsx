import { useEffect, useMemo, useState } from "react";
import type { Host, Session, SuggestedAction } from "@talon/core";
import type { HostConnectionConfig, TerminalTab } from "./types/app";
import { TopBar } from "./components/TopBar";
import { HostRail } from "./components/HostRail";
import { ActionNoticeBar } from "./components/ActionNoticeBar";
import { AppEmptyState } from "./components/AppEmptyState";
import { WorkspacePanels } from "./components/WorkspacePanels";
import { useWorkspaceRuntime } from "./hooks/useWorkspaceRuntime";
import { useOperatorActions } from "./hooks/useOperatorActions";
import { useActionNotice } from "./hooks/useActionNotice";
import { useTimelineSignals } from "./hooks/useTimelineSignals";
import { useHostRailState } from "./hooks/useHostRailState";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState<TerminalTab>("shell");
  const { notice: actionNotice, setNotice: setActionNotice, clearNotice } = useActionNotice();
  const [composerValue, setComposerValue] = useState("");

  const runtime = useWorkspaceRuntime({ onError: setActionNotice });
  const {
    workspace,
    setWorkspace,
    selectedHostId,
    setSelectedHostId,
    isLoadingState,
    hostConfigs,
    setHostConfigs,
    busySessionIds,
    activeConnectionIssue,
    setActiveConnectionIssue,
    terminalTail,
    setTerminalTail,
    agentSettings,
    setAgentSettings,
    latestContextPacket,
    refreshWorkspace,
    refreshRegistry,
    refreshAll,
    loadTerminalSnapshot,
  } = runtime;

  const activeSession = useMemo(
    () => workspace?.sessions.find((session: Session) => session.id === workspace.activeSessionId) ?? null,
    [workspace],
  );

  const hosts = workspace?.hosts ?? [];
  const selectedHost = hosts.find((host: Host) => host.id === selectedHostId) ?? hosts[0] ?? null;
  const selectedHostConfig = hostConfigs.find((config: HostConnectionConfig) => config.hostId === selectedHostId) ?? null;
  const diagnosis = (workspace?.latestDiagnosis ?? null) as (typeof workspace extends null
    ? never
    : NonNullable<typeof workspace>["latestDiagnosis"] & {
        provider?: string;
        errorMessage?: string | null;
        contextPacketId?: string;
      }) | null;
  const failure = workspace?.latestFailure ?? null;
  const timeline = workspace?.timeline ?? [];
  const activeAction = diagnosis?.suggestedActions.find((action: SuggestedAction) => action.status === "ready") ?? null;
  const activeSessionBusy = activeSession ? busySessionIds.includes(activeSession.id) : false;
  const showOperationalPanels = activeSession?.state !== "disconnected";
  const {
    activeSignalFilter,
    setActiveSignalFilter,
    repeatedSignalCounts,
    signalSummary: timelineSignalSummary,
    visibleTimeline,
  } = useTimelineSignals(timeline);
  const hostRail = useHostRailState({
    workspaceHosts: hosts,
    selectedHostId,
    hostConfigs,
    agentSettings,
    activeConnectionIssue,
  });

  const actions = useOperatorActions({
    selectedHost,
    activeSession,
    activeConnectionIssue,
    connectionAddress: hostRail.sessionOverride.address,
    connectionPort: hostRail.sessionOverride.port,
    connectionUsername: hostRail.sessionOverride.username,
    connectionAuthMethod: hostRail.sessionOverride.authMethod,
    connectionPassword: hostRail.sessionOverride.password,
    savedHostPasswordInput: hostRail.savedHostForm.savedPassword,
    hostLabelInput: hostRail.savedHostForm.label,
    hostAddressInput: hostRail.savedHostForm.address,
    hostRegionInput: hostRail.savedHostForm.region,
    hostTagsInput: hostRail.savedHostForm.tags,
    hostPortInput: hostRail.savedHostForm.port,
    hostUsernameInput: hostRail.savedHostForm.username,
    hostAuthMethodInput: hostRail.savedHostForm.authMethod,
    hostFingerprintHintInput: hostRail.savedHostForm.fingerprintHint,
    hostPrivateKeyPathInput: hostRail.savedHostForm.privateKeyPath,
    agentSettings,
    agentBaseUrlInput: hostRail.agentForm.baseUrl,
    agentModelInput: hostRail.agentForm.model,
    agentAutoDiagnoseInput: hostRail.agentForm.autoDiagnose,
    agentApiKeyInput: hostRail.agentForm.apiKey,
    setWorkspace,
    setHostConfigs,
    setTerminalTail,
    setActionNotice,
    setComposerValue,
    setAgentSettings,
    setSavedHostPasswordInput: (value) => {
      hostRail.setSavedHostForm((current) => ({
        ...current,
        savedPassword: typeof value === "function" ? value(current.savedPassword) : value,
      }));
    },
    setActiveConnectionIssue,
    setSelectedHostId,
    resetConnectionOverride: () => hostRail.resetSessionOverride(selectedHost),
    refreshWorkspace,
    refreshRegistry,
    refreshAll,
    loadTerminalSnapshot,
  });

  useEffect(() => {
    if (!agentSettings?.hasApiKey && !hostRail.agentForm.apiKey) return;
    if (agentSettings?.hasApiKey) return;
    hostRail.setAgentForm((current) => ({ ...current, apiKey: "" }));
  }, [agentSettings?.hasApiKey, hostRail.agentForm.apiKey, hostRail.setAgentForm]);

  if (!workspace || !diagnosis || !failure || !activeSession || !selectedHost) {
    return <AppEmptyState isLoading={isLoadingState} />;
  }

  return (
    <main className="app-shell">
      <TopBar
        hosts={hosts}
        selectedHostId={selectedHost.id}
        isSavingHostConfig={actions.isSavingHostConfig}
        isReconnectingSession={actions.isReconnectingSession}
        isDisconnectingSession={actions.isDisconnectingSession}
        isConnectingSession={actions.isConnectingSession}
        onSelectHost={setSelectedHostId}
        onCreateHost={() => void actions.createHost()}
        onReconnect={() => void actions.reconnectActiveSession()}
        onDisconnect={() => void actions.disconnectActiveSession()}
        onConnect={() => void actions.connectSelectedHost()}
      />

      {actionNotice ? <ActionNoticeBar notice={actionNotice} onDismiss={clearNotice} /> : null}

      <section className={`workspace-grid ${showOperationalPanels ? "connected" : "session-first"}`}>
        {showOperationalPanels ? (
          <HostRail
            hosts={hosts}
            selectedHost={selectedHost}
            selectedHostConfig={selectedHostConfig}
            agentSettings={agentSettings}
            agentForm={hostRail.agentForm}
            savedHostForm={hostRail.savedHostForm}
            sessionOverride={hostRail.sessionOverride}
            activeConnectionIssue={activeConnectionIssue}
            isSavedConfigExpanded={hostRail.isSavedConfigExpanded}
            isSessionOverrideExpanded={hostRail.isSessionOverrideExpanded}
            isSavingHostConfig={actions.isSavingHostConfig}
            isDeletingHostConfig={actions.isDeletingHostConfig}
            onSelectHost={setSelectedHostId}
            onSetAgentForm={hostRail.setAgentForm}
            onSaveAgentConfiguration={() => void actions.saveAgentConfiguration()}
            onSaveAgentApiKey={() => void actions.saveAgentApiKey()}
            onClearAgentApiKey={() => void actions.clearAgentApiKey()}
            onToggleSavedConfig={() => hostRail.setIsSavedConfigExpanded((current) => !current)}
            onSetSavedHostForm={hostRail.setSavedHostForm}
            onSaveSavedHostPassword={() => void actions.saveSavedHostPassword()}
            onClearSavedHostPassword={() => void actions.clearSavedHostPassword()}
            onUpdateSelectedHost={() => void actions.updateSelectedHost()}
            onDeleteSelectedHost={() => void actions.deleteSelectedHost()}
            onToggleSessionOverride={() => hostRail.setIsSessionOverrideExpanded((current) => !current)}
            onSetSessionOverride={hostRail.setSessionOverride}
            onResetConnectionOverride={actions.resetConnectionOverride}
            onPrepareHostTrustFlow={() => void actions.prepareHostTrustFlow()}
            onConfirmHostTrustFlow={() => void actions.confirmHostTrustFlow()}
          />
        ) : null}

        <WorkspacePanels
          activeTab={activeTab}
          activeSession={activeSession}
          activeSessionBusy={activeSessionBusy}
          selectedHost={selectedHost}
          failure={failure}
          diagnosis={diagnosis}
          activeConnectionIssueTitle={activeConnectionIssue?.title ?? null}
          activeConnectionIssueSummary={activeConnectionIssue?.summary ?? null}
          showOperationalPanels={showOperationalPanels}
          terminalTail={terminalTail}
          isRunningAction={actions.isRunningAction}
          isSubmittingCommand={actions.isSubmittingCommand}
          composerValue={composerValue}
          activeAction={activeAction}
          actionSummary={actionNotice?.kind === "success" ? actionNotice.message : null}
          agentSettings={agentSettings}
          latestContextPacket={latestContextPacket}
          timelineSignalSummary={timelineSignalSummary}
          activeTimelineSignalFilter={activeSignalFilter}
          visibleTimeline={visibleTimeline}
          repeatedSignalCounts={repeatedSignalCounts}
          onSetActiveTab={setActiveTab}
          onSetComposerValue={setComposerValue}
          onSubmitCommand={() => void actions.submitCommand(composerValue)}
          onToggleSignalFilter={(signal) => setActiveSignalFilter((current) => (current === signal ? null : signal))}
          onClearSignalFilter={() => setActiveSignalFilter(null)}
          onRerunDiagnosis={() => void actions.rerunDiagnosis()}
          onRunAction={(action) => void actions.runAction(action)}
        />
      </section>
    </main>
  );
}

export default App;

