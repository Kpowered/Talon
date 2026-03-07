import { useEffect, useState } from "react";
import type { Host } from "@talon/core";
import type { SessionConnectionIssue } from "../types/app";

type HostRailProps = {
  hosts: Host[];
  selectedHost: Host;
  activeConnectionIssue: SessionConnectionIssue | null;
  onSelectHost: (hostId: string) => void;
  onCreateHost: () => void;
  onManageHosts: () => void;
  onConnectHost: (hostId: string) => void;
  onEditHost: (hostId: string) => void;
  onDeleteHost: (hostId: string) => void;
};

type HostContextMenuState = {
  hostId: string;
  x: number;
  y: number;
};

export function HostRail({
  hosts,
  selectedHost,
  activeConnectionIssue,
  onSelectHost,
  onCreateHost,
  onManageHosts,
  onConnectHost,
  onEditHost,
  onDeleteHost,
}: HostRailProps) {
  const [contextMenu, setContextMenu] = useState<HostContextMenuState | null>(null);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeMenu = () => setContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  const runContextAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  return (
    <aside className="sidebar-shell sidebar-shell-nav sidebar-shell-ultralight">
      <div className="sidebar-brand sidebar-brand-compact">
        <div className="sidebar-brand-mark">T</div>
        <strong>Talon</strong>
      </div>

      <div className="sidebar-section sidebar-actions sidebar-actions-compact">
        <button className="sidebar-primary-action" onClick={onCreateHost}>
          New Host
        </button>
        <button className="sidebar-ghost-action" onClick={onManageHosts}>
          Manage
        </button>
      </div>

      <div className="sidebar-section sidebar-list-section sidebar-list-section-nav">
        <div className="sidebar-section-header sidebar-section-header-quiet">
          <span>Hosts</span>
          <span>{hosts.length}</span>
        </div>
        <div className="sidebar-host-list sidebar-host-list-nav">
          {hosts.map((host) => {
            const selected = host.id === selectedHost.id;
            return (
              <button
                key={host.id}
                className={`sidebar-host-row ${selected ? "selected" : ""}`}
                onClick={() => onSelectHost(host.id)}
                onDoubleClick={() => onConnectHost(host.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectHost(host.id);
                  setContextMenu({ hostId: host.id, x: event.clientX, y: event.clientY });
                }}
              >
                <span className={`sidebar-host-dot tone-${host.observed.status}`} />
                <div className="sidebar-host-row-copy">
                  <strong>{host.config.label}</strong>
                  <span>{host.config.address}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {activeConnectionIssue ? <div className="sidebar-inline-issue">{activeConnectionIssue.title}</div> : null}

      {contextMenu ? (
        <div className="host-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => runContextAction(() => onConnectHost(contextMenu.hostId))}>Connect</button>
          <button onClick={() => runContextAction(() => onEditHost(contextMenu.hostId))}>Edit</button>
          <button className="destructive" onClick={() => runContextAction(() => onDeleteHost(contextMenu.hostId))}>Delete</button>
        </div>
      ) : null}
    </aside>
  );
}
