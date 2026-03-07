import type { Host } from "@talon/core";
import type { ConnectionAuthMethod, HostConnectionConfig, SavedHostFormState } from "../types/app";
import { useState } from "react";

type ManageHostsDialogProps = {
  hosts: Host[];
  selectedHost: Host | null;
  selectedHostConfig: HostConnectionConfig | null;
  savedHostForm: SavedHostFormState;
  isSavingHostConfig: boolean;
  isDeletingHostConfig: boolean;
  isLoadingPassword: boolean;
  onSelectHost: (hostId: string) => void;
  onSetSavedHostForm: (updater: (current: SavedHostFormState) => SavedHostFormState) => void;
  onSaveHost: () => void;
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
  isLoadingPassword,
  onSelectHost,
  onSetSavedHostForm,
  onSaveHost,
  onDeleteSelectedHost,
  onClose,
}: ManageHostsDialogProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  async function copyPassword() {
    if (!savedHostForm.savedPassword) return;
    await navigator.clipboard.writeText(savedHostForm.savedPassword);
  }

  return (
    <div className="dialog-backdrop dialog-backdrop-soft" role="presentation" onClick={onClose}>
      <section className="dialog-card manage-hosts-dialog manage-hosts-dialog-compact" role="dialog" aria-modal="true" aria-labelledby="manage-hosts-title" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header dialog-header-compact">
          <div>
            <p className="panel-kicker">Hosts</p>
            <h2 id="manage-hosts-title">Edit host</h2>
          </div>
          <button className="ghost-button small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="manage-hosts-layout manage-hosts-layout-compact">
          <aside className="manage-hosts-list manage-hosts-list-compact">
            {hosts.map((host) => (
              <button
                key={host.id}
                className={`manage-host-item manage-host-item-compact ${selectedHost?.id === host.id ? "active" : ""}`}
                onClick={() => onSelectHost(host.id)}
              >
                <strong>{host.config.label}</strong>
                <span>{host.config.address}</span>
              </button>
            ))}
          </aside>

          <div className="manage-hosts-editor manage-hosts-editor-compact">
            {selectedHost ? (
              <>
                <div className="manage-hosts-summary manage-hosts-summary-compact">
                  <p className="panel-kicker">Selected</p>
                  <h3>{selectedHost.config.label}</h3>
                  <p>{selectedHost.config.address}</p>
                </div>

                <div className="connection-form compact-form dialog-form manage-hosts-form-compact">
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
                    <span>Password</span>
                    <div className="password-field-row">
                      <input
                        type={isPasswordVisible ? "text" : "password"}
                        value={savedHostForm.savedPassword}
                        onChange={(event) => onSetSavedHostForm((current) => ({ ...current, savedPassword: event.target.value }))}
                        placeholder={isLoadingPassword ? "Loading saved password..." : selectedHostConfig?.hasSavedPassword ? "Saved password loaded" : "Leave blank to remove password"}
                      />
                      <button className="ghost-button small" onClick={() => setIsPasswordVisible((current) => !current)} type="button">
                        {isPasswordVisible ? "Hide" : "Show"}
                      </button>
                      <button className="ghost-button small" onClick={() => void copyPassword()} type="button" disabled={!savedHostForm.savedPassword}>
                        Copy
                      </button>
                    </div>
                  </label>
                </div>

                <div className="dialog-actions manage-host-actions manage-host-actions-compact">
                  <button className="ghost-button small" onClick={onSaveHost} disabled={isSavingHostConfig || isLoadingPassword}>
                    {isSavingHostConfig ? "Saving..." : "Save"}
                  </button>
                  <button className="ghost-button small destructive" onClick={onDeleteSelectedHost} disabled={isDeletingHostConfig}>
                    {isDeletingHostConfig ? "Deleting..." : "Delete"}
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
