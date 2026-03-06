import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  DiagnosisMessage,
  HealthStatus,
  Host,
  RunbookActionResult,
  Session,
  SuggestedAction,
  TalonWorkspaceState,
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
};

type SessionEventListResponse = {
  events: SessionLifecycleEvent[];
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

  async function refreshWorkspace() {
    const state = await invoke<TalonWorkspaceState>("get_workspace_state");
    setWorkspace(state);
    setSelectedHostId((current) => current ?? state.sessions[0]?.hostId ?? state.hosts[0]?.id ?? null);
  }

  async function refreshRegistry() {
    const [registry, events] = await Promise.all([
      invoke<SessionRegistryResponse>("get_session_registry"),
      invoke<SessionEventListResponse>("get_session_events"),
    ]);
    setHostConfigs(registry.hostConfigs);
    setRegistryActiveSessionId(registry.activeSessionId);
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
        setSessionEvents(events.events);
      } finally {
        if (!cancelled) setIsLoadingState(false);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeSession = useMemo(
    () => workspace?.sessions.find((session) => session.id === workspace.activeSessionId) ?? null,
    [workspace],
  );

  const hosts = workspace?.hosts ?? [];
  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0] ?? null;
  const selectedHostConfig = hostConfigs.find((config) => config.hostId === selectedHostId) ?? null;
  const diagnosis = workspace?.latestDiagnosis ?? null;
  const failure = workspace?.latestFailure ?? null;
  const timeline = workspace?.timeline ?? [];
  const activeAction = diagnosis?.suggestedActions.find((action) => action.status === "ready") ?? null;

  const metrics = useMemo(() => {
    if (!workspace || !diagnosis || !failure) return [];

    const connectedHosts = workspace.hosts.filter((host) => host.status !== "critical").length;

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
    if (activeTab === "shell") return [...workspace.terminal.lines, ...terminalTail];
    if (activeTab === "timeline") {
      return timeline.map(
        (item) => `${formatTime(item.occurredAt)}  ${item.title}\n${item.detail}${item.exitCode !== undefined ? ` | exit ${item.exitCode}` : ""}`,
      );
    }
    return failure?.relatedArtifacts ?? [];
  }, [workspace, activeTab, terminalTail, timeline, failure]);

  async function connectSelectedHost() {
    if (!selectedHost) return;
    setIsConnectingSession(true);
    try {
      const result = await invoke<ConnectSessionResponse>("connect_session", {
        payload: { hostId: selectedHost.id },
      });
      setSessionEvents(result.events);
      setActionSummary(`Managed session ready for ${selectedHost.label} in ${result.session.cwd}.`);
      await Promise.all([refreshWorkspace(), refreshRegistry()]);
    } finally {
      setIsConnectingSession(false);
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
      setTerminalTail(result.appendedTerminalLines);
      setActionSummary(result.summary);
    } finally {
      setIsRunningAction(null);
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
              <span className="release-badge">Managed Session Skeleton</span>
              <span className="backend-badge">Registry API live</span>
            </div>
            <p className="subtitle">
              The desktop shell now talks to a backend-managed session registry with host connection config,
              active session tracking, and recent lifecycle events.
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="ghost-button">New host</button>
          <button className="ghost-button">Incident history</button>
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
            <input value={selectedHost.label} readOnly aria-label="Selected host" />
          </div>

          <div className="host-list">
            {hosts.map((host: Host) => (
              <button
                key={host.id}
                className={`host-card status-${host.status} ${host.id === selectedHost.id ? "selected" : ""}`}
                onClick={() => setSelectedHostId(host.id)}
              >
                <div className="host-row">
                  <div>
                    <h3>{host.label}</h3>
                    <p>{host.address}</p>
                  </div>
                  <span className={`status-badge status-${host.status}`}>{statusLabel(host.status)}</span>
                </div>
                <div className="host-details">
                  <span>{host.region}</span>
                  <span>{host.latencyMs}ms</span>
                  <span>CPU {host.cpuPercent}%</span>
                  <span>RAM {host.memoryPercent}%</span>
                </div>
                <div className="host-meta">Last seen {formatTime(host.lastSeenAt)}</div>
              </button>
            ))}
          </div>

          <div className="section-block">
            <div className="section-title-row">
              <div>
                <p className="panel-kicker">Connection</p>
                <h2>Selected host config</h2>
              </div>
              <span className="pill subtle">{selectedHostConfig?.authMethod ?? "unmapped"}</span>
            </div>
            <div className="session-facts">
              <span>{selectedHostConfig?.username ?? "unknown"}</span>
              <span>port {selectedHostConfig?.port ?? 0}</span>
              <span>{selectedHostConfig?.fingerprintHint ?? "no fingerprint"}</span>
            </div>
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
                <h2>{selectedHost.label}</h2>
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
              {activeSession.cwd} | {selectedHost.address} | session #{activeSession.id}
            </span>
            <span className="terminal-mode">{activeSession.autoCaptureEnabled ? "Auto-capture ON" : "Auto-capture OFF"}</span>
          </div>

          <div className="terminal-window">
            {terminalContent.map((line, index) => (
              <div
                key={`${line}-${index}`}
                className={line.startsWith("$") || /^\d{2}:\d{2}:\d{2}/.test(line) ? "terminal-line prompt" : "terminal-line"}
              >
                {line || <span>&nbsp;</span>}
              </div>
            ))}
            {isRunningAction ? <div className="terminal-line prompt">...running suggested action through Tauri backend</div> : null}
          </div>

          <div className="command-composer">
            <div className="composer-input">{activeAction?.command ?? "No suggested command queued"}</div>
            <button className="ghost-button small">Review context packet</button>
            <button
              className="primary-button small"
              onClick={() => activeAction && void runAction(activeAction)}
              disabled={!activeAction || isRunningAction !== null}
            >
              {isRunningAction ? "Running..." : "Run read-only action"}
            </button>
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
                  {item.exitCode === undefined ? item.kind : `exit ${item.exitCode}`}
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
            <span className="confidence-badge">{failure.exitCode !== 0 ? `exit ${failure.exitCode}` : "clean"}</span>
          </article>

          <div className="insight-grid">
            <article className="insight-card">
              <span>Active host</span>
              <strong>{selectedHost.label}</strong>
              <p>{selectedHost.address}</p>
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
