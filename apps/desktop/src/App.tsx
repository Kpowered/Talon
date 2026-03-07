import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagnosisContextPacket, Host, Session, SuggestedAction, TalonWorkspaceState } from "@talon/core";
import type {
  AgentSettings,
  ConnectionAuthMethod,
  HostConnectionConfig,
  SessionConnectionIssue,
  TerminalTab,
} from "./types/app";
import { TopBar } from "./components/TopBar";
import { HostRail } from "./components/HostRail";
import { ShellWorkspace } from "./components/ShellWorkspace";
import { TimelineView } from "./components/views/TimelineView";
import { DiagnosisView } from "./components/views/DiagnosisView";
import { ArtifactsView } from "./components/views/ArtifactsView";
import {
  clearAgentApiKey as clearAgentApiKeyCommand,
  clearHostPassword as clearHostPasswordCommand,
  confirmHostTrust as confirmHostTrustCommand,
  connectSession as connectSessionCommand,
  deleteHost as deleteHostCommand,
  disconnectSession as disconnectSessionCommand,
  getAgentSettings,
  getLatestContextPacket,
  getSessionRegistry,
  getTerminalSnapshot,
  getWorkspaceState,
  prepareHostTrust as prepareHostTrustCommand,
  reconnectSession as reconnectSessionCommand,
  retryDiagnosis as retryDiagnosisCommand,
  runSuggestedAction as runSuggestedActionCommand,
  saveAgentApiKey as saveAgentApiKeyCommand,
  saveAgentConfiguration as saveAgentConfigurationCommand,
  saveHostPassword as saveHostPasswordCommand,
  submitSessionCommand,
  upsertHost as upsertHostCommand,
  upsertHostConfig as upsertHostConfigCommand,
} from "./lib/tauri";
import "./App.css";

function App() {
  const [workspace, setWorkspace] = useState<TalonWorkspaceState | null>(null);
  const [activeTab, setActiveTab] = useState<TerminalTab>("shell");
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isRunningAction, setIsRunningAction] = useState<string | null>(null);
  const [actionSummary, setActionSummary] = useState<string | null>(null);
  const [terminalTail, setTerminalTail] = useState<string[]>([]);
  const [isConnectingSession, setIsConnectingSession] = useState(false);
  const [hostConfigs, setHostConfigs] = useState<HostConnectionConfig[]>([]);
  const [busySessionIds, setBusySessionIds] = useState<string[]>([]);
  const [activeConnectionIssue, setActiveConnectionIssue] = useState<SessionConnectionIssue | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [isSubmittingCommand, setIsSubmittingCommand] = useState(false);
  const [isDisconnectingSession, setIsDisconnectingSession] = useState(false);
  const [isReconnectingSession, setIsReconnectingSession] = useState(false);
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
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [agentBaseUrlInput, setAgentBaseUrlInput] = useState("");
  const [agentModelInput, setAgentModelInput] = useState("");
  const [agentAutoDiagnoseInput, setAgentAutoDiagnoseInput] = useState(true);
  const [agentApiKeyInput, setAgentApiKeyInput] = useState("");
  const [latestContextPacket, setLatestContextPacket] = useState<DiagnosisContextPacket | null>(null);
  const [isSavingHostConfig, setIsSavingHostConfig] = useState(false);
  const [isDeletingHostConfig, setIsDeletingHostConfig] = useState(false);
  const [activeTimelineSignalFilter, setActiveTimelineSignalFilter] = useState<string | null>(null);
  const [isSavedConfigExpanded, setIsSavedConfigExpanded] = useState(false);
  const [isSessionOverrideExpanded, setIsSessionOverrideExpanded] = useState(false);

  async function refreshWorkspace() {
    const state = await getWorkspaceState();
    setWorkspace(state);
    setSelectedHostId((current) => current ?? state.sessions[0]?.hostId ?? state.hosts[0]?.id ?? null);
    if (state.terminal.lines.length > 0) setTerminalTail(state.terminal.lines);
  }

  async function refreshRegistry() {
    const registry = await getSessionRegistry();
    setHostConfigs(registry.hostConfigs);
    setBusySessionIds(registry.busySessionIds);
    setActiveConnectionIssue(registry.activeConnectionIssue);
  }


  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setIsLoadingState(true);
      try {
        const [state, registry, settingsResponse] = await Promise.all([
          getWorkspaceState(),
          getSessionRegistry(),
          getAgentSettings(),
        ]);
        if (cancelled) return;
        setWorkspace(state);
        setSelectedHostId((current) => current ?? state.sessions[0]?.hostId ?? state.hosts[0]?.id ?? null);
        setHostConfigs(registry.hostConfigs);
        setBusySessionIds(registry.busySessionIds);
        setActiveConnectionIssue(registry.activeConnectionIssue);
        setTerminalTail(state.terminal.lines);
        setComposerValue(state.latestDiagnosis.suggestedActions[0]?.command ?? "");
        setAgentSettings(settingsResponse.settings);
        setAgentBaseUrlInput(settingsResponse.settings.baseUrl);
        setAgentModelInput(settingsResponse.settings.model);
        setAgentAutoDiagnoseInput(settingsResponse.settings.autoDiagnose);
      } finally {
        if (!cancelled) setIsLoadingState(false);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspace?.activeSessionId) return;

    const interval = window.setInterval(() => {
      void refreshWorkspace();
      void refreshRegistry();
      void getTerminalSnapshot(workspace.activeSessionId).then((snapshot) => {
        setTerminalTail(snapshot.lines);
      });
    }, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, [workspace?.activeSessionId]);

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
    initializedConnectionHostId.current = nextHost.id;
  }, [workspace?.hosts, selectedHostId, hostConfigs]);

  useEffect(() => {
    const nextHost = workspace?.hosts.find((host: Host) => host.id === selectedHostId) ?? workspace?.hosts[0];
    if (!nextHost) return;
    const nextConfig = hostConfigs.find((config: HostConnectionConfig) => config.hostId === nextHost.id) ?? null;
    const derivedUsername = nextHost.config.address.includes("@") ? nextHost.config.address.split("@")[0] : nextConfig?.username ?? "";
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
  }, [workspace?.hosts, selectedHostId, hostConfigs]);

  const activeSession = useMemo(
    () => workspace?.sessions.find((session: Session) => session.id === workspace.activeSessionId) ?? null,
    [workspace],
  );

  const hosts = workspace?.hosts ?? [];
  const selectedHost = hosts.find((host: Host) => host.id === selectedHostId) ?? hosts[0] ?? null;
  const selectedHostConfig = hostConfigs.find((config: HostConnectionConfig) => config.hostId === selectedHostId) ?? null;
  const diagnosis = (workspace?.latestDiagnosis ?? null) as (TalonWorkspaceState["latestDiagnosis"] & { provider?: string; errorMessage?: string | null; contextPacketId?: string }) | null;
  const failure = workspace?.latestFailure ?? null;
  const timeline = workspace?.timeline ?? [];
  const activeAction = diagnosis?.suggestedActions.find((action: SuggestedAction) => action.status === "ready") ?? null;
  const activeSessionBusy = activeSession ? busySessionIds.includes(activeSession.id) : false;
  const showOperationalPanels = activeSession?.state !== "disconnected";
  const repeatedSignalCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of timeline) {
      if (!item.stderrClass) continue;
      counts.set(item.stderrClass, (counts.get(item.stderrClass) ?? 0) + 1);
    }
    return counts;
  }, [timeline]);
  const repeatedSignals = useMemo(
    () =>
      Array.from(repeatedSignalCounts.entries())
        .filter(([, count]) => count >= 2)
        .sort((left, right) => right[1] - left[1]),
    [repeatedSignalCounts],
  );
  const timelineSignalSummary = useMemo(() => {
    if (!activeTimelineSignalFilter) return repeatedSignals;

    if (!repeatedSignalCounts.has(activeTimelineSignalFilter)) {
      return repeatedSignals;
    }

    if (repeatedSignals.some(([signal]) => signal === activeTimelineSignalFilter)) {
      return repeatedSignals;
    }

    return [
      [activeTimelineSignalFilter, repeatedSignalCounts.get(activeTimelineSignalFilter) ?? 1] as [string, number],
      ...repeatedSignals,
    ];
  }, [repeatedSignals, repeatedSignalCounts, activeTimelineSignalFilter]);
  const visibleTimeline = useMemo(
    () =>
      activeTimelineSignalFilter ? timeline.filter((item) => item.stderrClass === activeTimelineSignalFilter) : timeline,
    [timeline, activeTimelineSignalFilter],
  );

  useEffect(() => {
    if (!activeTimelineSignalFilter) return;
    if (timeline.some((item) => item.stderrClass === activeTimelineSignalFilter)) return;
    setActiveTimelineSignalFilter(null);
  }, [timeline, activeTimelineSignalFilter]);

  useEffect(() => {
    if (!activeConnectionIssue) return;
    setIsSessionOverrideExpanded(true);
  }, [activeConnectionIssue]);

  useEffect(() => {
    if (!workspace?.activeSessionId) return;
    void getLatestContextPacket(workspace.activeSessionId).then((response) => {
      setLatestContextPacket(response.packet);
    });
  }, [workspace?.activeSessionId, diagnosis?.contextPacketId]);

  async function connectSelectedHost() {
    if (!selectedHost) return;
    setIsConnectingSession(true);
    try {
      const result = await connectSessionCommand({
          hostId: selectedHost.id,
          address: connectionAddress.trim(),
          port: Number(connectionPort) || 22,
          username: connectionUsername.trim(),
          authMethod: connectionAuthMethod,
          password: connectionAuthMethod === "password" ? connectionPassword : undefined,
        });
      setActionSummary(`Managed session ready for ${selectedHost.config.label} in ${result.session.cwd}.`);
      await Promise.all([refreshWorkspace(), refreshRegistry()]);
      const snapshot = await getTerminalSnapshot(result.session.sessionId);
      setTerminalTail(snapshot.lines);
    } finally {
      setIsConnectingSession(false);
    }
  }

  async function submitCommand(command: string) {
    if (!activeSession || !command.trim()) return;
    setIsSubmittingCommand(true);
    setActiveTab("shell");
    try {
      const result = await submitSessionCommand(activeSession.id, command);




      setTerminalTail(result.terminal.lines);
      setActionSummary(result.accepted ? `Command submitted to ${activeSession.id}: ${command}` : result.message);
      await refreshRegistry();
    } finally {
      setIsSubmittingCommand(false);
    }
  }

  async function disconnectActiveSession() {
    if (!activeSession) return;
    setIsDisconnectingSession(true);
    try {
      const result = await disconnectSessionCommand(activeSession.id);
      setTerminalTail(result.terminal.lines);
      setActionSummary(`Disconnect requested for ${activeSession.id}.`);
      await Promise.all([refreshWorkspace(), refreshRegistry()]);
    } finally {
      setIsDisconnectingSession(false);
    }
  }

  async function reconnectActiveSession() {
    if (!selectedHost) return;
    setIsReconnectingSession(true);
    try {
      const result = await reconnectSessionCommand({
          hostId: selectedHost.id,
          address: connectionAddress.trim(),
          port: Number(connectionPort) || 22,
          username: connectionUsername.trim(),
          authMethod: connectionAuthMethod,
          password: connectionAuthMethod === "password" ? connectionPassword : undefined,
        });
      setActionSummary(`Reconnect requested for ${selectedHost.config.label}.`);
      await Promise.all([refreshWorkspace(), refreshRegistry()]);
      const snapshot = await getTerminalSnapshot(result.session.sessionId);
      setTerminalTail(snapshot.lines);
    } finally {
      setIsReconnectingSession(false);
    }
  }

  async function runAction(action: SuggestedAction) {
    if (!activeSession) return;
    setIsRunningAction(action.id);
    setActionSummary(null);
    setActiveTab("shell");

    try {
      const result = await runSuggestedActionCommand(activeSession.id, action);




      setTerminalTail((current) => [...current, ...result.appendedTerminalLines]);
      setActionSummary(result.summary);
      setComposerValue(action.command);
    } finally {
      setIsRunningAction(null);
    }
  }

  async function saveSavedHostPassword() {
    if (!selectedHost || !savedHostPasswordInput.trim()) return;
    const result = await saveHostPasswordCommand(selectedHost.id, savedHostPasswordInput);
    setHostConfigs(result.hostConfigs);
    setSavedHostPasswordInput("");
    setActionSummary(`Saved a system-keychain password for ${selectedHost.config.label}.`);
  }

  async function clearSavedHostPassword() {
    if (!selectedHost) return;
    const result = await clearHostPasswordCommand(selectedHost.id);
    setHostConfigs(result.hostConfigs);
    setSavedHostPasswordInput("");
    setActionSummary(`Cleared the saved password for ${selectedHost.config.label}.`);
  }

  async function saveAgentConfiguration() {
    const settings = await saveAgentConfigurationCommand({
        providerType: agentSettings?.providerType ?? "openai-compatible",
        baseUrl: agentBaseUrlInput.trim(),
        model: agentModelInput.trim(),
        autoDiagnose: agentAutoDiagnoseInput,
        requestTimeoutSec: agentSettings?.requestTimeoutSec ?? 20,
      });
    setAgentSettings(settings.settings);
    setActionSummary("Saved AI provider settings.");
  }

  async function saveAgentApiKey() {
    if (!agentApiKeyInput.trim()) return;
    const settings = await saveAgentApiKeyCommand(agentApiKeyInput.trim());
    setAgentSettings(settings.settings);
    setAgentApiKeyInput("");
    setActionSummary("Saved API key to the system credential store.");
  }

  async function clearAgentApiKey() {
    const settings = await clearAgentApiKeyCommand();
    setAgentSettings(settings.settings);
    setAgentApiKeyInput("");
    setActionSummary("Cleared the saved API key.");
  }

  async function prepareHostTrustFlow() {
    if (!activeSession) return;
    const response = await prepareHostTrustCommand(activeSession.id);
    setActiveConnectionIssue(response.issue);
    setActionSummary(`Prepared host trust details for ${selectedHost?.config.label ?? activeSession.id}.`);
  }

  async function confirmHostTrustFlow() {
    if (!activeSession || !activeConnectionIssue?.fingerprint) return;
    await confirmHostTrustCommand(activeSession.id, activeConnectionIssue.fingerprint);
    await Promise.all([refreshWorkspace(), refreshRegistry()]);
    setActionSummary(`Trusted ${activeConnectionIssue.host ?? selectedHost?.config.label ?? activeSession.id} and updated known_hosts.`);
  }

  async function rerunDiagnosis() {
    if (!activeSession) return;
    const nextState = await retryDiagnosisCommand(activeSession.id);
    setWorkspace(nextState);
    setActionSummary(`Regenerated diagnosis for ${selectedHost?.config.label ?? activeSession.id}.`);
  }
  function resetConnectionOverride() {
    if (!selectedHost) return;
    const nextConfig = hostConfigs.find((config: HostConnectionConfig) => config.hostId === selectedHost.id) ?? null;
    const derivedUsername = selectedHost.config.address.includes("@") ? selectedHost.config.address.split("@")[0] : nextConfig?.username ?? "";
    setConnectionAddress(selectedHost.config.address);
    setConnectionPort(String(nextConfig?.port ?? 22));
    setConnectionUsername(nextConfig?.username ?? derivedUsername);
    setConnectionAuthMethod((nextConfig?.authMethod as ConnectionAuthMethod) ?? "agent");
    setConnectionPassword("");
    setActionSummary(`Reset connection override for ${selectedHost.config.label} back to saved host config.`);
  }

  function parseTags(input: string) {
    return input
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag, index, collection) => tag.length > 0 && collection.indexOf(tag) === index);
  }

  async function saveHostConfig(hostId: string) {
    setIsSavingHostConfig(true);
    try {
      const result = await upsertHostConfigCommand({
          hostId,
          port: Number(hostPortInput) || 22,
          username: hostUsernameInput.trim() || "root",
          authMethod: hostAuthMethodInput,
          fingerprintHint: hostFingerprintHintInput.trim() || "Pending trust",
          privateKeyPath: hostPrivateKeyPathInput.trim() || null,
        });
      setHostConfigs(result.hostConfigs);
      await refreshRegistry();
    } finally {
      setIsSavingHostConfig(false);
    }
  }

  async function createHost() {
    const hostId = `host-${crypto.randomUUID().slice(0, 8)}`;
    const label = hostLabelInput.trim() || "new-host";
    const address = hostAddressInput.trim() || `${hostUsernameInput.trim() || "root"}@127.0.0.1`;
    await upsertHostCommand({
        id: hostId,
        label,
        address,
        region: hostRegionInput.trim() || "custom",
        tags: parseTags(hostTagsInput),
      });
    setSelectedHostId(hostId);
    initializedConnectionHostId.current = null;
    await saveHostConfig(hostId);
    await refreshWorkspace();
    setActionSummary(`Created host config for ${label}.`);
  }

  async function updateSelectedHost() {
    if (!selectedHost) return;
    const updatedHost = {
      id: selectedHost.id,
      label: hostLabelInput.trim() || selectedHost.config.label,
      address: hostAddressInput.trim() || selectedHost.config.address,
      region: hostRegionInput.trim() || selectedHost.config.region,
      tags: parseTags(hostTagsInput),
    };
    await upsertHostCommand(updatedHost);
    await saveHostConfig(selectedHost.id);
    await refreshWorkspace();
    setActionSummary(`Saved host config for ${updatedHost.label}.`);
  }

  async function deleteSelectedHost() {
    if (!selectedHost) return;
    setIsDeletingHostConfig(true);
    try {
      await deleteHostCommand(selectedHost.id);
      await refreshWorkspace();
      const remainingHosts = (await getWorkspaceState()).hosts;
      setSelectedHostId(remainingHosts[0]?.id ?? null);
      initializedConnectionHostId.current = null;
      await refreshRegistry();
      setActionSummary(`Deleted host config for ${selectedHost.config.label}.`);
    } finally {
      setIsDeletingHostConfig(false);
    }
  }

  if (!workspace || !diagnosis || !failure || !activeSession || !selectedHost) {
    return (
      <main className="app-shell loading-state">
        <section className="panel empty-panel">
          <p className="panel-kicker">Talon</p>
          <h2>{isLoadingState ? "Loading workspace state" : "No workspace state available"}</h2>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <TopBar
        hosts={hosts}
        selectedHostId={selectedHost.id}
        isSavingHostConfig={isSavingHostConfig}
        isReconnectingSession={isReconnectingSession}
        isDisconnectingSession={isDisconnectingSession}
        isConnectingSession={isConnectingSession}
        onSelectHost={setSelectedHostId}
        onCreateHost={() => void createHost()}
        onReconnect={() => void reconnectActiveSession()}
        onDisconnect={() => void disconnectActiveSession()}
        onConnect={() => void connectSelectedHost()}
      />

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
            isSavingHostConfig={isSavingHostConfig}
            isDeletingHostConfig={isDeletingHostConfig}
            onSelectHost={setSelectedHostId}
            onSetAgentBaseUrlInput={setAgentBaseUrlInput}
            onSetAgentModelInput={setAgentModelInput}
            onSetAgentAutoDiagnoseInput={setAgentAutoDiagnoseInput}
            onSetAgentApiKeyInput={setAgentApiKeyInput}
            onSaveAgentConfiguration={() => void saveAgentConfiguration()}
            onSaveAgentApiKey={() => void saveAgentApiKey()}
            onClearAgentApiKey={() => void clearAgentApiKey()}
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
            onSaveSavedHostPassword={() => void saveSavedHostPassword()}
            onClearSavedHostPassword={() => void clearSavedHostPassword()}
            onUpdateSelectedHost={() => void updateSelectedHost()}
            onDeleteSelectedHost={() => void deleteSelectedHost()}
            onToggleSessionOverride={() => setIsSessionOverrideExpanded((current) => !current)}
            onSetConnectionAddress={setConnectionAddress}
            onSetConnectionPort={setConnectionPort}
            onSetConnectionUsername={setConnectionUsername}
            onSetConnectionAuthMethod={setConnectionAuthMethod}
            onSetConnectionPassword={setConnectionPassword}
            onResetConnectionOverride={resetConnectionOverride}
            onPrepareHostTrustFlow={() => void prepareHostTrustFlow()}
            onConfirmHostTrustFlow={() => void confirmHostTrustFlow()}
          />
        ) : null}

        <ShellWorkspace
          activeTab={activeTab}
          activeSession={activeSession}
          activeSessionBusy={activeSessionBusy}
          selectedHost={selectedHost}
          failure={failure}
          activeConnectionIssueTitle={activeConnectionIssue?.title ?? null}
          activeConnectionIssueSummary={activeConnectionIssue?.summary ?? null}
          showOperationalPanels={showOperationalPanels}
          terminalTail={terminalTail}
          isRunningAction={isRunningAction}
          isSubmittingCommand={isSubmittingCommand}
          composerValue={composerValue}
          activeAction={activeAction}
          onSetActiveTab={setActiveTab}
          onSetComposerValue={setComposerValue}
          onSubmitCommand={() => void submitCommand(composerValue)}
        />

        {activeTab === "timeline" ? (
          <TimelineView
            failure={failure}
            timelineSignalSummary={timelineSignalSummary}
            activeTimelineSignalFilter={activeTimelineSignalFilter}
            onToggleSignalFilter={(signal) => setActiveTimelineSignalFilter((current) => (current === signal ? null : signal))}
            onClearSignalFilter={() => setActiveTimelineSignalFilter(null)}
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
            onRerunDiagnosis={() => void rerunDiagnosis()}
            onRunAction={(action) => void runAction(action)}
          />
        ) : null}

        {activeTab === "artifacts" ? <ArtifactsView failure={failure} latestContextPacket={latestContextPacket} /> : null}
      </section>
    </main>
  );
}

export default App;


