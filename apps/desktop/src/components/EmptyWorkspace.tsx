import type { MouseEventHandler } from "react";

type EmptyWorkspaceProps = {
  onCreateHost: MouseEventHandler<HTMLButtonElement>;
  onManageHosts: MouseEventHandler<HTMLButtonElement>;
};

export function EmptyWorkspace({ onCreateHost, onManageHosts }: EmptyWorkspaceProps) {
  return (
    <main className="app-shell app-shell-terminal-first empty-workspace-shell">
      <section className="empty-workspace-panel panel compact-panel">
        <p className="panel-kicker">Talon</p>
        <h2>Ready for a new SSH session</h2>
        <p>
          Create a host or open Manage to edit saved connection details before connecting.
        </p>
        <div className="empty-workspace-actions">
          <button className="primary-button" onClick={onCreateHost}>
            New Host
          </button>
          <button className="ghost-button" onClick={onManageHosts}>
            Manage Hosts
          </button>
        </div>
      </section>
    </main>
  );
}
