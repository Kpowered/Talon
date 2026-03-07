import { useCallback, useEffect, useMemo, useState } from "react";
import type { SetStateAction } from "react";
import type { Host, Session, SuggestedAction } from "@talon/core";
import type { AppCommandError, HostConnectionConfig, NewHostDraft, TerminalTab } from "./types/app";
import { HostRail } from "./components/HostRail";
import { ActionNoticeBar } from "./components/ActionNoticeBar";
import { AppEmptyState } from "./components/AppEmptyState";
import { WorkspacePanels } from "./components/WorkspacePanels";
import { NewHostDialog } from "./components/NewHostDialog";
import { useWorkspaceRuntime } from "./hooks/useWorkspaceRuntime";
import { useOperatorActions } from "./hooks/useOperatorActions";
import { useActionNotice } from "./hooks/useActionNotice";
import { useTimelineSignals } from "./hooks/useTimelineSignals";
import { useHostRailState } from "./hooks/useHostRailState";
import { clearHostPassword, connectSession, deleteHost, getHostPassword, saveHostPassword, upsertHost, upsertHostConfig } from "./lib/tauri";
import { closeHostEditorWindow, emitHostEditorError, emitHostEditorLoad, listenHostEditorDelete, listenHostEditorReady, listenHostEditorSave, openHostEditorWindow } from "./lib/hostEditorWindow";
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
  const [isHostEditorRequested, setIsHostEditorRequested] = useState(false);
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
  const selectedHostConfig = hostConfigs.find((config: HostConnectionConfig) => config.hostId === selectedHost?.id) ?? null;
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
    (value: SetStateAction<string>) => {
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
    if (!isHostEditorRequested || !selectedHost) return;

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
  }, [hostRail.setSavedHostForm, isHostEditorRequested, selectedHost?.id]);

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
  const saveHostEditorForm = useCallback(async (hostId: string, form: typeof hostRail.savedHostForm) => {
    const host = hosts.find((entry) => entry.id === hostId);
    if (!host) {
      await emitHostEditorError({ message: "The selected host no longer exists." });
      return;
    }

    const label = form.label.trim();
    const address = form.address.trim();
    const username = form.username.trim();
    const port = Number.parseInt(form.port, 10);
    const fingerprintHint = form.fingerprintHint.trim() || "Pending trust";
    const authMethod = form.authMethod;
    const privateKeyPath = form.privateKeyPath.trim();
    const savedPassword = form.savedPassword;
    const region = form.region.trim() || host.config.region || "custom";
    const tags = form.tags.split(",").map((tag) => tag.trim()).filter(Boolean);

    if (!label) {
      await emitHostEditorError({ message: "Enter a label before saving the host." });
      return;
    }
    if (!address) {
      await emitHostEditorError({ message: "Enter an address before saving the host." });
      return;
    }
    if (!username) {
      await emitHostEditorError({ message: "Enter a username before saving the host." });
      return;
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      await emitHostEditorError({ message: "Enter a valid port between 1 and 65535." });
      return;
    }
    if (authMethod === "private-key" && !privateKeyPath) {
      await emitHostEditorError({ message: "Enter a private key path before saving private-key auth." });
      return;
    }

    try {
      await upsertHost({ id: hostId, label, address, region, tags });
      await upsertHostConfig({
        hostId,
        port,
        username,
        authMethod,
        fingerprintHint,
        privateKeyPath: authMethod === "private-key" ? privateKeyPath : null,
      });

      if (authMethod === "password") {
        if (savedPassword.trim()) {
          await saveHostPassword(hostId, savedPassword);
        } else {
          await clearHostPassword(hostId);
        }
      } else {
        await clearHostPassword(hostId);
      }

      setSelectedHostId(hostId);
      await refreshAll();
      setIsHostEditorRequested(false);
      await closeHostEditorWindow();
      setActionNotice({ kind: "success", message: `Saved host ${label}.` });
    } catch (error) {
      const commandError = error as AppCommandError;
      const message = commandError.message ?? `Failed to save ${label}.`;
      setActionNotice({ kind: "error", message });
      await emitHostEditorError({ message });
    }
  }, [hosts, refreshAll, setActionNotice, setSelectedHostId]);

  const deleteHostFromEditor = useCallback(async (hostId: string) => {
    const host = hosts.find((entry) => entry.id === hostId);
    if (!host) {
      await emitHostEditorError({ message: "The selected host no longer exists." });
      return;
    }

    if (!window.confirm(`Delete saved host ${host.config.label}?`)) {
      return;
    }

    try {
      await deleteHost(hostId);
      await refreshAll();
      if (selectedHostId === hostId) {
        const nextHost = hosts.find((entry) => entry.id !== hostId) ?? null;
        setSelectedHostId(nextHost?.id ?? null);
      }
      setIsHostEditorRequested(false);
      await closeHostEditorWindow();
      setActionNotice({ kind: "success", message: `Deleted host ${host.config.label}.` });
    } catch (error) {
      const commandError = error as AppCommandError;
      const message = commandError.message ?? `Failed to delete ${host.config.label}.`;
      setActionNotice({ kind: "error", message });
      await emitHostEditorError({ message });
    }
  }, [hosts, refreshAll, selectedHostId, setActionNotice, setSelectedHostId]);

  const syncHostEditorWindow = useCallback(async () => {
    if (!isHostEditorRequested || !selectedHost) {
      return;
    }

    await emitHostEditorLoad({
      hostId: selectedHost.id,
      form: hostRail.savedHostForm,
      hostConfig: selectedHostConfig,
      isLoadingPassword: isLoadingManageHostPassword,
    });
  }, [hostRail.savedHostForm, isHostEditorRequested, isLoadingManageHostPassword, selectedHost, selectedHostConfig]);

  useEffect(() => {
    if (!isHostEditorRequested || !selectedHost) return;
    void syncHostEditorWindow();
  }, [isHostEditorRequested, selectedHost?.id, selectedHostConfig, hostRail.savedHostForm, isLoadingManageHostPassword, syncHostEditorWindow]);

  useEffect(() => {
    let unlistenReady: (() => void) | undefined;
    let unlistenSave: (() => void) | undefined;
    let unlistenDelete: (() => void) | undefined;

    void listenHostEditorReady(() => {
      void syncHostEditorWindow();
    }).then((fn) => {
      unlistenReady = fn;
    });

    void listenHostEditorSave((payload) => {
      void saveHostEditorForm(payload.hostId, payload.form);
    }).then((fn) => {
      unlistenSave = fn;
    });

    void listenHostEditorDelete((payload) => {
      void deleteHostFromEditor(payload.hostId);
    }).then((fn) => {
      unlistenDelete = fn;
    });

    return () => {
      unlistenReady?.();
      unlistenSave?.();
      unlistenDelete?.();
    };
  }, [deleteHostFromEditor, saveHostEditorForm, syncHostEditorWindow]);
  function openNewHostDialog() {
    setNewHostDraft(EMPTY_NEW_HOST_DRAFT);
    setNewHostDialogError(null);
    setIsNewHostDialogOpen(true);
  }

  const connectHostFromRail = useCallback(async (hostId: string) => {
    const host = hosts.find((entry) => entry.id === hostId);
    if (!host) {
      return;
    }

    const hostConfig = hostConfigs.find((entry) => entry.hostId === hostId);
    const authMethod = (hostConfig?.authMethod ?? "agent") as HostConnectionConfig["authMethod"];
    let password: string | undefined;

    if (authMethod === "password") {
      const response = await getHostPassword(hostId);
      if (!response.password?.trim()) {
        setActionNotice({ kind: "error", message: `No saved password is available for ${host.config.label}. Open Manage and update the host first.` });
        return;
      }
      password = response.password;
    }

    try {
      setSelectedHostId(hostId);
      const result = await connectSession({
        hostId,
        address: host.config.address,
        port: hostConfig?.port ?? 22,
        username: hostConfig?.username ?? "root",
        authMethod: authMethod as "agent" | "private-key" | "password",
        password,
      });
      setActionNotice({ kind: "success", message: `Managed session ready for ${host.config.label} in ${result.session.cwd}.` });
      await refreshAll();
      await loadTerminalSnapshot(result.session.sessionId);
    } catch (error) {
      const commandError = error as AppCommandError;
      setActionNotice({ kind: "error", message: commandError.message ?? `Failed to connect ${host.config.label}.` });
    }
  }, [hostConfigs, hosts, loadTerminalSnapshot, refreshAll, setActionNotice, setSelectedHostId]);
  const openManageHostById = useCallback((hostId: string) => {
    setSelectedHostId(hostId);
    setIsHostEditorRequested(true);
    void openHostEditorWindow()
      .then(() => {
        void syncHostEditorWindow();
      })
      .catch((error) => {
        const commandError = error as AppCommandError;
        setActionNotice({ kind: "error", message: commandError.message ?? "Failed to open the host editor window." });
      });
  }, [setActionNotice, setSelectedHostId, syncHostEditorWindow]);

  const deleteHostFromRail = useCallback(async (hostId: string) => {
    const host = hosts.find((entry) => entry.id === hostId);
    if (!host) {
      return;
    }

    if (!window.confirm(`Delete saved host ${host.config.label}?`)) {
      return;
    }

    try {
      await deleteHost(hostId);
      setActionNotice({ kind: "success", message: `Deleted host ${host.config.label}.` });
      await refreshAll();
      if (selectedHostId === hostId) {
        const nextHost = hosts.find((entry) => entry.id !== hostId) ?? null;
        setSelectedHostId(nextHost?.id ?? null);
      }
    } catch (error) {
      const commandError = error as AppCommandError;
      setActionNotice({ kind: "error", message: commandError.message ?? `Failed to delete ${host.config.label}.` });
    }
  }, [hosts, refreshAll, selectedHostId, setActionNotice, setSelectedHostId]);
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
    <main className="app-shell app-shell-terminal-first">
      {actionNotice ? <ActionNoticeBar notice={actionNotice} onDismiss={clearNotice} /> : null}

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

      <section className="app-layout">
        <HostRail
          hosts={hosts}
          selectedHost={selectedHost}
          activeConnectionIssue={activeConnectionIssue}
          onSelectHost={setSelectedHostId}
          onCreateHost={openNewHostDialog}
          onManageHosts={() => {
            if (selectedHost) {
              openManageHostById(selectedHost.id);
            }
          }}
          onConnectHost={(hostId) => void connectHostFromRail(hostId)}
          onEditHost={openManageHostById}
          onDeleteHost={(hostId) => void deleteHostFromRail(hostId)}
        />

        <section className="workspace-shell">


          <WorkspacePanels
            activeTab={activeTab}
            activeSession={activeSession}
            selectedHost={selectedHost}
            failure={failure}
            diagnosis={diagnosis}
            activeConnectionIssueTitle={activeConnectionIssue?.title ?? null}
            activeConnectionIssueSummary={activeConnectionIssue?.summary ?? null}
            activeCommand={activeCommand}
            terminalTail={terminalTail}
            isRunningAction={actions.isRunningAction}
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
      </section>
    </main>
  );
}

export default App;


























