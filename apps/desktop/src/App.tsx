import { useEffect, useMemo, useRef, useState } from "react";
import type { Host, Session, SuggestedAction } from "@talon/core";
import type { ConnectionAuthMethod, HostConnectionConfig, TerminalTab } from "./types/app";
import { TopBar } from "./components/TopBar";
import { HostRail } from "./components/HostRail";
import { ActionNoticeBar } from "./components/ActionNoticeBar";
import { AppEmptyState } from "./components/AppEmptyState";
import { WorkspacePanels } from "./components/WorkspacePanels";
import { useWorkspaceRuntime } from "./hooks/useWorkspaceRuntime";
import { useOperatorActions } from "./hooks/useOperatorActions";
import { useActionNotice } from "./hooks/useActionNotice";
import { useTimelineSignals } from "./hooks/useTimelineSignals";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState<TerminalTab>("shell");
  const { notice: actionNotice, setNotice: setActionNotice, clearNotice } = useActionNotice();
  const [connectionAddress, setConnectionAddress] = useState("");
  const [connectionPort, setConnectionPort] = useState("22");
  const [connectionUsername, setConnectionUsername] = useState("");
  const [connectionAuthMethod, setConnectionAuthMethod] = useState<ConnectionAuthMethod>("agent");
  const [connectionPassword, setConnectionPassword] = useState("");
  const initializedConnectionHostId = useRef<string | null>(null);
  const [hostLabelInput, setHostLabelInput] = useState("");
  const [hostAddressInput, setHostAddressInput] = useState("");
  const [hostRegionInput, setHostRegionInput] = useState("custom");
  const [hostTagsInput, setHostTagsInput] = useState("");
  const [hostPortInput, setHostPortInput] = useState("22");
  const [hostUsernameInput, setHostUsernameInput] = useState("");
  const [hostAuthMethodInput, setHostAuthMethodInput] = useState<ConnectionAuthMethod>("agent");
  const [hostFingerprintHintInput, setHostFingerprintHintInput] = useState("Pending trust");
  const [hostPrivateKeyPathInput, setHostPrivateKeyPathInput] = useState("");
  const [savedHostPasswordInput, setSavedHostPasswordInput] = useState("");
  const [agentBaseUrlInput, setAgentBaseUrlInput] = useState("");
  const [agentModelInput, setAgentModelInput] = useState("");
  const [agentAutoDiagnoseInput, setAgentAutoDiagnoseInput] = useState(true);
  const [agentApiKeyInput, setAgentApiKeyInput] = useState("");
  const [composerValue, setComposerValue] = useState("");
  const [isSavedConfigExpanded, setIsSavedConfigExpanded] = useState(false);
  const [isSessionOverrideExpanded, setIsSessionOverrideExpanded] = useState(false);

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

  useEffect(() => {
    if (!agentSettings) return;
    setAgentBaseUrlInput(agentSettings.baseUrl);
    setAgentModelInput(agentSettings.model);
    setAgentAutoDiagnoseInput(agentSettings.autoDiagnose);
  }, [agentSettings]);

  useEffect(() => {
    const nextHost = workspace?.hosts.find((host: Host) => host.id === selectedHostId) ?? workspace?.hosts[0];
    if (!nextHost) return;
    if (initializedConnectionHostId.current === nextHost.id) return;

    const nextConfig = hostConfigs.find((config: HostConnectionConfig) => config.hostId === nextHost.id) ?? null;
    const derivedUsername = nextHost.config.address.includes("@") ? nextHost.config.address.split("@")[0] : nextConfig?.username ?? "";
    setConnectionAddress(nextHost.config.address);
    setConnectionPort(String(nextConfig?.port ?? 22));
    setConnectionUsername(nextConfig?.username ?? derivedUsername);
    setConnectionAuthMethod((nextConfig?.authMethod as ConnectionAuthMethod) ?? "agent");
    setConnectionPassword("");
    setHostLabelInput(nextHost.config.label);
    setHostAddressInput(nextHost.config.address);
    setHostRegionInput(nextHost.config.region);
    setHostTagsInput(nextHost.config.tags.join(", "));
    setHostPortInput(String(nextConfig?.port ?? 22));
    setHostUsernameInput(nextConfig?.username ?? derivedUsername);
    setHostAuthMethodInput((nextConfig?.authMethod as ConnectionAuthMethod) ?? "agent");
    setHostFingerprintHintInput(nextConfig?.fingerprintHint ?? "Pending trust");
    setHostPrivateKeyPathInput(nextConfig?.privateKeyPath ?? "");
    setSavedHostPasswordInput("");
    initializedConnectionHostId.current = nextHost.id;
  }, [hostConfigs, selectedHostId, workspace]);

  useEffect(() => {
    if (!activeConnectionIssue) return;
    setIsSessionOverrideExpanded(true);
  }, [activeConnectionIssue]);

  function resetConnectionOverride() {
    if (!selectedHost) return;
    const nextConfig = hostConfigs.find((config: HostConnectionConfig) => config.hostId === selectedHost.id) ?? null;
    const derivedUsername = selectedHost.config.address.includes("@") ? selectedHost.config.address.split("@")[0] : nextConfig?.username ?? "";
    setConnectionAddress(selectedHost.config.address);
    setConnectionPort(String(nextConfig?.port ?? 22));
    setConnectionUsername(nextConfig?.username ?? derivedUsername);
    setConnectionAuthMethod((nextConfig?.authMethod as ConnectionAuthMethod) ?? "agent");
    setConnectionPassword("");
  }

  const actions = useOperatorActions({
    selectedHost,
    activeSession,
    activeConnectionIssue,
    connectionAddress,
    connectionPort,
    connectionUsername,
    connectionAuthMethod,
    connectionPassword,
    savedHostPasswordInput,
    hostLabelInput,
    hostAddressInput,
    hostRegionInput,
    hostTagsInput,
    hostPortInput,
    hostUsernameInput,
    hostAuthMethodInput,
    hostFingerprintHintInput,
    hostPrivateKeyPathInput,
    agentSettings,
    agentBaseUrlInput,
    agentModelInput,
    agentAutoDiagnoseInput,
    agentApiKeyInput,
    setWorkspace,
    setHostConfigs,
    setTerminalTail,
    setActionNotice,
    setComposerValue,
    setAgentSettings,
    setSavedHostPasswordInput,
    setActiveConnectionIssue,
    setSelectedHostId,
    resetConnectionOverride,
    refreshWorkspace,
    refreshRegistry,
    refreshAll,
    loadTerminalSnapshot,
  });

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
            agentBaseUrlInput={agentBaseUrlInput}
            agentModelInput={agentModelInput}
            agentAutoDiagnoseInput={agentAutoDiagnoseInput}
            agentApiKeyInput={agentApiKeyInput}
            isSavedConfigExpanded={isSavedConfigExpanded}
            isSessionOverrideExpanded={isSessionOverrideExpanded}
            hostLabelInput={hostLabelInput}
            hostAddressInput={hostAddressInput}
            hostRegionInput={hostRegionInput}
            hostTagsInput={hostTagsInput}
            hostPortInput={hostPortInput}
            hostUsernameInput={hostUsernameInput}
            hostAuthMethodInput={hostAuthMethodInput}
            hostFingerprintHintInput={hostFingerprintHintInput}
            hostPrivateKeyPathInput={hostPrivateKeyPathInput}
            savedHostPasswordInput={savedHostPasswordInput}
            connectionAddress={connectionAddress}
            connectionPort={connectionPort}
            connectionUsername={connectionUsername}
            connectionAuthMethod={connectionAuthMethod}
            connectionPassword={connectionPassword}
            activeConnectionIssue={activeConnectionIssue}
            isSavingHostConfig={actions.isSavingHostConfig}
            isDeletingHostConfig={actions.isDeletingHostConfig}
            onSelectHost={setSelectedHostId}
            onSetAgentBaseUrlInput={setAgentBaseUrlInput}
            onSetAgentModelInput={setAgentModelInput}
            onSetAgentAutoDiagnoseInput={setAgentAutoDiagnoseInput}
            onSetAgentApiKeyInput={setAgentApiKeyInput}
            onSaveAgentConfiguration={() => void actions.saveAgentConfiguration()}
            onSaveAgentApiKey={() => void actions.saveAgentApiKey()}
            onClearAgentApiKey={() => void actions.clearAgentApiKey()}
            onToggleSavedConfig={() => setIsSavedConfigExpanded((current) => !current)}
            onSetHostLabelInput={setHostLabelInput}
            onSetHostAddressInput={setHostAddressInput}
            onSetHostRegionInput={setHostRegionInput}
            onSetHostTagsInput={setHostTagsInput}
            onSetHostPortInput={setHostPortInput}
            onSetHostUsernameInput={setHostUsernameInput}
            onSetHostAuthMethodInput={setHostAuthMethodInput}
            onSetHostFingerprintHintInput={setHostFingerprintHintInput}
            onSetHostPrivateKeyPathInput={setHostPrivateKeyPathInput}
            onSetSavedHostPasswordInput={setSavedHostPasswordInput}
            onSaveSavedHostPassword={() => void actions.saveSavedHostPassword()}
            onClearSavedHostPassword={() => void actions.clearSavedHostPassword()}
            onUpdateSelectedHost={() => void actions.updateSelectedHost()}
            onDeleteSelectedHost={() => void actions.deleteSelectedHost()}
            onToggleSessionOverride={() => setIsSessionOverrideExpanded((current) => !current)}
            onSetConnectionAddress={setConnectionAddress}
            onSetConnectionPort={setConnectionPort}
            onSetConnectionUsername={setConnectionUsername}
            onSetConnectionAuthMethod={setConnectionAuthMethod}
            onSetConnectionPassword={setConnectionPassword}
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
