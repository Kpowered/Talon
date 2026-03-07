import { useCallback, useEffect, useMemo, useState } from "react";
import type { Host, Session, SuggestedAction } from "@talon/core";
import type { AppCommandError, HostConnectionConfig, NewHostDraft, TerminalTab } from "./types/app";
import { TopBar } from "./components/TopBar";
import { HostRail } from "./components/HostRail";
import { ActionNoticeBar } from "./components/ActionNoticeBar";
import { AppEmptyState } from "./components/AppEmptyState";
import { WorkspacePanels } from "./components/WorkspacePanels";
import { NewHostDialog } from "./components/NewHostDialog";
import { ManageHostsDialog } from "./components/ManageHostsDialog";
import { useWorkspaceRuntime } from "./hooks/useWorkspaceRuntime";
import { useOperatorActions } from "./hooks/useOperatorActions";
import { useActionNotice } from "./hooks/useActionNotice";
import { useTimelineSignals } from "./hooks/useTimelineSignals";
import { useHostRailState } from "./hooks/useHostRailState";
import { getHostPassword } from "./lib/tauri";
import "./App.css";

const EMPTY_NEW_HOST_DRAFT: NewHostDraft = {
  label: "",
  address: "",
  port: "22",
  username: "root",
  authMethod: "password",
  password: "",
  region: "custom",
  tags: "",
};

function App() {
  const [activeTab, setActiveTab] = useState<TerminalTab>("shell");
  const { notice: actionNotice, setNotice: setActionNotice, clearNotice } = useActionNotice();
  const [commandDraftBySessionId, setCommandDraftBySessionId] = useState<Record<string, string>>({});
  const [commandHistoryBySessionId, setCommandHistoryBySessionId] = useState<Record<string, string[]>>({});
  const [commandHistoryCursorBySessionId, setCommandHistoryCursorBySessionId] = useState<Record<string, number | null>>({});
  const [commandHistoryScratchBySessionId, setCommandHistoryScratchBySessionId] = useState<Record<string, string>>({});
  const [isNewHostDialogOpen, setIsNewHostDialogOpen] = useState(false);
  const [isManageHostsDialogOpen, setIsManageHostsDialogOpen] = useState(false);
  const [newHostDraft, setNewHostDraft] = useState<NewHostDraft>(EMPTY_NEW_HOST_DRAFT);
  const [isSavingNewHost, setIsSavingNewHost] = useState(false);
  const [isConnectingNewHost, setIsConnectingNewHost] = useState(false);
  const [newHostDialogError, setNewHostDialogError] = useState<string | null>(null);
  const [isLoadingManageHostPassword, setIsLoadingManageHostPassword] = useState(false);

  const runtime = useWorkspaceRuntime({ onError: setActionNotice });
  const {
    workspace,
    setWorkspace,
    selectedHostId,
    setSelectedHostId,
    isLoadingState,
    hostConfigs,
    setHostConfigs,
    registryActiveSessionId,
    busySessionIds,
    activeConnectionIssue,
    setActiveConnectionIssue,
    activeCommand,
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

  const resolvedActiveSessionId = registryActiveSessionId || workspace?.activeSessionId || null;
  const activeSession = useMemo(
    () => workspace?.sessions.find((session: Session) => session.id === resolvedActiveSessionId) ?? workspace?.sessions.find((session: Session) => session.id === workspace.activeSessionId) ?? workspace?.sessions[0] ?? null,
    [resolvedActiveSessionId, workspace],
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
  const composerValue = activeSession ? commandDraftBySessionId[activeSession.id] ?? "" : "";
  const activeSessionBusy = activeSession ? busySessionIds.includes(activeSession.id) : false;
  const showOperationalPanels = activeSession?.state !== "disconnected";
  const inspectNotice = activeConnectionIssue?.title ?? (failure?.exitCode != null && failure.exitCode !== 0 ? `Exit ${failure.exitCode}` : null);
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


  const setComposerValue = useCallback(
    (value: React.SetStateAction<string>) => {
      if (!activeSession) return;
      setCommandDraftBySessionId((current) => {
        const nextValue = typeof value === "function" ? value(current[activeSession.id] ?? "") : value;
        return { ...current, [activeSession.id]: nextValue };
      });
      setCommandHistoryCursorBySessionId((current) => ({ ...current, [activeSession.id]: null }));
    },
    [activeSession],
  );

  const openInspectPanel = useCallback(() => {
    if (activeConnectionIssue) {
      setActiveTab("timeline");
      return;
    }
    if (failure?.exitCode != null && failure.exitCode !== 0) {
      setActiveTab("diagnosis");
      return;
    }
    setActiveTab("timeline");
  }, [activeConnectionIssue, failure?.exitCode]);

  const closeInspectPanel = useCallback(() => {
    setActiveTab("shell");
  }, []);
  const clearComposerValue = useCallback(() => {
    if (!activeSession) return;
    setCommandDraftBySessionId((current) => ({ ...current, [activeSession.id]: "" }));
    setCommandHistoryCursorBySessionId((current) => ({ ...current, [activeSession.id]: null }));
    setCommandHistoryScratchBySessionId((current) => ({ ...current, [activeSession.id]: "" }));
  }, [activeSession]);

  const recallPreviousCommand = useCallback(() => {
    if (!activeSession) return;
    const history = commandHistoryBySessionId[activeSession.id] ?? [];
    if (history.length === 0) return;
    const cursor = commandHistoryCursorBySessionId[activeSession.id] ?? null;
    if (cursor === null) {
      setCommandHistoryScratchBySessionId((current) => ({ ...current, [activeSession.id]: composerValue }));
    }
    const nextCursor = cursor === null ? history.length - 1 : Math.max(cursor - 1, 0);
    setCommandHistoryCursorBySessionId((current) => ({ ...current, [activeSession.id]: nextCursor }));
    setCommandDraftBySessionId((current) => ({ ...current, [activeSession.id]: history[nextCursor] ?? "" }));
  }, [activeSession, commandHistoryBySessionId, commandHistoryCursorBySessionId, composerValue]);

  const recallNextCommand = useCallback(() => {
    if (!activeSession) return;
    const history = commandHistoryBySessionId[activeSession.id] ?? [];
    const cursor = commandHistoryCursorBySessionId[activeSession.id] ?? null;
    if (history.length === 0 || cursor === null) return;
    const nextCursor = cursor + 1;
    if (nextCursor >= history.length) {
      const scratch = commandHistoryScratchBySessionId[activeSession.id] ?? "";
      setCommandHistoryCursorBySessionId((current) => ({ ...current, [activeSession.id]: null }));
      setCommandDraftBySessionId((current) => ({ ...current, [activeSession.id]: scratch }));
      return;
    }
    setCommandHistoryCursorBySessionId((current) => ({ ...current, [activeSession.id]: nextCursor }));
    setCommandDraftBySessionId((current) => ({ ...current, [activeSession.id]: history[nextCursor] ?? "" }));
  }, [activeSession, commandHistoryBySessionId, commandHistoryCursorBySessionId, commandHistoryScratchBySessionId]);

  const useSuggestedCommand = useCallback(() => {
    if (!activeAction) return;
    setComposerValue(activeAction.command);
  }, [activeAction, setComposerValue]);


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

  useEffect(() => {
    if (!isManageHostsDialogOpen || !selectedHost) return;

    let cancelled = false;
    setIsLoadingManageHostPassword(true);

    void getHostPassword(selectedHost.id)
      .then((response) => {
        if (cancelled) return;
        hostRail.setSavedHostForm((current) => ({ ...current, savedPassword: response.password ?? "" }));
      })
      .catch(() => {
        if (cancelled) return;
        hostRail.setSavedHostForm((current) => ({ ...current, savedPassword: "" }));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingManageHostPassword(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hostRail.setSavedHostForm, isManageHostsDialogOpen, selectedHost?.id]);

  async function handleCreateHost(connectAfterCreate: boolean) {
    const draft = {
      ...newHostDraft,
      label: newHostDraft.label.trim(),
      address: newHostDraft.address.trim(),
      username: newHostDraft.username.trim(),
      password: newHostDraft.password,
    };

    if (!draft.address) {
      setNewHostDialogError("Enter a host address before saving or connecting.");
      return;
    }

    if (draft.authMethod === "password" && !draft.password.trim()) {
      setNewHostDialogError("Enter a password before connecting with password auth.");
      return;
    }

    setNewHostDialogError(null);

    if (connectAfterCreate) {
      setIsConnectingNewHost(true);
    } else {
      setIsSavingNewHost(true);
    }

    try {
      await actions.createHostFromDraft(draft, connectAfterCreate);
      setIsNewHostDialogOpen(false);
      setNewHostDraft(EMPTY_NEW_HOST_DRAFT);
      hostRail.setIsSavedConfigExpanded(true);
      hostRail.setIsSessionOverrideExpanded(true);
    } catch (error) {
      const commandError = error as AppCommandError;
      setNewHostDialogError(commandError.message ?? "Failed to create host.");
    } finally {
      setIsSavingNewHost(false);
      setIsConnectingNewHost(false);
    }
  }

  const handleSubmitCommand = useCallback(async () => {
    if (!activeSession) return;
    const command = composerValue.trim();
    if (!command) return;
    const accepted = await actions.submitCommand(command);
    if (!accepted) return;
    setCommandHistoryBySessionId((current) => {
      const history = current[activeSession.id] ?? [];
      const nextHistory = history[history.length - 1] === command ? history : [...history, command];
      return { ...current, [activeSession.id]: nextHistory };
    });
    setCommandDraftBySessionId((current) => ({ ...current, [activeSession.id]: "" }));
    setCommandHistoryCursorBySessionId((current) => ({ ...current, [activeSession.id]: null }));
    setCommandHistoryScratchBySessionId((current) => ({ ...current, [activeSession.id]: "" }));
  }, [activeSession, actions, composerValue]);

  const handleSaveManagedHost = useCallback(async () => {
    await actions.updateSelectedHost();

    if (hostRail.savedHostForm.savedPassword.trim()) {
      await actions.saveSavedHostPassword();
    } else if (selectedHostConfig?.hasSavedPassword) {
      await actions.clearSavedHostPassword();
    }

    setIsManageHostsDialogOpen(false);
  }, [actions, hostRail.savedHostForm.savedPassword, selectedHostConfig?.hasSavedPassword]);

  function openNewHostDialog() {
    setNewHostDraft(EMPTY_NEW_HOST_DRAFT);
    setNewHostDialogError(null);
    setIsNewHostDialogOpen(true);
  }

  function closeNewHostDialog() {
    if (isSavingNewHost || isConnectingNewHost) return;
    setIsNewHostDialogOpen(false);
    setNewHostDraft(EMPTY_NEW_HOST_DRAFT);
    setNewHostDialogError(null);
  }

  if (!workspace || !diagnosis || !failure || !activeSession || !selectedHost) {
    return <AppEmptyState isLoading={isLoadingState} />;
  }

  return (
    <main className="app-shell">
      <TopBar
        hosts={hosts}
        selectedHostId={selectedHost.id}
        isSavingHostConfig={actions.isSavingHostConfig || isSavingNewHost}
        isReconnectingSession={actions.isReconnectingSession}
        isDisconnectingSession={actions.isDisconnectingSession}
        isConnectingSession={actions.isConnectingSession || isConnectingNewHost || activeSession.state === "connecting"}
        onSelectHost={setSelectedHostId}
        onCreateHost={openNewHostDialog}
        onManageHosts={() => setIsManageHostsDialogOpen(true)}
        onReconnect={() => void actions.reconnectActiveSession()}
        onDisconnect={() => void actions.disconnectActiveSession()}
        onConnect={() => void actions.connectSelectedHost()}
      />

      {actionNotice ? <ActionNoticeBar notice={actionNotice} onDismiss={clearNotice} /> : null}

      {isManageHostsDialogOpen ? (
        <ManageHostsDialog
          hosts={hosts}
          selectedHost={selectedHost}
          selectedHostConfig={selectedHostConfig}
          savedHostForm={hostRail.savedHostForm}
          isSavingHostConfig={actions.isSavingHostConfig}
          isDeletingHostConfig={actions.isDeletingHostConfig}
          isLoadingPassword={isLoadingManageHostPassword}
          onSelectHost={setSelectedHostId}
          onSetSavedHostForm={hostRail.setSavedHostForm}
          onSaveHost={handleSaveManagedHost}
          onDeleteSelectedHost={() => void actions.deleteSelectedHost()}
          onClose={() => setIsManageHostsDialogOpen(false)}
        />
      ) : null}

      {isNewHostDialogOpen ? (
        <NewHostDialog
          draft={newHostDraft}
          errorMessage={newHostDialogError}
          isSaving={isSavingNewHost}
          isConnecting={isConnectingNewHost}
          onChange={(updater) => {
            setNewHostDialogError(null);
            setNewHostDraft((current) => updater(current));
          }}
          onCancel={closeNewHostDialog}
          onSave={() => void handleCreateHost(false)}
          onConnect={() => void handleCreateHost(true)}
        />
      ) : null}

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
            onManageHosts={() => setIsManageHostsDialogOpen(true)}
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
          activeCommand={activeCommand}
          showOperationalPanels={showOperationalPanels}
          terminalTail={terminalTail}
          isRunningAction={actions.isRunningAction}
          isSubmittingCommand={actions.isSubmittingCommand}
          composerValue={composerValue}
          activeAction={activeAction}
          commandHistorySize={activeSession ? (commandHistoryBySessionId[activeSession.id] ?? []).length : 0}
          actionSummary={actionNotice?.kind === "success" ? actionNotice.message : null}
          agentSettings={agentSettings}
          latestContextPacket={latestContextPacket}
          timelineSignalSummary={timelineSignalSummary}
          activeTimelineSignalFilter={activeSignalFilter}
          visibleTimeline={visibleTimeline}
          repeatedSignalCounts={repeatedSignalCounts}
          onSetActiveTab={setActiveTab}
          onSetComposerValue={setComposerValue}
          onClearComposerValue={clearComposerValue}
          onSubmitCommand={() => void handleSubmitCommand()}
          onUseSuggestedCommand={useSuggestedCommand}
          onRecallPreviousCommand={recallPreviousCommand}
          onRecallNextCommand={recallNextCommand}
          onInterrupt={() => void actions.interruptActiveSession()}
          onToggleSignalFilter={(signal) => setActiveSignalFilter((current) => (current === signal ? null : signal))}
          onClearSignalFilter={() => setActiveSignalFilter(null)}
          onRerunDiagnosis={() => void actions.rerunDiagnosis()}
          onRunAction={(action) => void actions.runAction(action)}
          onOpenInspect={openInspectPanel}
          onCloseInspect={closeInspectPanel}
          inspectNotice={inspectNotice}
        />
      </section>
    </main>
  );
}

export default App;

