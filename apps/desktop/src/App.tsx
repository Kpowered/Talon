import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  DiagnosisMessage,
  HealthStatus,
  Host,
  RunbookActionResult,
  Session,
  SuggestedAction,
  TalonWorkspaceState,
  TerminalSnapshot,
  TimelineEvent,
} from "@talon/core";
import "./App.css";

type TerminalTab = "shell" | "timeline" | "artifacts";

type SessionLifecycleEvent = {
  id: string;
  sessionId: string;
  eventType: string;
  detail: string;
  occurredAt: string;
};

type HostConnectionConfig = {
  hostId: string;
  port: number;
  username: string;
  authMethod: string;
  fingerprintHint: string;
};

type ConnectionAuthMethod = "agent" | "private-key" | "password";

type ConnectSessionResponse = {
  session: {
    sessionId: string;
    hostId: string;
    state: string;
    shell: string;
    cwd: string;
    autoCaptureEnabled: boolean;
  };
  events: SessionLifecycleEvent[];
};

type SessionRegistryResponse = {
  hostConfigs: HostConnectionConfig[];
  activeSessionId: string;
  busySessionIds: string[];
  activeConnectionIssue: SessionConnectionIssue | null;
};

type SessionEventListResponse = {
  events: SessionLifecycleEvent[];
};

type SubmitCommandResponse = {
  terminal: TerminalSnapshot;
  events: SessionLifecycleEvent[];
  accepted: boolean;
  message: string;
};

type DisconnectSessionResponse = {
  terminal: TerminalSnapshot;
  events: SessionLifecycleEvent[];
};

type HostConfigMutationResponse = {
  hostConfigs: HostConnectionConfig[];
};

type HostMutationResponse = {
  hosts: Host[];
};

type SessionConnectionIssue = {
  sessionId: string;
  kind: string;
  title: string;
  summary: string;
  operatorAction: string;
  suggestedCommand: string;
  observedAt: string;
};

function statusLabel(status: HealthStatus) {
  if (status === "critical") return "Critical";
  if (status === "warning") return "Warning";
  return "Healthy";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function metricTone(status: HealthStatus) {
  if (status === "critical") return "bad";
  if (status === "warning") return "warn";
  return "good";
}

function sourceLabel(message: DiagnosisMessage["source"]) {
  return message === "agent" ? "Talon AI" : "System";
}

function sessionStateLabel(session: Session["state"]) {
  if (session === "degraded") return "Degraded";
  if (session === "disconnected") return "Disconnected";
  return "Connected";
}

function stderrClassLabel(value?: string | null) {
  if (!value) return "No classifier";
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function App() {
  const [workspace, setWorkspace] = useState<TalonWorkspaceState | null>(null);
  const [activeTab, setActiveTab] = useState<TerminalTab>("shell");
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isRunningAction, setIsRunningAction] = useState<string | null>(null);
  const [actionSummary, setActionSummary] = useState<string | null>(null);
  const [terminalTail, setTerminalTail] = useState<string[]>([]);
  const [isConnectingSession, setIsConnectingSession] = useState(false);
  const [sessionEvents, setSessionEvents] = useState<SessionLifecycleEvent[]>([]);
  const [hostConfigs, setHostConfigs] = useState<HostConnectionConfig[]>([]);
  const [registryActiveSessionId, setRegistryActiveSessionId] = useState<string | null>(null);
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
  const [isSavingHostConfig, setIsSavingHostConfig] = useState(false);
  const [isDeletingHostConfig, setIsDeletingHostConfig] = useState(false);

  async function refreshWorkspace() {
    const state = await invoke<TalonWorkspaceState>("get_workspace_state");
    setWorkspace(state);
    setSelectedHostId((current) => current ?? state.sessions[0]?.hostId ?? state.hosts[0]?.id ?? null);
    if (state.terminal.lines.length > 0) setTerminalTail(state.terminal.lines);
  }

  async function refreshRegistry() {
    const [registry, events] = await Promise.all([
      invoke<SessionRegistryResponse>("get_session_registry"),
      invoke<SessionEventListResponse>("get_session_events"),
    ]);
    setHostConfigs(registry.hostConfigs);
    setRegistryActiveSessionId(registry.activeSessionId);
    setBusySessionIds(registry.busySessionIds);
    setActiveConnectionIssue(registry.activeConnectionIssue);
    setSessionEvents(events.events);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setIsLoadingState(true);
      try {
        const [state, registry, events] = await Promise.all([
          invoke<TalonWorkspaceState>("get_workspace_state"),
          invoke<SessionRegistryResponse>("get_session_registry"),
          invoke<SessionEventListResponse>("get_session_events"),
        ]);
        if (cancelled) return;
        setWorkspace(state);
        setSelectedHostId((current) => current ?? state.sessions[0]?.hostId ?? state.hosts[0]?.id ?? null);
        setHostConfigs(registry.hostConfigs);
        setRegistryActiveSessionId(registry.activeSessionId);
        setBusySessionIds(registry.busySessionIds);
        setActiveConnectionIssue(registry.activeConnectionIssue);
        setSessionEvents(events.events);
        setTerminalTail(state.terminal.lines);
        setComposerValue(state.latestDiagnosis.suggestedActions[0]?.command ?? "");
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
      void invoke<TerminalSnapshot>("get_terminal_snapshot", { sessionId: workspace.activeSessionId }).then((snapshot) => {
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
  }, [workspace?.hosts, selectedHostId, hostConfigs]);

  const activeSession = useMemo(
    () => workspace?.sessions.find((session: Session) => session.id === workspace.activeSessionId) ?? null,
    [workspace],
  );

  const hosts = workspace?.hosts ?? [];
  const selectedHost = hosts.find((host: Host) => host.id === selectedHostId) ?? hosts[0] ?? null;
  const selectedHostConfig = hostConfigs.find((config: HostConnectionConfig) => config.hostId === selectedHostId) ?? null;
  const diagnosis = workspace?.latestDiagnosis ?? null;
  const failure = workspace?.latestFailure ?? null;
  const timeline = workspace?.timeline ?? [];
  const activeAction = diagnosis?.suggestedActions.find((action: SuggestedAction) => action.status === "ready") ?? null;
  const activeSessionBusy = activeSession ? busySessionIds.includes(activeSession.id) : false;

  const metrics = useMemo(() => {
    if (!workspace || !diagnosis || !failure) return [];

    const connectedHosts = workspace.hosts.filter((host: Host) => host.observed.status !== "critical").length;

    return [
      {
        label: "Connected hosts",
        value: `${workspace.hosts.length}`,
        detail: `${connectedHosts} stable, ${workspace.hosts.length - connectedHosts} need attention`,
        tone: "default",
      },
      {
        label: "Failure severity",
        value: statusLabel(failure.severity),
        detail: `${failure.exitCode !== 0 ? `exit ${failure.exitCode}` : "exit 0"} in ${failure.cwd}`,
        tone: metricTone(failure.severity),
      },
      {
        label: "Diagnosis confidence",
        value: `${diagnosis.confidence}%`,
        detail: isLoadingState ? "Refreshing incident state" : "Context-specific diagnosis packet ready",
        tone: diagnosis.confidence >= 80 ? "good" : diagnosis.confidence >= 60 ? "warn" : "bad",
      },
      {
        label: "Managed sessions",
        value: `${workspace.sessions.length}`,
        detail: registryActiveSessionId ? `Active ${registryActiveSessionId}` : "No active session yet",
        tone: "default",
      },
    ];
  }, [workspace, diagnosis, failure, isLoadingState, registryActiveSessionId]);

  const terminalContent = useMemo(() => {
    if (!workspace) return [];
    if (activeTab === "shell") return terminalTail;
    if (activeTab === "timeline") {
      return timeline.map(
        (item: TimelineEvent) =>
          `${formatTime(item.occurredAt)}  ${item.title}\n${item.detail}${item.exitCode != null ? ` | exit ${item.exitCode}` : ""}`,
      );
    }
    return failure?.relatedArtifacts ?? [];
  }, [workspace, activeTab, terminalTail, timeline, failure]);

  async function connectSelectedHost() {
    if (!selectedHost) return;
    setIsConnectingSession(true);
    try {
      const result = await invoke<ConnectSessionResponse>("connect_session", {
        payload: {
          hostId: selectedHost.id,
          address: connectionAddress.trim(),
          port: Number(connectionPort) || 22,
          username: connectionUsername.trim(),
          authMethod: connectionAuthMethod,
          password: connectionAuthMethod === "password" ? connectionPassword : undefined,
        },
      });
      setSessionEvents(result.events);
      setActionSummary(`Managed session ready for ${selectedHost.config.label} in ${result.session.cwd}.`);
      await Promise.all([refreshWorkspace(), refreshRegistry()]);
      const snapshot = await invoke<TerminalSnapshot>("get_terminal_snapshot", { sessionId: result.session.sessionId });
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
      const result = await invoke<SubmitCommandResponse>("submit_session_command", {
        payload: {
          sessionId: activeSession.id,
          command,
        },
      });
      setTerminalTail(result.terminal.lines);
      setSessionEvents(result.events);
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
      const result = await invoke<DisconnectSessionResponse>("disconnect_session", {
        payload: { sessionId: activeSession.id },
      });
      setTerminalTail(result.terminal.lines);
      setSessionEvents(result.events);
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
      const result = await invoke<ConnectSessionResponse>("reconnect_session", {
        payload: {
          hostId: selectedHost.id,
          address: connectionAddress.trim(),
          port: Number(connectionPort) || 22,
          username: connectionUsername.trim(),
          authMethod: connectionAuthMethod,
          password: connectionAuthMethod === "password" ? connectionPassword : undefined,
        },
      });
      setSessionEvents(result.events);
      setActionSummary(`Reconnect requested for ${selectedHost.config.label}.`);
      await Promise.all([refreshWorkspace(), refreshRegistry()]);
      const snapshot = await invoke<TerminalSnapshot>("get_terminal_snapshot", { sessionId: result.session.sessionId });
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
      const result = await invoke<RunbookActionResult>("run_suggested_action", {
        payload: {
          sessionId: activeSession.id,
          actionId: action.id,
        },
      });
      setTerminalTail((current) => [...current, ...result.appendedTerminalLines]);
      setActionSummary(result.summary);
      setComposerValue(action.command);
    } finally {
      setIsRunningAction(null);
    }
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
      const result = await invoke<HostConfigMutationResponse>("upsert_host_config", {
        payload: {
          hostId,
          port: Number(hostPortInput) || 22,
          username: hostUsernameInput.trim() || "root",
          authMethod: hostAuthMethodInput,
          fingerprintHint: hostFingerprintHintInput.trim() || "Pending trust",
        },
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
    await invoke<HostMutationResponse>("upsert_host", {
      payload: {
        id: hostId,
        label,
        address,
        region: hostRegionInput.trim() || "custom",
        tags: parseTags(hostTagsInput),
      },
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
    await invoke<HostMutationResponse>("upsert_host", {
      payload: updatedHost,
    });
    await saveHostConfig(selectedHost.id);
    await refreshWorkspace();
    setActionSummary(`Saved host config for ${updatedHost.label}.`);
  }

  async function deleteSelectedHost() {
    if (!selectedHost) return;
    setIsDeletingHostConfig(true);
    try {
      await invoke<HostMutationResponse>("delete_host", {
        payload: { hostId: selectedHost.id },
      });
      await refreshWorkspace();
      const remainingHosts = (await invoke<TalonWorkspaceState>("get_workspace_state")).hosts;
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
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">T</div>
          <div>
            <p className="eyebrow">AI-native SSH troubleshooting</p>
            <div className="title-row">
              <h1>Talon</h1>
              <span className="release-badge">Command Stream Skeleton</span>
              <span className="backend-badge">Registry API live</span>
            </div>
            <p className="subtitle">
              The desktop shell now talks to a backend-managed session registry with host connection config,
              active session tracking, recent lifecycle events, and command submission scaffolding.
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => void createHost()} disabled={isSavingHostConfig}>
            {isSavingHostConfig ? "Saving..." : "New host"}
          </button>
          <button className="ghost-button">Incident history</button>
          <button className="ghost-button" onClick={() => void reconnectActiveSession()} disabled={isReconnectingSession}>
            {isReconnectingSession ? "Reconnecting..." : "Reconnect"}
          </button>
          <button className="ghost-button" onClick={() => void disconnectActiveSession()} disabled={isDisconnectingSession}>
            {isDisconnectingSession ? "Disconnecting..." : "Disconnect"}
          </button>
          <button className="primary-button" onClick={() => void connectSelectedHost()} disabled={isConnectingSession}>
            {isConnectingSession ? "Connecting..." : "Connect session"}
          </button>
        </div>
      </header>

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`metric-card tone-${metric.tone}`}>
            <p>{metric.label}</p>
            <h3>{metric.value}</h3>
            <span>{metric.detail}</span>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <aside className="panel panel-hosts">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Hosts</p>
              <h2>Fleet overview</h2>
            </div>
            <span className="pill">{hosts.length} tracked</span>
          </div>

          <div className="search-box">
            <span>Host</span>
            <input value={selectedHost.config.label} readOnly aria-label="Selected host" />
          </div>

          <div className="host-list">
            {hosts.map((host: Host) => (
              <button
                key={host.id}
                className={`host-card status-${host.observed.status} ${host.id === selectedHost.id ? "selected" : ""}`}
                onClick={() => setSelectedHostId(host.id)}
              >
                <div className="host-row">
                  <div>
                    <h3>{host.config.label}</h3>
                    <p>{host.config.address}</p>
                  </div>
                  <span className={`status-badge status-${host.observed.status}`}>{statusLabel(host.observed.status)}</span>
                </div>
                <div className="host-details">
                  <span>{host.config.region}</span>
                  <span>{host.observed.latencyMs}ms</span>
                  <span>CPU {host.observed.cpuPercent}%</span>
                  <span>RAM {host.observed.memoryPercent}%</span>
                </div>
                <div className="host-meta">Last seen {formatTime(host.observed.lastSeenAt)}</div>
              </button>
            ))}
          </div>

          <div className="section-block">
            <div className="section-title-row">
              <div>
                <p className="panel-kicker">Saved host config</p>
                <h2>Persistent defaults</h2>
              </div>
              <span className="pill subtle">{selectedHostConfig?.authMethod ?? "unmapped"}</span>
            </div>
            <div className="session-facts">
              <span>{selectedHostConfig?.username ?? "unknown"}</span>
              <span>port {selectedHostConfig?.port ?? 0}</span>
              <span>{selectedHostConfig?.fingerprintHint ?? "no fingerprint"}</span>
            </div>
            <p className="section-note">
              These values are saved locally for this host and become the default connection baseline.
            </p>
            <div className="connection-form">
              <label className="connection-field">
                <span>Label</span>
                <input value={hostLabelInput} onChange={(event) => setHostLabelInput(event.target.value)} />
              </label>
              <label className="connection-field">
                <span>Saved address</span>
                <input value={hostAddressInput} onChange={(event) => setHostAddressInput(event.target.value)} />
              </label>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Region</span>
                  <input value={hostRegionInput} onChange={(event) => setHostRegionInput(event.target.value)} />
                </label>
                <label className="connection-field">
                  <span>Tags</span>
                  <input
                    value={hostTagsInput}
                    onChange={(event) => setHostTagsInput(event.target.value)}
                    placeholder="production, api"
                  />
                </label>
              </div>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Saved port</span>
                  <input value={hostPortInput} onChange={(event) => setHostPortInput(event.target.value)} inputMode="numeric" />
                </label>
                <label className="connection-field">
                  <span>Saved user</span>
                  <input value={hostUsernameInput} onChange={(event) => setHostUsernameInput(event.target.value)} />
                </label>
              </div>
              <label className="connection-field">
                <span>Saved auth</span>
                <select value={hostAuthMethodInput} onChange={(event) => setHostAuthMethodInput(event.target.value as ConnectionAuthMethod)}>
                  <option value="agent">agent</option>
                  <option value="private-key">private-key</option>
                  <option value="password">password</option>
                </select>
              </label>
              <label className="connection-field">
                <span>Fingerprint trust</span>
                <input
                  value={hostFingerprintHintInput}
                  onChange={(event) => setHostFingerprintHintInput(event.target.value)}
                  placeholder="SHA256:... or Pending trust"
                />
              </label>
              <div className="host-config-actions">
                <button className="ghost-button small" onClick={() => void updateSelectedHost()} disabled={isSavingHostConfig}>
                  {isSavingHostConfig ? "Saving..." : "Save host"}
                </button>
                <button className="ghost-button small destructive" onClick={() => void deleteSelectedHost()} disabled={isDeletingHostConfig}>
                  {isDeletingHostConfig ? "Deleting..." : "Delete host"}
                </button>
              </div>
            </div>
          </div>

          <div className="section-block">
            <div className="section-title-row">
              <div>
                <p className="panel-kicker">Session connect override</p>
                <h2>Next connection only</h2>
              </div>
              <span className="pill subtle">Not saved</span>
            </div>
            <div className="override-banner">
              <strong>Saved host config stays unchanged.</strong>
              <p>Edit these fields only when the next connect or reconnect should differ from the saved host defaults.</p>
            </div>
            <div className="connection-form">
              <label className="connection-field">
                <span>Address</span>
                <input value={connectionAddress} onChange={(event) => setConnectionAddress(event.target.value)} />
              </label>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Port</span>
                  <input value={connectionPort} onChange={(event) => setConnectionPort(event.target.value)} inputMode="numeric" />
                </label>
                <label className="connection-field">
                  <span>User</span>
                  <input value={connectionUsername} onChange={(event) => setConnectionUsername(event.target.value)} />
                </label>
              </div>
              <label className="connection-field">
                <span>Auth</span>
                <select value={connectionAuthMethod} onChange={(event) => setConnectionAuthMethod(event.target.value as ConnectionAuthMethod)}>
                  <option value="agent">agent</option>
                  <option value="private-key">private-key</option>
                  <option value="password">password</option>
                </select>
              </label>
              {connectionAuthMethod === "password" ? (
                <label className="connection-field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={connectionPassword}
                    onChange={(event) => setConnectionPassword(event.target.value)}
                    placeholder="Operator-provided password"
                  />
                </label>
              ) : null}
              <div className="host-config-actions">
                <button className="ghost-button small" onClick={resetConnectionOverride}>
                  Use saved host defaults
                </button>
              </div>
            </div>
            <p className="section-note">
              These values apply only to the next connect or reconnect action. The password is never persisted.
            </p>
            {activeConnectionIssue ? (
              <div className={`connection-issue issue-${activeConnectionIssue.kind}`}>
                <strong>{activeConnectionIssue.title}</strong>
                <p>{activeConnectionIssue.summary}</p>
                <span>{activeConnectionIssue.operatorAction}</span>
                <code>{activeConnectionIssue.suggestedCommand}</code>
              </div>
            ) : null}
          </div>

          <div className="section-block">
            <div className="section-title-row">
              <div>
                <p className="panel-kicker">Session</p>
                <h2>Active shell</h2>
              </div>
              <span className="pill subtle">{sessionStateLabel(activeSession.state)}</span>
            </div>
            <div className="session-facts">
              <span>{activeSession.shell}</span>
              <span>{activeSession.cwd}</span>
              <span>{activeSession.autoCaptureEnabled ? "Auto-capture on" : "Auto-capture off"}</span>
            </div>
          </div>

          <div className="section-block">
            <div className="section-title-row">
              <div>
                <p className="panel-kicker">Lifecycle</p>
                <h2>Recent events</h2>
              </div>
              <span className="pill subtle">{sessionEvents.length} events</span>
            </div>
            <div className="event-list">
              {sessionEvents.length === 0 ? <p className="empty-copy">No managed session opened yet.</p> : null}
              {sessionEvents.map((event) => (
                <article key={event.id} className="event-card">
                  <strong>{event.eventType}</strong>
                  <p>{event.detail}</p>
                  <span>{formatTime(event.occurredAt)}</span>
                </article>
              ))}
            </div>
          </div>
        </aside>

        <section className="panel panel-terminal">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Live terminal</p>
              <div className="title-row compact">
                <h2>{selectedHost.config.label}</h2>
                <span className={`live-dot status-${failure.severity}`}>{statusLabel(failure.severity)}</span>
              </div>
            </div>
            <div className="terminal-tabs">
              <button className={`tab ${activeTab === "shell" ? "active" : ""}`} onClick={() => setActiveTab("shell")}>
                Incident shell
              </button>
              <button className={`tab ${activeTab === "timeline" ? "active" : ""}`} onClick={() => setActiveTab("timeline")}>
                Timeline
              </button>
              <button className={`tab ${activeTab === "artifacts" ? "active" : ""}`} onClick={() => setActiveTab("artifacts")}>
                Artifacts
              </button>
            </div>
          </div>

          <div className="terminal-toolbar">
            <span className="window-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="terminal-path">
              {activeSession.cwd} | {selectedHost.config.address} | session #{activeSession.id}
            </span>
            <span className="terminal-mode">
              {activeSessionBusy
                ? "Command in flight"
                : activeSession.autoCaptureEnabled
                  ? "Auto-capture ON"
                  : "Auto-capture OFF"}
            </span>
          </div>

          <div className="terminal-window">
            {terminalContent.map((line: string, index: number) => (
              <div
                key={`${line}-${index}`}
                className={line.startsWith("$") || /^\d{2}:\d{2}:\d{2}/.test(line) ? "terminal-line prompt" : "terminal-line"}
              >
                {line || <span>&nbsp;</span>}
              </div>
            ))}
            {isRunningAction ? <div className="terminal-line prompt">...running suggested action through Tauri backend</div> : null}
            {isSubmittingCommand ? <div className="terminal-line prompt">...submitting command to managed session</div> : null}
          </div>

          <div className="command-composer command-composer-stack">
            <input
              className="composer-field"
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              placeholder="Type a command to send to the active session"
            />
            <div className="composer-actions">
              <button className="ghost-button small" onClick={() => activeAction && setComposerValue(activeAction.command)}>
                Use suggested command
              </button>
              <button
                className="primary-button small"
                onClick={() => void submitCommand(composerValue)}
                disabled={isSubmittingCommand || activeSessionBusy || !composerValue.trim()}
              >
                {isSubmittingCommand ? "Sending..." : activeSessionBusy ? "Busy..." : "Send command"}
              </button>
            </div>
          </div>

          <div className="timeline-header">
            <div>
              <p className="panel-kicker">Failure context</p>
              <h2>{failure.summary}</h2>
            </div>
            <span className="pill subtle">Captured {formatTime(failure.capturedAt)}</span>
          </div>

          <div className="timeline">
            {timeline.map((item: TimelineEvent) => (
              <article key={item.id} className="timeline-item">
                <div className="timeline-time">{formatTime(item.occurredAt)}</div>
                <div className="timeline-content">
                  <div className="timeline-command">{item.title}</div>
                  <p>{item.detail}</p>
                </div>
                <div className={`exit-code ${item.exitCode === 0 ? "ok" : "fail"}`}>
                  {item.exitCode == null ? item.kind : `exit ${item.exitCode}`}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel panel-ai">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">AI diagnosis</p>
              <h2>Incident copilot</h2>
            </div>
            <span className="pill subtle">{diagnosis.confidence}% confidence</span>
          </div>

          <article className="incident-hero">
            <div>
              <p className="incident-label">Primary finding</p>
              <h3>{actionSummary ?? diagnosis.summary}</h3>
            </div>
            <div className="hero-badges">
              {failure.stderrClass ? <span className="confidence-badge signal-badge">{stderrClassLabel(failure.stderrClass)}</span> : null}
              <span className="confidence-badge">{failure.exitCode !== 0 ? `exit ${failure.exitCode}` : "clean"}</span>
            </div>
          </article>

          <div className="insight-grid">
            <article className="insight-card">
              <span>Active host</span>
              <strong>{selectedHost.config.label}</strong>
              <p>{selectedHost.config.address}</p>
            </article>
            <article className="insight-card">
              <span>Failure signal</span>
              <strong>{stderrClassLabel(failure.stderrClass)}</strong>
              <p>{failure.stderrClass ? "Matched stderr classifier" : "Using generic exit-code heuristics"}</p>
            </article>
            <article className="insight-card">
              <span>Likely causes</span>
              <strong>{diagnosis.likelyCauses.length}</strong>
              <p>{diagnosis.likelyCauses[0]}</p>
            </article>
          </div>

          <div className="diagnosis-feed">
            {diagnosis.messages.map((message: DiagnosisMessage) => (
              <article key={message.id} className={`diagnosis-card tone-${message.tone}`}>
                <div className="diagnosis-meta">
                  <span>{sourceLabel(message.source)}</span>
                  <strong>{message.title}</strong>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          <div className="action-box">
            <p className="action-label">Suggested actions</p>
            {diagnosis.suggestedActions.map((action: SuggestedAction) => (
              <button
                key={action.id}
                className="ghost-button full action-button"
                onClick={() => void runAction(action)}
                disabled={isRunningAction !== null}
              >
                <span>{action.label}</span>
                <span>{action.safetyLevel}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
