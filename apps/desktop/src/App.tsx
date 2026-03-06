import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type HostStatus = "healthy" | "warning" | "critical";
type MessageTone = "neutral" | "warning" | "critical" | "success";
type ScenarioKey = "nginx-port" | "api-latency" | "db-replication";
type TerminalTab = "shell" | "timeline" | "artifacts";

type Host = {
  id: string;
  name: string;
  address: string;
  status: HostStatus;
  latency: string;
  cpu: string;
  memory: string;
  region: string;
  lastIssue?: string;
};

type TimelineItem = {
  time: string;
  command: string;
  summary: string;
  exitCode: number;
};

type DiagnosisMessage = {
  role: "assistant" | "system";
  tone: MessageTone;
  title: string;
  body: string;
};

type Metric = {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "good" | "warn" | "bad";
};

type Scenario = {
  key: ScenarioKey;
  label: string;
  hostId: string;
  hostStatus: HostStatus;
  activeIncidents: string;
  medianLatency: string;
  aiConfidence: string;
  safeActions: string;
  summary: string;
  risk: string;
  confidenceLabel: string;
  path: string;
  sessionId: string;
  autoCapture: string;
  composerHint: string;
  terminalLines: string[];
  artifacts: string[];
  timeline: TimelineItem[];
  diagnosisFeed: DiagnosisMessage[];
};

type DemoStateResponse = {
  scenario: string;
  summary: string;
  status: HostStatus;
  suggestion: string;
  safeCommand: string;
};

type DemoActionResponse = {
  appendedLines: string[];
  status: HostStatus;
  summary: string;
};

const baseHosts: Host[] = [
  {
    id: "prod-1",
    name: "prod-web-1",
    address: "root@10.0.0.12",
    status: "critical",
    latency: "186ms",
    cpu: "74%",
    memory: "81%",
    region: "sjc-1",
    lastIssue: "nginx restart failed 2m ago",
  },
  {
    id: "api-1",
    name: "api-gateway",
    address: "root@10.0.0.23",
    status: "warning",
    latency: "92ms",
    cpu: "46%",
    memory: "67%",
    region: "hkg-1",
    lastIssue: "5xx spike detected",
  },
  {
    id: "db-1",
    name: "db-primary",
    address: "root@10.0.0.31",
    status: "healthy",
    latency: "41ms",
    cpu: "31%",
    memory: "54%",
    region: "hkg-1",
  },
  {
    id: "staging-1",
    name: "staging-box",
    address: "ubuntu@10.0.0.44",
    status: "healthy",
    latency: "58ms",
    cpu: "22%",
    memory: "40%",
    region: "dev",
  },
];

const scenarios: Record<ScenarioKey, Scenario> = {
  "nginx-port": {
    key: "nginx-port",
    label: "Nginx bind failure",
    hostId: "prod-1",
    hostStatus: "critical",
    activeIncidents: "2",
    medianLatency: "79ms",
    aiConfidence: "87%",
    safeActions: "4",
    summary: "Nginx restart blocked by port collision",
    risk: "Medium",
    confidenceLabel: "87% confidence",
    path: "/etc/nginx",
    sessionId: "a91f",
    autoCapture: "Auto-capture ON",
    composerHint: "Try: sudo lsof -i :80",
    terminalLines: [
      "$ sudo systemctl restart nginx",
      "Job for nginx.service failed because the control process exited with error code.",
      'See "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.',
      "",
      "$ sudo journalctl -u nginx -n 40 --no-pager",
      "nginx[18421]: bind() to 0.0.0.0:80 failed (98: Address already in use)",
      "nginx[18421]: still could not bind()",
      "",
      "$ sudo ss -ltnp | grep :80",
      'LISTEN 0 4096 0.0.0.0:80 0.0.0.0:* users:(("docker-proxy",pid=17302,fd=7))',
      "",
      "$ docker ps --format 'table {{.Names}}\\t{{.Ports}}'",
      "legacy-certbot   0.0.0.0:80->80/tcp, :::80->80/tcp",
    ],
    artifacts: [
      "journalctl excerpt · 40 lines",
      "Port listeners snapshot",
      "Docker published ports",
      "Host health rollup",
    ],
    timeline: [
      {
        time: "17:41:08",
        command: "sudo systemctl restart nginx",
        summary: "Job for nginx.service failed because the control process exited with error code.",
        exitCode: 1,
      },
      {
        time: "17:41:17",
        command: "sudo journalctl -u nginx -n 40 --no-pager",
        summary: "bind() to 0.0.0.0:80 failed (98: Address already in use)",
        exitCode: 0,
      },
      {
        time: "17:41:31",
        command: "sudo ss -ltnp | grep :80",
        summary: "docker-proxy is occupying port 80",
        exitCode: 0,
      },
      {
        time: "17:42:02",
        command: "docker ps --format 'table {{.Names}}\t{{.Ports}}'",
        summary: "legacy-certbot container mapped 0.0.0.0:80->80/tcp",
        exitCode: 0,
      },
    ],
    diagnosisFeed: [
      {
        role: "assistant",
        tone: "critical",
        title: "Likely root cause",
        body: "Port 80 is already occupied by docker-proxy, so nginx cannot bind and restart. This looks like a container conflict rather than an nginx config syntax issue.",
      },
      {
        role: "assistant",
        tone: "warning",
        title: "Recommended next move",
        body: "Stop or remap the legacy-certbot container first, then rerun nginx restart. Validate with nginx -t before touching live traffic.",
      },
      {
        role: "system",
        tone: "neutral",
        title: "Captured incident context",
        body: "Talon bundled the failing command, journal lines, active port listeners, recent docker mappings, and host health into one diagnosis packet.",
      },
      {
        role: "assistant",
        tone: "success",
        title: "One-click recovery plan",
        body: "1) docker stop legacy-certbot  2) nginx -t  3) systemctl restart nginx  4) curl localhost -I",
      },
    ],
  },
  "api-latency": {
    key: "api-latency",
    label: "API latency spike",
    hostId: "api-1",
    hostStatus: "warning",
    activeIncidents: "1",
    medianLatency: "214ms",
    aiConfidence: "73%",
    safeActions: "3",
    summary: "Gateway p95 latency surged after cache miss storm",
    risk: "Low",
    confidenceLabel: "73% confidence",
    path: "/srv/gateway",
    sessionId: "c302",
    autoCapture: "Auto-capture ON",
    composerHint: "Try: redis-cli info stats",
    terminalLines: [
      "$ curl -s http://127.0.0.1:9000/metrics | grep http_request_duration_seconds_bucket",
      'http_request_duration_seconds_bucket{le="0.5"} 81231',
      'http_request_duration_seconds_bucket{le="1"} 82491',
      'http_request_duration_seconds_bucket{le="2"} 82714',
      "",
      "$ redis-cli info stats | grep keyspace",
      "keyspace_hits:981220",
      "keyspace_misses:214992",
      "",
      "$ journalctl -u api-gateway -n 30 --no-pager",
      "warning: upstream cache saturation detected; fallback to origin",
      "warning: response time p95 exceeded SLO threshold",
    ],
    artifacts: [
      "Prometheus latency buckets",
      "Redis stats snapshot",
      "Gateway journal warnings",
      "Recent deploy marker",
    ],
    timeline: [
      {
        time: "18:03:11",
        command: "curl -s http://127.0.0.1:9000/metrics | grep duration",
        summary: "p95 latency moved above 1.2s within 8 minutes",
        exitCode: 0,
      },
      {
        time: "18:03:29",
        command: "redis-cli info stats | grep keyspace",
        summary: "Cache misses increased sharply after deploy",
        exitCode: 0,
      },
      {
        time: "18:03:48",
        command: "journalctl -u api-gateway -n 30 --no-pager",
        summary: "Origin fallback messages correlate with SLO breach",
        exitCode: 0,
      },
    ],
    diagnosisFeed: [
      {
        role: "assistant",
        tone: "warning",
        title: "Likely cause",
        body: "This looks like a cache miss storm rather than a CPU or network bottleneck. Requests are falling through to origin and dragging p95 upward.",
      },
      {
        role: "assistant",
        tone: "success",
        title: "Fast mitigation",
        body: "Warm hot keys, temporarily raise cache TTL, and rate-limit the expensive endpoint while origin catches up.",
      },
      {
        role: "system",
        tone: "neutral",
        title: "What Talon correlated",
        body: "Talon combined metrics output, Redis hit/miss counters, and gateway logs into a single latency diagnosis packet.",
      },
    ],
  },
  "db-replication": {
    key: "db-replication",
    label: "Replication lag",
    hostId: "db-1",
    hostStatus: "warning",
    activeIncidents: "1",
    medianLatency: "62ms",
    aiConfidence: "81%",
    safeActions: "5",
    summary: "Replica lag traced to stalled WAL replay",
    risk: "High",
    confidenceLabel: "81% confidence",
    path: "/var/lib/postgresql",
    sessionId: "f17b",
    autoCapture: "Replay watch ON",
    composerHint: "Try: sudo -u postgres psql -c 'select now() - pg_last_xact_replay_timestamp();'",
    terminalLines: [
      "$ sudo -u postgres psql -c " + '"select now() - pg_last_xact_replay_timestamp();"',
      "      ?column?      ",
      "--------------------",
      " 00:07:12.442118",
      "",
      "$ sudo journalctl -u postgresql -n 40 --no-pager",
      "postgres[2211]: recovery paused waiting for WAL segment 000000010000000A000000FE",
      "",
      "$ df -h /var/lib/postgresql",
      "/dev/sda1   84G   77G  4.5G  95% /var/lib/postgresql",
    ],
    artifacts: [
      "Replay lag query output",
      "Postgres recovery logs",
      "Disk pressure snapshot",
      "Replication slot status",
    ],
    timeline: [
      {
        time: "18:06:12",
        command: "psql -c 'select now() - pg_last_xact_replay_timestamp();'",
        summary: "Replica lag exceeds 7 minutes",
        exitCode: 0,
      },
      {
        time: "18:06:31",
        command: "journalctl -u postgresql -n 40 --no-pager",
        summary: "WAL segment replay stalled",
        exitCode: 0,
      },
      {
        time: "18:06:47",
        command: "df -h /var/lib/postgresql",
        summary: "Disk usage at 95%, increasing risk of replay failure",
        exitCode: 0,
      },
    ],
    diagnosisFeed: [
      {
        role: "assistant",
        tone: "critical",
        title: "Likely cause",
        body: "Replica lag is likely downstream of WAL replay stalling under disk pressure. This is not just network lag; the node may be unable to safely continue recovery soon.",
      },
      {
        role: "assistant",
        tone: "warning",
        title: "Operator guidance",
        body: "Free disk first, confirm replication slot health, then resume replay. Avoid promoting this replica until lag and WAL state normalize.",
      },
      {
        role: "system",
        tone: "neutral",
        title: "Context Talon captured",
        body: "Talon linked replay lag, journal warnings, and filesystem pressure into one incident record so the operator does not need to reconstruct it manually.",
      },
    ],
  },
};

const quickActions = [
  "Inspect systemd unit",
  "Check journal around failure",
  "Find port conflicts",
  "Generate rollback plan",
];

function statusLabel(status: HostStatus) {
  if (status === "critical") return "Critical";
  if (status === "warning") return "Warning";
  return "Healthy";
}

function metricTone(value: string): Metric["tone"] {
  if (value.includes("critical") || value === "2") return "bad";
  if (value.includes("73") || value === "3") return "warn";
  if (value.includes("81") || value.includes("87")) return "good";
  return "default";
}

function App() {
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("nginx-port");
  const [activeTab, setActiveTab] = useState<TerminalTab>("shell");
  const [selectedHostId, setSelectedHostId] = useState<string>(scenarios["nginx-port"].hostId);
  const [dynamicSummary, setDynamicSummary] = useState<string | null>(null);
  const [dynamicHint, setDynamicHint] = useState<string | null>(null);
  const [dynamicStatus, setDynamicStatus] = useState<HostStatus | null>(null);
  const [terminalTail, setTerminalTail] = useState<string[]>([]);
  const [isRunningCommand, setIsRunningCommand] = useState(false);
  const [isLoadingState, setIsLoadingState] = useState(false);

  const scenario = scenarios[activeScenario];

  useEffect(() => {
    let cancelled = false;

    async function loadScenarioState() {
      setIsLoadingState(true);
      setTerminalTail([]);
      try {
        const result = await invoke<DemoStateResponse>("get_demo_state", { scenario: activeScenario });
        if (cancelled) return;
        setDynamicSummary(result.summary);
        setDynamicHint(result.safeCommand);
        setDynamicStatus(result.status);
      } catch {
        if (cancelled) return;
        setDynamicSummary(null);
        setDynamicHint(null);
        setDynamicStatus(null);
      } finally {
        if (!cancelled) setIsLoadingState(false);
      }
    }

    void loadScenarioState();

    return () => {
      cancelled = true;
    };
  }, [activeScenario]);

  const hosts = useMemo(
    () =>
      baseHosts.map((host) => {
        if (host.id !== scenario.hostId) return host;
        return {
          ...host,
          status: dynamicStatus ?? scenario.hostStatus,
          lastIssue: dynamicSummary ?? scenario.summary,
        };
      }),
    [scenario, dynamicStatus, dynamicSummary],
  );

  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? hosts[0];

  const metrics: Metric[] = [
    {
      label: "Active incidents",
      value: scenario.activeIncidents,
      detail: scenario.key === "nginx-port" ? "1 critical · 1 degraded" : dynamicSummary ?? scenario.summary,
      tone: metricTone(scenario.activeIncidents),
    },
    {
      label: "Median latency",
      value: scenario.medianLatency,
      detail: `Focused on ${selectedHost.name}`,
      tone: "default",
    },
    {
      label: "AI confidence",
      value: scenario.aiConfidence,
      detail: isLoadingState ? "Refreshing backend diagnosis" : "Root cause likely identified",
      tone: metricTone(scenario.aiConfidence),
    },
    {
      label: "Safe actions",
      value: scenario.safeActions,
      detail: isRunningCommand ? "Command running via Tauri backend" : "Ready to execute",
      tone: metricTone(scenario.safeActions),
    },
  ];

  const terminalContent =
    activeTab === "shell"
      ? [...scenario.terminalLines, ...terminalTail]
      : activeTab === "timeline"
        ? scenario.timeline.map(
            (item) => `${item.time}  ${item.command}\n↳ ${item.summary} · exit ${item.exitCode}`,
          )
        : scenario.artifacts.map((item, index) => `[artifact ${index + 1}] ${item}`);

  async function runSafeCommand() {
    setIsRunningCommand(true);
    setActiveTab("shell");
    try {
      const result = await invoke<DemoActionResponse>("run_demo_command", {
        payload: {
          scenario: activeScenario,
          command: dynamicHint ?? scenario.composerHint.replace(/^Try:\s*/, ""),
        },
      });
      setTerminalTail(result.appendedLines);
      setDynamicSummary(result.summary);
      setDynamicStatus(result.status);
    } finally {
      setIsRunningCommand(false);
    }
  }

  async function suggestNext() {
    setIsLoadingState(true);
    try {
      const result = await invoke<DemoStateResponse>("get_demo_state", { scenario: activeScenario });
      setDynamicHint(result.suggestion);
      setDynamicSummary(result.summary);
    } finally {
      setIsLoadingState(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">T</div>
          <div>
            <p className="eyebrow">AI-native incident terminal</p>
            <div className="title-row">
              <h1>Talon</h1>
              <span className="release-badge">Desktop Preview</span>
              <span className="backend-badge">Tauri bridge live</span>
            </div>
            <p className="subtitle">
              Terminal-first troubleshooting with automatic context capture and operator-safe recovery.
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="ghost-button">New session</button>
          <button className="ghost-button">Incident history</button>
          <button className="primary-button">Diagnose failure</button>
        </div>
      </header>

      <section className="scenario-strip">
        {Object.values(scenarios).map((item) => (
          <button
            key={item.key}
            className={`scenario-chip ${item.key === activeScenario ? "active" : ""}`}
            onClick={() => {
              setActiveScenario(item.key);
              setSelectedHostId(item.hostId);
              setActiveTab("shell");
            }}
          >
            <span>{item.label}</span>
            <strong>{statusLabel(item.hostStatus)}</strong>
          </button>
        ))}
      </section>

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`metric-card tone-${metric.tone ?? "default"}`}>
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
            <span className="pill">4 connected</span>
          </div>

          <div className="search-box">
            <span>⌘K</span>
            <input value={selectedHost.name} readOnly aria-label="Search hosts" />
          </div>

          <div className="host-list">
            {hosts.map((host) => (
              <button
                key={host.id}
                className={`host-card status-${host.status} ${host.id === selectedHostId ? "selected" : ""}`}
                onClick={() => setSelectedHostId(host.id)}
              >
                <div className="host-row">
                  <div>
                    <h3>{host.name}</h3>
                    <p>{host.address}</p>
                  </div>
                  <span className={`status-badge status-${host.status}`}>
                    {statusLabel(host.status)}
                  </span>
                </div>
                <div className="host-details">
                  <span>{host.region}</span>
                  <span>CPU {host.cpu}</span>
                  <span>RAM {host.memory}</span>
                  <span>{host.latency}</span>
                </div>
                <div className="host-meta">{host.lastIssue ?? "No active incident"}</div>
              </button>
            ))}
          </div>

          <div className="section-block">
            <div className="section-title-row">
              <p className="panel-kicker">Quick actions</p>
              <span className="pill subtle">Ops</span>
            </div>
            <div className="chip-grid">
              {quickActions.map((action) => (
                <button key={action} className="chip-button">
                  {action}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="panel panel-terminal">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Live terminal</p>
              <div className="title-row compact">
                <h2>{selectedHost.name}</h2>
                <span className={`live-dot status-${dynamicStatus ?? selectedHost.status}`}>
                  {statusLabel(dynamicStatus ?? selectedHost.status)}
                </span>
              </div>
            </div>
            <div className="terminal-tabs">
              <button
                className={`tab ${activeTab === "shell" ? "active" : ""}`}
                onClick={() => setActiveTab("shell")}
              >
                Incident shell
              </button>
              <button
                className={`tab ${activeTab === "timeline" ? "active" : ""}`}
                onClick={() => setActiveTab("timeline")}
              >
                Command timeline
              </button>
              <button
                className={`tab ${activeTab === "artifacts" ? "active" : ""}`}
                onClick={() => setActiveTab("artifacts")}
              >
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
              {scenario.path} · {selectedHost.address.split("@")[0]} · session #{scenario.sessionId}
            </span>
            <span className="terminal-mode">{scenario.autoCapture}</span>
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
            {isRunningCommand ? <div className="terminal-line prompt">… running via Rust backend</div> : null}
          </div>

          <div className="command-composer">
            <div className="composer-input">{dynamicHint ?? scenario.composerHint}</div>
            <button className="ghost-button small" onClick={() => void suggestNext()} disabled={isLoadingState}>
              {isLoadingState ? "Thinking..." : "Suggest next"}
            </button>
            <button className="primary-button small" onClick={() => void runSafeCommand()} disabled={isRunningCommand}>
              {isRunningCommand ? "Running..." : "Run safe command"}
            </button>
          </div>

          <div className="timeline-header">
            <div>
              <p className="panel-kicker">Incident timeline</p>
              <h2>What Talon captured</h2>
            </div>
            <span className="pill subtle">{scenario.timeline.length} steps</span>
          </div>

          <div className="timeline">
            {scenario.timeline.map((item) => (
              <article key={`${item.time}-${item.command}`} className="timeline-item">
                <div className="timeline-time">{item.time}</div>
                <div className="timeline-content">
                  <div className="timeline-command">{item.command}</div>
                  <p>{item.summary}</p>
                </div>
                <div className={`exit-code ${item.exitCode === 0 ? "ok" : "fail"}`}>
                  exit {item.exitCode}
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
            <span className="pill subtle">Auto-captured</span>
          </div>

          <article className="incident-hero">
            <div>
              <p className="incident-label">Primary finding</p>
              <h3>{dynamicSummary ?? scenario.summary}</h3>
            </div>
            <span className="confidence-badge">{scenario.confidenceLabel}</span>
          </article>

          <div className="insight-grid">
            <article className="insight-card">
              <span>Active host</span>
              <strong>{selectedHost.name}</strong>
              <p>{selectedHost.address}</p>
            </article>
            <article className="insight-card">
              <span>Risk</span>
              <strong>{scenario.risk}</strong>
              <p>Talon keeps proposed actions on the safe side.</p>
            </article>
          </div>

          <div className="diagnosis-feed">
            {scenario.diagnosisFeed.map((message) => (
              <article key={message.title} className={`diagnosis-card tone-${message.tone}`}>
                <div className="diagnosis-meta">
                  <span>{message.role === "assistant" ? "Talon AI" : "System"}</span>
                  <strong>{message.title}</strong>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          <div className="action-box">
            <p className="action-label">Suggested fix bundle</p>
            <button className="primary-button full" onClick={() => void runSafeCommand()} disabled={isRunningCommand}>
              {isRunningCommand ? "Running recovery..." : "Run safe recovery plan"}
            </button>
            <button className="ghost-button full" onClick={() => void suggestNext()} disabled={isLoadingState}>
              {isLoadingState ? "Refreshing..." : "Explain why this failed"}
            </button>
            <button className="ghost-button full">Draft postmortem summary</button>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
