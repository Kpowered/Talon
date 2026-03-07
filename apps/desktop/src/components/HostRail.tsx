import type { Host } from "@talon/core";
import { formatTime, statusLabel } from "../lib/formatters";
import type {
  AgentFormState,
  AgentSettings,
  HostConnectionConfig,
  SavedHostFormState,
  SessionConnectionIssue,
  SessionOverrideFormState,
} from "../types/app";

type HostRailProps = {
  hosts: Host[];
  selectedHost: Host;
  selectedHostConfig: HostConnectionConfig | null;
  agentSettings: AgentSettings | null;
  agentForm: AgentFormState;
  savedHostForm: SavedHostFormState;
  sessionOverride: SessionOverrideFormState;
  activeConnectionIssue: SessionConnectionIssue | null;
  isSavedConfigExpanded: boolean;
  isSessionOverrideExpanded: boolean;
  isSavingHostConfig: boolean;
  isDeletingHostConfig: boolean;
  onSelectHost: (hostId: string) => void;
  onSetAgentForm: (updater: (current: AgentFormState) => AgentFormState) => void;
  onSaveAgentConfiguration: () => void;
  onSaveAgentApiKey: () => void;
  onClearAgentApiKey: () => void;
  onToggleSavedConfig: () => void;
  onSetSavedHostForm: (updater: (current: SavedHostFormState) => SavedHostFormState) => void;
  onSaveSavedHostPassword: () => void;
  onClearSavedHostPassword: () => void;
  onUpdateSelectedHost: () => void;
  onDeleteSelectedHost: () => void;
  onToggleSessionOverride: () => void;
  onSetSessionOverride: (updater: (current: SessionOverrideFormState) => SessionOverrideFormState) => void;
  onResetConnectionOverride: () => void;
  onPrepareHostTrustFlow: () => void;
  onConfirmHostTrustFlow: () => void;
  onManageHosts: () => void;
};

export function HostRail({
  hosts,
  selectedHost,
  selectedHostConfig,
  activeConnectionIssue,
  isDeletingHostConfig,
  onSelectHost,
  onDeleteSelectedHost,
  onPrepareHostTrustFlow,
  onConfirmHostTrustFlow,
  onManageHosts,
}: HostRailProps) {
  return (
    <aside className="panel panel-hosts compact-panel host-rail host-rail-minimal">
      <div className="panel-header compact-panel-header host-rail-header">
        <div>
          <p className="panel-kicker">Hosts</p>
          <h2>Live session</h2>
        </div>
        <button className="ghost-button small" onClick={onManageHosts}>
          Manage
        </button>
      </div>

      <div className="host-list compact-host-list host-list-minimal">
        {hosts.map((host) => (
          <button key={host.id} className={`host-card compact-host-card ${host.id === selectedHost.id ? "selected" : ""}`} onClick={() => onSelectHost(host.id)}>
            <div className="host-card-top">
              <div>
                <strong>{host.config.label}</strong>
                <p>{host.config.address}</p>
              </div>
              <span className={`status-badge status-${host.observed.status}`}>{statusLabel(host.observed.status)}</span>
            </div>
            <div className="host-details">
              <span>{selectedHost.id === host.id ? "active" : host.config.region}</span>
              <span>{host.observed.latencyMs}ms</span>
            </div>
          </button>
        ))}
      </div>

      <div className="section-block compact-summary-block rail-summary-block">
        <div className="section-title-row compact-section-title">
          <div>
            <p className="panel-kicker">Selected host</p>
            <h2>{selectedHost.config.label}</h2>
          </div>
          <span className={`status-badge status-${selectedHost.observed.status}`}>{statusLabel(selectedHost.observed.status)}</span>
        </div>
        <div className="session-facts compact-facts rail-facts">
          <span>{selectedHost.config.address}</span>
          <span>{selectedHostConfig?.username ?? "unknown user"}</span>
          <span>port {selectedHostConfig?.port ?? 22}</span>
          <span>{selectedHostConfig?.authMethod ?? "agent"}</span>
          <span>last {formatTime(selectedHost.observed.lastSeenAt)}</span>
        </div>
      </div>

      {activeConnectionIssue ? (
        <div className={`connection-issue issue-${activeConnectionIssue.kind}`}>
          <strong>{activeConnectionIssue.title}</strong>
          <p>{activeConnectionIssue.summary}</p>
          <span>{activeConnectionIssue.operatorAction}</span>
          <code>{activeConnectionIssue.suggestedCommand}</code>
          {activeConnectionIssue.kind === "host-trust" ? (
            <div className="host-config-actions">
              <button className="ghost-button small" onClick={onPrepareHostTrustFlow}>
                Scan fingerprint
              </button>
              <button className="primary-button small" onClick={onConfirmHostTrustFlow} disabled={!activeConnectionIssue.fingerprint}>
                Trust host
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rail-actions">
        <button className="ghost-button small" onClick={onManageHosts}>
          Edit host details
        </button>
        <button className="ghost-button small destructive" onClick={onDeleteSelectedHost} disabled={isDeletingHostConfig}>
          {isDeletingHostConfig ? "Deleting..." : "Delete host"}
        </button>
      </div>
    </aside>
  );
}
