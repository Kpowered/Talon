import type { Session } from "@talon/core";

type TopBarProps = {
  selectedHostLabel: string;
  selectedHostAddress: string;
  sessionState: Session["state"];
  currentPath: string;
  isConnected: boolean;
  isConnectingSession: boolean;
  isDisconnectingSession: boolean;
  isReconnectingSession: boolean;
  isBusy: boolean;
  activeCommandLabel: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onManageHosts: () => void;
};

export function TopBar({
  selectedHostLabel,
  selectedHostAddress,
  sessionState,
  currentPath,
  isConnected,
  isConnectingSession,
  isDisconnectingSession,
  isReconnectingSession,
  isBusy,
  activeCommandLabel,
  onConnect,
  onDisconnect,
  onReconnect,
  onManageHosts,
}: TopBarProps) {
  const connectionLabel = isConnectingSession
    ? "connecting"
    : isDisconnectingSession
      ? "disconnecting"
      : sessionState;

  return (
    <header className="workspace-topbar">
      <div className="workspace-topbar-primary">
        <div className="workspace-topbar-copy">
          <p className="workspace-topbar-kicker">Terminal</p>
          <h1>{selectedHostLabel}</h1>
          <span className="workspace-topbar-address">{selectedHostAddress}</span>
        </div>
        <div className="workspace-topbar-statusline">
          <span className={`workspace-status-pill tone-${sessionState}`}>{connectionLabel}</span>
          <span className="workspace-status-pill">{currentPath}</span>
          {isBusy ? <span className="workspace-status-pill tone-busy">command in flight</span> : null}
          {activeCommandLabel ? <span className="workspace-status-pill truncate">{activeCommandLabel}</span> : null}
        </div>
      </div>

      <div className="workspace-topbar-actions">
        <button className="ghost-button small" onClick={onManageHosts}>
          Hosts
        </button>
        {isConnected ? (
          <>
            <button className="ghost-button small" onClick={onReconnect} disabled={isReconnectingSession || isConnectingSession || isDisconnectingSession}>
              {isReconnectingSession ? "Reconnecting..." : "Reconnect"}
            </button>
            <button className="ghost-button small" onClick={onDisconnect} disabled={isDisconnectingSession}>
              {isDisconnectingSession ? "Disconnecting..." : "Disconnect"}
            </button>
          </>
        ) : (
          <button className="primary-button small" onClick={onConnect} disabled={isConnectingSession}>
            {isConnectingSession ? "Connecting..." : "Connect"}
          </button>
        )}
      </div>
    </header>
  );
}
