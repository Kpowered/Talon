import type { Host } from "@talon/core";
import type { ConnectionAuthMethod, HostConnectionConfig, SavedHostFormState } from "../types/app";

type ManageHostsDialogProps = {
  hosts: Host[];
  selectedHost: Host | null;
  selectedHostConfig: HostConnectionConfig | null;
  savedHostForm: SavedHostFormState;
  isSavingHostConfig: boolean;
  isDeletingHostConfig: boolean;
  onSelectHost: (hostId: string) => void;
  onSetSavedHostForm: (updater: (current: SavedHostFormState) => SavedHostFormState) => void;
  onSaveSavedHostPassword: () => void;
  onClearSavedHostPassword: () => void;
  onUpdateSelectedHost: () => void;
  onDeleteSelectedHost: () => void;
  onClose: () => void;
};

export function ManageHostsDialog({
  hosts,
  selectedHost,
  selectedHostConfig,
  savedHostForm,
  isSavingHostConfig,
  isDeletingHostConfig,
  onSelectHost,
  onSetSavedHostForm,
  onSaveSavedHostPassword,
  onClearSavedHostPassword,
  onUpdateSelectedHost,
  onDeleteSelectedHost,
  onClose,
}: ManageHostsDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-card manage-hosts-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-hosts-title">
        <div className="dialog-header">
          <div>
            <p className="panel-kicker">Hosts</p>
            <h2 id="manage-hosts-title">Manage saved hosts</h2>
          </div>
          <button className="ghost-button small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="manage-hosts-layout">
          <aside className="manage-hosts-list">
            {hosts.map((host) => (
              <button
                key={host.id}
                className={`manage-host-item ${selectedHost?.id === host.id ? "active" : ""}`}
                onClick={() => onSelectHost(host.id)}
              >
                <strong>{host.config.label}</strong>
                <span>{host.config.address}</span>
              </button>
            ))}
          </aside>

          <div className="manage-hosts-editor">
            {selectedHost ? (
              <>
                <div className="manage-hosts-summary">
                  <p className="panel-kicker">Selected host</p>
                  <h3>{selectedHost.config.label}</h3>
                  <p>{selectedHost.config.address}</p>
                </div>

                <div className="connection-form compact-form dialog-form">
                  <label className="connection-field">
                    <span>Label</span>
                    <input value={savedHostForm.label} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, label: event.target.value }))} />
                  </label>
                  <label className="connection-field">
                    <span>Address</span>
                    <input value={savedHostForm.address} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, address: event.target.value }))} />
                  </label>
                  <div className="connection-grid">
                    <label className="connection-field">
                      <span>Port</span>
                      <input value={savedHostForm.port} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, port: event.target.value }))} inputMode="numeric" />
                    </label>
                    <label className="connection-field">
                      <span>User</span>
                      <input value={savedHostForm.username} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, username: event.target.value }))} />
                    </label>
                  </div>
                  <div className="connection-grid">
                    <label className="connection-field">
                      <span>Region</span>
                      <input value={savedHostForm.region} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, region: event.target.value }))} />
                    </label>
                    <label className="connection-field">
                      <span>Tags</span>
                      <input value={savedHostForm.tags} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, tags: event.target.value }))} placeholder="production, hk" />
                    </label>
                  </div>
                  <label className="connection-field">
                    <span>Auth</span>
                    <select
                      value={savedHostForm.authMethod}
                      onChange={(event) => onSetSavedHostForm((current) => ({ ...current, authMethod: event.target.value as ConnectionAuthMethod }))}
                    >
                      <option value="agent">agent</option>
                      <option value="private-key">private-key</option>
                      <option value="password">password</option>
                    </select>
                  </label>
                  <label className="connection-field">
                    <span>Fingerprint hint</span>
                    <input
                      value={savedHostForm.fingerprintHint}
                      onChange={(event) => onSetSavedHostForm((current) => ({ ...current, fingerprintHint: event.target.value }))}
                      placeholder="SHA256:... or Pending trust"
                    />
                  </label>
                  <label className="connection-field">
                    <span>Private key path</span>
                    <input
                      value={savedHostForm.privateKeyPath}
                      onChange={(event) => onSetSavedHostForm((current) => ({ ...current, privateKeyPath: event.target.value }))}
                      placeholder="C:\\Users\\...\\.ssh\\id_ed25519"
                    />
                  </label>
                  <label className="connection-field">
                    <span>Saved password</span>
                    <input
                      type="password"
                      value={savedHostForm.savedPassword}
                      onChange={(event) => onSetSavedHostForm((current) => ({ ...current, savedPassword: event.target.value }))}
                      placeholder={selectedHostConfig?.hasSavedPassword ? "Password saved in system keychain" : "Store password in system keychain"}
                    />
                  </label>
                </div>

                <div className="dialog-actions manage-host-actions">
                  <button className="ghost-button small" onClick={onSaveSavedHostPassword} disabled={!savedHostForm.savedPassword.trim()}>
                    Save password
                  </button>
                  <button className="ghost-button small" onClick={onClearSavedHostPassword} disabled={!selectedHostConfig?.hasSavedPassword}>
                    Clear password
                  </button>
                  <button className="ghost-button small" onClick={onUpdateSelectedHost} disabled={isSavingHostConfig}>
                    {isSavingHostConfig ? "Saving..." : "Save host"}
                  </button>
                  <button className="ghost-button small destructive" onClick={onDeleteSelectedHost} disabled={isDeletingHostConfig}>
                    {isDeletingHostConfig ? "Deleting..." : "Delete host"}
                  </button>
                </div>
              </>
            ) : (
              <p className="empty-copy">No saved host selected.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
