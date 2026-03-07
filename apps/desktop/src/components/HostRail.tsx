import type { Host } from "@talon/core";
import type { HostConnectionConfig, SessionConnectionIssue } from "../types/app";
import { formatTime, statusLabel } from "../lib/formatters";

type HostRailProps = {
  hosts: Host[];
  selectedHost: Host;
  selectedHostConfig: HostConnectionConfig | null;
  activeConnectionIssue: SessionConnectionIssue | null;
  isDeletingHostConfig: boolean;
  onSelectHost: (hostId: string) => void;
  onCreateHost: () => void;
  onManageHosts: () => void;
  onDeleteSelectedHost: () => void;
};

export function HostRail({
  hosts,
  selectedHost,
  selectedHostConfig,
  activeConnectionIssue,
  isDeletingHostConfig,
  onSelectHost,
  onCreateHost,
  onManageHosts,
  onDeleteSelectedHost,
}: HostRailProps) {
  return (
    <aside className="sidebar-shell">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">T</div>
        <div>
          <strong>Talon</strong>
          <span>SSH workspace</span>
        </div>
      </div>

      <div className="sidebar-section sidebar-actions">
        <button className="sidebar-primary-action" onClick={onCreateHost}>
          New Host
        </button>
        <button className="sidebar-ghost-action" onClick={onManageHosts}>
          Manage Hosts
        </button>
      </div>

      <div className="sidebar-section sidebar-list-section">
        <div className="sidebar-section-header">
          <span>Hosts</span>
          <span>{hosts.length}</span>
        </div>
        <div className="sidebar-host-list">
          {hosts.map((host) => {
            const selected = host.id === selectedHost.id;
            return (
              <button key={host.id} className={`sidebar-host-item ${selected ? "selected" : ""}`} onClick={() => onSelectHost(host.id)}>
                <div className="sidebar-host-item-main">
                  <span className={`sidebar-host-dot tone-${host.observed.status}`} />
                  <div className="sidebar-host-copy">
                    <strong>{host.config.label}</strong>
                    <span>{host.config.address}</span>
                  </div>
                </div>
                <span className="sidebar-host-meta">{selected ? "active" : statusLabel(host.observed.status)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-section sidebar-selected-host">
        <div className="sidebar-section-header">
          <span>Selected</span>
          <span>{statusLabel(selectedHost.observed.status)}</span>
        </div>
        <div className="sidebar-selected-copy">
          <strong>{selectedHost.config.label}</strong>
          <span>{selectedHost.config.address}</span>
          <span>{selectedHostConfig?.username ?? "root"} ¡¤ port {selectedHostConfig?.port ?? 22}</span>
          <span>{selectedHost.observed.lastSeenAt ? `last ${formatTime(selectedHost.observed.lastSeenAt)}` : "never seen"}</span>
        </div>
      </div>

      {activeConnectionIssue ? (
        <div className="sidebar-section sidebar-issue-card">
          <strong>{activeConnectionIssue.title}</strong>
          <p>{activeConnectionIssue.summary}</p>
        </div>
      ) : null}

      <div className="sidebar-section sidebar-footer-actions">
        <button className="sidebar-ghost-action" onClick={onManageHosts}>
          Settings
        </button>
        <button className="sidebar-ghost-action destructive" onClick={onDeleteSelectedHost} disabled={isDeletingHostConfig}>
          {isDeletingHostConfig ? "Deleting..." : "Delete Host"}
        </button>
      </div>
    </aside>
  );
}
