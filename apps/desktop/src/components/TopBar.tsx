import type { Host } from "@talon/core";

type TopBarProps = {
  hosts: Host[];
  selectedHostId: string;
  isSavingHostConfig: boolean;
  isReconnectingSession: boolean;
  isDisconnectingSession: boolean;
  isConnectingSession: boolean;
  onSelectHost: (hostId: string) => void;
  onCreateHost: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onConnect: () => void;
};

export function TopBar({
  hosts,
  selectedHostId,
  isSavingHostConfig,
  isReconnectingSession,
  isDisconnectingSession,
  isConnectingSession,
  onSelectHost,
  onCreateHost,
  onReconnect,
  onDisconnect,
  onConnect,
}: TopBarProps) {
  return (
    <header className="topbar compact-topbar">
      <div className="brand-block compact-brand">
        <div className="brand-mark">T</div>
        <div>
          <p className="eyebrow">AI-native SSH troubleshooting</p>
          <div className="title-row compact">
            <h1>Talon</h1>
            <span className="release-badge">SSH live</span>
            <span className="backend-badge">session registry</span>
          </div>
        </div>
      </div>
      <div className="topbar-host-switch">
        <select value={selectedHostId} onChange={(event) => onSelectHost(event.target.value)} aria-label="Selected host">
          {hosts.map((host) => (
            <option key={host.id} value={host.id}>
              {host.config.label}
            </option>
          ))}
        </select>
      </div>

      <div className="topbar-actions compact-actions">
        <button className="ghost-button small" onClick={onCreateHost} disabled={isSavingHostConfig}>
          {isSavingHostConfig ? "Saving..." : "New host"}
        </button>
        <button className="ghost-button small" onClick={onReconnect} disabled={isReconnectingSession}>
          {isReconnectingSession ? "Reconnecting..." : "Reconnect"}
        </button>
        <button className="ghost-button small" onClick={onDisconnect} disabled={isDisconnectingSession}>
          {isDisconnectingSession ? "Disconnecting..." : "Disconnect"}
        </button>
        <button className="primary-button small" onClick={onConnect} disabled={isConnectingSession}>
          {isConnectingSession ? "Connecting..." : "Connect"}
        </button>
      </div>
    </header>
  );
}
