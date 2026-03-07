type TopBarProps = {
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
    <header className="workspace-topbar workspace-topbar-thin">
      <div className="workspace-topbar-spacer" />
      <div className="workspace-topbar-actions workspace-topbar-actions-thin">
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
