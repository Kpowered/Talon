type TopBarProps = {
  selectedHostLabel: string;
  selectedHostAddress: string;
  isConnected: boolean;
  isConnectingSession: boolean;
  isDisconnectingSession: boolean;
  isReconnectingSession: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onManageHosts: () => void;
};

export function TopBar({
  selectedHostLabel,
  selectedHostAddress,
  isConnected,
  isConnectingSession,
  isDisconnectingSession,
  isReconnectingSession,
  onConnect,
  onDisconnect,
  onReconnect,
  onManageHosts,
}: TopBarProps) {
  return (
    <header className="workspace-topbar workspace-topbar-minimal">
      <div className="workspace-topbar-primary">
        <div className="workspace-topbar-copy">
          <p className="workspace-topbar-kicker">Terminal</p>
          <h1>{selectedHostLabel}</h1>
          <span className="workspace-topbar-address">{selectedHostAddress}</span>
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


