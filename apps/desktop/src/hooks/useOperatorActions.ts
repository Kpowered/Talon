import { useCallback, useEffect, useState } from "react";
import type { SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type { ActionNotice, ActiveCommandSummary, AgentSettings, AppCommandError, ConnectionAuthMethod, HostConnectionConfig, NewHostDraft, SessionConnectionIssue } from "../types/app";
import {
  clearAgentApiKey,
  clearHostPassword,
  confirmHostTrust,
  connectSession,
  deleteHost,
  disconnectSession,
  prepareHostTrust,
  reconnectSession,
  retryDiagnosis,
  runSuggestedAction,
  saveAgentApiKey,
  saveAgentConfiguration,
  saveHostPassword,
  submitSessionCommand,
  switchSessionMode,
  upsertHost,
  upsertHostConfig,
  writeSessionInput,
} from "../lib/tauri";

const INTERACTIVE_COMMAND_PREFIXES = ["top", "htop", "btop", "less", "more", "most", "vim", "vi", "nano", "tmux", "screen", "mysql", "psql", "redis-cli", "ssh"];

function looksInteractiveCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }
  const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  return INTERACTIVE_COMMAND_PREFIXES.includes(firstToken);
}
type OperatorActionsOptions = {
  selectedHost: TalonWorkspaceState["hosts"][number] | null;
  activeSession: TalonWorkspaceState["sessions"][number] | null;
  activeConnectionIssue: SessionConnectionIssue | null;
  activeCommand: ActiveCommandSummary | null;
  connectionAddress: string;
  connectionPort: string;
  connectionUsername: string;
  connectionAuthMethod: ConnectionAuthMethod;
  connectionPassword: string;
  savedHostPasswordInput: string;
  hostLabelInput: string;
  hostAddressInput: string;
  hostRegionInput: string;
  hostTagsInput: string;
  hostPortInput: string;
  hostUsernameInput: string;
  hostAuthMethodInput: ConnectionAuthMethod;
  hostFingerprintHintInput: string;
  hostPrivateKeyPathInput: string;
  agentSettings: AgentSettings | null;
  agentBaseUrlInput: string;
  agentModelInput: string;
  agentAutoDiagnoseInput: boolean;
  agentApiKeyInput: string;
  setWorkspace: React.Dispatch<React.SetStateAction<TalonWorkspaceState | null>>;
  setHostConfigs: React.Dispatch<React.SetStateAction<HostConnectionConfig[]>>;
  setTerminalTail: React.Dispatch<React.SetStateAction<string[]>>;
  setActionNotice: React.Dispatch<React.SetStateAction<ActionNotice | null>>;
  setComposerValue: (value: React.SetStateAction<string>) => void;
  setAgentSettings: React.Dispatch<React.SetStateAction<AgentSettings | null>>;
  setSavedHostPasswordInput: React.Dispatch<React.SetStateAction<string>>;
  setActiveConnectionIssue: React.Dispatch<React.SetStateAction<SessionConnectionIssue | null>>;
  setSelectedHostId: React.Dispatch<React.SetStateAction<string | null>>;
  resetConnectionOverride: () => void;
  refreshWorkspace: () => Promise<TalonWorkspaceState>;
  refreshRegistry: () => Promise<unknown>;
  refreshAll: () => Promise<unknown>;
  loadTerminalSnapshot: (sessionId: string) => Promise<unknown>;
};

export function useOperatorActions(options: OperatorActionsOptions) {
  const {
    selectedHost,
    activeSession,
    activeConnectionIssue,
    activeCommand,
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
  } = options;

  const [isRunningAction, setIsRunningAction] = useState<string | null>(null);
  const [isConnectingSession, setIsConnectingSession] = useState(false);
  const [isSubmittingCommand, setIsSubmittingCommand] = useState(false);
  const [isDisconnectingSession, setIsDisconnectingSession] = useState(false);
  const [isReconnectingSession, setIsReconnectingSession] = useState(false);
  const [isSavingHostConfig, setIsSavingHostConfig] = useState(false);
  const [isDeletingHostConfig, setIsDeletingHostConfig] = useState(false);
  const [interruptingSessionId, setInterruptingSessionId] = useState<string | null>(null);


  useEffect(() => {
    if (!interruptingSessionId) {
      return;
    }

    if (!activeSession || activeSession.id !== interruptingSessionId || activeSession.mode !== "managed") {
      setInterruptingSessionId(null);
      return;
    }

    if (!activeCommand || activeCommand.sessionId !== interruptingSessionId) {
      setInterruptingSessionId(null);
    }
  }, [activeCommand, activeSession, interruptingSessionId]);

  const reportError = useCallback(
    (error: unknown) => {
      const commandError = error as AppCommandError;
      setActionNotice({ kind: "error", message: commandError.message ?? "Unexpected desktop command failure." });
    },
    [setActionNotice],
  );

  const parseTags = useCallback((input: string) => {
    return input
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag, index, collection) => tag.length > 0 && collection.indexOf(tag) === index);
  }, []);

  const connectSelectedHost = useCallback(async () => {
    if (!selectedHost) return;
    setIsConnectingSession(true);
    try {
      const result = await connectSession({
        hostId: selectedHost.id,
        address: connectionAddress.trim(),
        port: Number(connectionPort) || 22,
        username: connectionUsername.trim(),
        authMethod: connectionAuthMethod,
        password: connectionAuthMethod === "password" ? connectionPassword : undefined,
      });
      setActionNotice({ kind: "success", message: `Managed session ready for ${selectedHost.config.label} in ${result.session.cwd}.` });
      await refreshAll();
      await loadTerminalSnapshot(result.session.sessionId);
    } catch (error) {
      reportError(error);
    } finally {
      setIsConnectingSession(false);
    }
  }, [connectionAddress, connectionAuthMethod, connectionPassword, connectionPort, connectionUsername, loadTerminalSnapshot, refreshAll, reportError, selectedHost, setActionNotice]);

  const submitCommand = useCallback(async (command: string) => {
    if (!activeSession || !command.trim()) return false;
    const interactiveHint = activeSession.mode === "managed" && looksInteractiveCommand(command);
    setIsSubmittingCommand(true);
    try {
      const result = await submitSessionCommand(activeSession.id, command);
      setTerminalTail(result.terminal.lines);
      setActionNotice({
        kind: result.accepted ? "success" : "error",
        message: result.accepted
          ? interactiveHint
            ? `Command submitted to ${activeSession.id}: ${command}. This looks interactive; switch to raw mode if terminal controls become limited.`
            : `Command submitted to ${activeSession.id}: ${command}`
          : result.message,
      });
      await refreshRegistry();
      return result.accepted;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      setIsSubmittingCommand(false);
    }
  }, [activeSession, refreshRegistry, reportError, setActionNotice, setTerminalTail]);

  const sendRawInput = useCallback(async (data: string) => {
    if (!activeSession) return;
    try {
      await writeSessionInput(activeSession.id, data);
      await refreshRegistry();
    } catch (error) {
      reportError(error);
    }
  }, [activeSession, refreshRegistry, reportError]);

  const toggleSessionMode = useCallback(async () => {
    if (!activeSession) return;
    try {
      const nextMode = activeSession.mode === "raw" ? "managed" : "raw";
      const result = await switchSessionMode(activeSession.id, nextMode);
      setWorkspace((current) => current ? ({
        ...current,
        sessions: current.sessions.map((session) => session.id === result.sessionId ? { ...session, mode: result.mode } : session),
      }) : current);
      setActionNotice({ kind: "success", message: result.mode === "raw" ? "Raw mode enabled for the active session." : "Managed mode enabled for the active session." });
      await refreshAll();
    } catch (error) {
      reportError(error);
    }
  }, [activeSession, refreshAll, reportError, setActionNotice, setWorkspace]);

  const interruptActiveSession = useCallback(async () => {
    if (!activeSession) return;

    if (activeSession.mode === "raw") {
      try {
        await writeSessionInput(activeSession.id, "\u0003");
        await refreshRegistry();
      } catch (error) {
        reportError(error);
      }
      return;
    }

    if (!activeCommand || activeCommand.sessionId !== activeSession.id) {
      return;
    }

    if (interruptingSessionId === activeSession.id) {
      return;
    }

    setInterruptingSessionId(activeSession.id);
    try {
      await writeSessionInput(activeSession.id, "\u0003");
      setActionNotice({ kind: "success", message: `Sent Ctrl+C to ${activeSession.id}.` });
      await refreshRegistry();
    } catch (error) {
      setInterruptingSessionId(null);
      reportError(error);
    }
  }, [activeCommand, activeSession, interruptingSessionId, refreshRegistry, reportError, setActionNotice]);
  const disconnectActiveSession = useCallback(async () => {
    if (!activeSession) return;
    setIsDisconnectingSession(true);
    try {
      const result = await disconnectSession(activeSession.id);
      setTerminalTail(result.terminal.lines);
      setActionNotice({ kind: "success", message: `Disconnect requested for ${activeSession.id}.` });
      await refreshAll();
    } catch (error) {
      reportError(error);
    } finally {
      setIsDisconnectingSession(false);
    }
  }, [activeSession, refreshAll, reportError, setActionNotice, setTerminalTail]);

  const reconnectActiveSession = useCallback(async () => {
    if (!selectedHost) return;
    setIsReconnectingSession(true);
    try {
      const result = await reconnectSession({
        hostId: selectedHost.id,
        address: connectionAddress.trim(),
        port: Number(connectionPort) || 22,
        username: connectionUsername.trim(),
        authMethod: connectionAuthMethod,
        password: connectionAuthMethod === "password" ? connectionPassword : undefined,
      });
      setActionNotice({ kind: "success", message: `Reconnect requested for ${selectedHost.config.label}.` });
      await refreshAll();
      await loadTerminalSnapshot(result.session.sessionId);
    } catch (error) {
      reportError(error);
    } finally {
      setIsReconnectingSession(false);
    }
  }, [connectionAddress, connectionAuthMethod, connectionPassword, connectionPort, connectionUsername, loadTerminalSnapshot, refreshAll, reportError, selectedHost, setActionNotice]);

  const runAction = useCallback(async (action: SuggestedAction) => {
    if (!activeSession) return;
    setIsRunningAction(action.id);
    setActionNotice(null);
    try {
      const result = await runSuggestedAction(activeSession.id, action);
      setTerminalTail((current) => [...current, ...result.appendedTerminalLines]);
      setActionNotice({ kind: "success", message: result.summary });
      setComposerValue(action.command);
    } catch (error) {
      reportError(error);
    } finally {
      setIsRunningAction(null);
    }
  }, [activeSession, reportError, setActionNotice, setComposerValue, setTerminalTail]);

  const saveSavedHostPassword = useCallback(async () => {
    if (!selectedHost || !savedHostPasswordInput.trim()) return;
    try {
      const result = await saveHostPassword(selectedHost.id, savedHostPasswordInput);
      setHostConfigs(result.hostConfigs);
      setSavedHostPasswordInput("");
      setActionNotice({ kind: "success", message: `Saved a system-keychain password for ${selectedHost.config.label}.` });
    } catch (error) {
      reportError(error);
    }
  }, [reportError, savedHostPasswordInput, selectedHost, setActionNotice, setHostConfigs, setSavedHostPasswordInput]);

  const clearSavedHostPassword = useCallback(async () => {
    if (!selectedHost) return;
    try {
      const result = await clearHostPassword(selectedHost.id);
      setHostConfigs(result.hostConfigs);
      setSavedHostPasswordInput("");
      setActionNotice({ kind: "success", message: `Cleared the saved password for ${selectedHost.config.label}.` });
    } catch (error) {
      reportError(error);
    }
  }, [reportError, selectedHost, setActionNotice, setHostConfigs, setSavedHostPasswordInput]);

  const persistAgentConfiguration = useCallback(async () => {
    try {
      const settings = await saveAgentConfiguration({
        providerType: agentSettings?.providerType ?? "openai-compatible",
        baseUrl: agentBaseUrlInput.trim(),
        model: agentModelInput.trim(),
        autoDiagnose: agentAutoDiagnoseInput,
        requestTimeoutSec: agentSettings?.requestTimeoutSec ?? 20,
      });
      setAgentSettings(settings.settings);
      setActionNotice({ kind: "success", message: "Saved AI provider settings." });
    } catch (error) {
      reportError(error);
    }
  }, [agentAutoDiagnoseInput, agentBaseUrlInput, agentModelInput, agentSettings, reportError, setActionNotice, setAgentSettings]);

  const persistAgentApiKey = useCallback(async () => {
    if (!agentApiKeyInput.trim()) return;
    try {
      const settings = await saveAgentApiKey(agentApiKeyInput.trim());
      setAgentSettings(settings.settings);
      setActionNotice({ kind: "success", message: "Saved API key to the system credential store." });
    } catch (error) {
      reportError(error);
    }
  }, [agentApiKeyInput, reportError, setActionNotice, setAgentSettings]);

  const clearSavedAgentApiKey = useCallback(async () => {
    try {
      const settings = await clearAgentApiKey();
      setAgentSettings(settings.settings);
      setActionNotice({ kind: "success", message: "Cleared the saved API key." });
    } catch (error) {
      reportError(error);
    }
  }, [reportError, setActionNotice, setAgentSettings]);

  const prepareHostTrustFlow = useCallback(async () => {
    if (!activeSession) return;
    try {
      const response = await prepareHostTrust(activeSession.id);
      setActiveConnectionIssue(response.issue);
      setActionNotice({ kind: "success", message: `Prepared host trust details for ${selectedHost?.config.label ?? activeSession.id}.` });
    } catch (error) {
      reportError(error);
    }
  }, [activeSession, reportError, selectedHost, setActionNotice, setActiveConnectionIssue]);

  const confirmHostTrustFlow = useCallback(async () => {
    if (!activeSession || !activeConnectionIssue?.fingerprint) return;
    try {
      await confirmHostTrust(activeSession.id, activeConnectionIssue.fingerprint);
      await refreshAll();
      setActionNotice({ kind: "success", message: `Trusted ${activeConnectionIssue.host ?? selectedHost?.config.label ?? activeSession.id} and updated known_hosts.` });
    } catch (error) {
      reportError(error);
    }
  }, [activeConnectionIssue, activeSession, refreshAll, reportError, selectedHost, setActionNotice]);

  const rerunDiagnosis = useCallback(async () => {
    if (!activeSession) return;
    try {
      const nextState = await retryDiagnosis(activeSession.id);
      setWorkspace(nextState);
      setActionNotice({ kind: "success", message: `Regenerated diagnosis for ${selectedHost?.config.label ?? activeSession.id}.` });
    } catch (error) {
      reportError(error);
    }
  }, [activeSession, reportError, selectedHost, setActionNotice, setWorkspace]);

  const resetConnectionOverrideWithNotice = useCallback(() => {
    if (!selectedHost) return;
    resetConnectionOverride();
    setActionNotice({ kind: "success", message: `Reset connection override for ${selectedHost.config.label} back to saved host config.` });
  }, [resetConnectionOverride, selectedHost, setActionNotice]);

  const saveHostConfig = useCallback(async (hostId: string) => {
    setIsSavingHostConfig(true);
    try {
      const result = await upsertHostConfig({
        hostId,
        port: Number(hostPortInput) || 22,
        username: hostUsernameInput.trim() || "root",
        authMethod: hostAuthMethodInput,
        fingerprintHint: hostFingerprintHintInput.trim() || "Pending trust",
        privateKeyPath: hostPrivateKeyPathInput.trim() || null,
      });
      setHostConfigs(result.hostConfigs);
      await refreshRegistry();
    } catch (error) {
      reportError(error);
      throw error;
    } finally {
      setIsSavingHostConfig(false);
    }
  }, [hostAuthMethodInput, hostFingerprintHintInput, hostPortInput, hostPrivateKeyPathInput, hostUsernameInput, refreshRegistry, reportError, setHostConfigs]);

  const createHostFromDraft = useCallback(async (draft: NewHostDraft, connectAfterCreate: boolean) => {
    const hostId = `host-${crypto.randomUUID().slice(0, 8)}`;
    const username = draft.username.trim() || "root";
    const address = draft.address.trim();
    const label = draft.label.trim() || address || "new-host";

    await upsertHost({
      id: hostId,
      label,
      address,
      region: draft.region.trim() || "custom",
      tags: parseTags(draft.tags),
    });

    const configResult = await upsertHostConfig({
      hostId,
      port: Number(draft.port) || 22,
      username,
      authMethod: draft.authMethod,
      fingerprintHint: "Pending trust",
      privateKeyPath: null,
    });

    let nextHostConfigs = configResult.hostConfigs;
    if (draft.authMethod === "password" && draft.password.trim()) {
      const passwordResult = await saveHostPassword(hostId, draft.password.trim());
      nextHostConfigs = passwordResult.hostConfigs;
    }

    setHostConfigs(nextHostConfigs);
    setSelectedHostId(hostId);

    if (!connectAfterCreate) {
      await refreshWorkspace();
      await refreshRegistry();
      setActionNotice({ kind: "success", message: `Created host config for ${label}.` });
      return { hostId, connected: false as const };
    }

    const result = await connectSession({
      hostId,
      address,
      port: Number(draft.port) || 22,
      username,
      authMethod: draft.authMethod,
      password: draft.authMethod === "password" ? draft.password : undefined,
    });

    setActionNotice({ kind: "success", message: `Managed session ready for ${label} in ${result.session.cwd}.` });
    await refreshAll();
    await loadTerminalSnapshot(result.session.sessionId);
    return { hostId, connected: true as const, sessionId: result.session.sessionId };
  }, [loadTerminalSnapshot, parseTags, refreshAll, refreshRegistry, refreshWorkspace, setActionNotice, setHostConfigs, setSelectedHostId]);
  const createHost = useCallback(async () => {
    const hostId = `host-${crypto.randomUUID().slice(0, 8)}`;
    const label = hostLabelInput.trim() || "new-host";
    const address = hostAddressInput.trim() || `${hostUsernameInput.trim() || "root"}@127.0.0.1`;
    try {
      await upsertHost({
        id: hostId,
        label,
        address,
        region: hostRegionInput.trim() || "custom",
        tags: parseTags(hostTagsInput),
      });
      setSelectedHostId(hostId);
      await saveHostConfig(hostId);
      await refreshWorkspace();
      setActionNotice({ kind: "success", message: `Created host config for ${label}.` });
    } catch (error) {
      reportError(error);
    }
  }, [hostAddressInput, hostLabelInput, hostRegionInput, hostTagsInput, hostUsernameInput, parseTags, refreshWorkspace, reportError, saveHostConfig, setActionNotice, setSelectedHostId]);

  const updateSelectedHost = useCallback(async () => {
    if (!selectedHost) return;
    const updatedHost = {
      id: selectedHost.id,
      label: hostLabelInput.trim() || selectedHost.config.label,
      address: hostAddressInput.trim() || selectedHost.config.address,
      region: hostRegionInput.trim() || selectedHost.config.region,
      tags: parseTags(hostTagsInput),
    };
    try {
      await upsertHost(updatedHost);
      await saveHostConfig(selectedHost.id);
      await refreshWorkspace();
      setActionNotice({ kind: "success", message: `Saved host config for ${updatedHost.label}.` });
    } catch (error) {
      reportError(error);
    }
  }, [hostAddressInput, hostLabelInput, hostRegionInput, hostTagsInput, parseTags, refreshWorkspace, reportError, saveHostConfig, selectedHost, setActionNotice]);

  const deleteSelectedHost = useCallback(async () => {
    if (!selectedHost) return;
    setIsDeletingHostConfig(true);
    try {
      await deleteHost(selectedHost.id);
      const nextState = await refreshWorkspace();
      setSelectedHostId(nextState.hosts[0]?.id ?? null);
      await refreshRegistry();
      setActionNotice({ kind: "success", message: `Deleted host config for ${selectedHost.config.label}.` });
    } catch (error) {
      reportError(error);
    } finally {
      setIsDeletingHostConfig(false);
    }
  }, [refreshRegistry, refreshWorkspace, reportError, selectedHost, setActionNotice, setSelectedHostId]);

  return {
    isRunningAction,
    isConnectingSession,
    isSubmittingCommand,
    isDisconnectingSession,
    isReconnectingSession,
    isSavingHostConfig,
    isDeletingHostConfig,
    connectSelectedHost,
    sendRawInput,
    toggleSessionMode,
    interruptActiveSession,
    submitCommand,
    disconnectActiveSession,
    reconnectActiveSession,
    runAction,
    saveSavedHostPassword,
    clearSavedHostPassword,
    saveAgentConfiguration: persistAgentConfiguration,
    saveAgentApiKey: persistAgentApiKey,
    clearAgentApiKey: clearSavedAgentApiKey,
    prepareHostTrustFlow,
    confirmHostTrustFlow,
    rerunDiagnosis,
    resetConnectionOverride: resetConnectionOverrideWithNotice,
    parseTags,
    saveHostConfig,
    createHost,
    createHostFromDraft,
    updateSelectedHost,
    deleteSelectedHost,
  };
}




