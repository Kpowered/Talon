import type { Host } from "@talon/core";
import type { ConnectionAuthMethod, HostConnectionConfig, SavedHostFormState } from "../types/app";
import { useMemo, useState } from "react";

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
  const [searchValue, setSearchValue] = useState("");

  const filteredHosts = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return hosts;
    }
    return hosts.filter((host) => {
      const haystack = [host.config.label, host.config.address, host.config.region, ...(host.config.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [hosts, searchValue]);

  async function copyPassword() {
    if (!savedHostForm.savedPassword) return;
    await navigator.clipboard.writeText(savedHostForm.savedPassword);
  }

  return (
    <div className="manage-hosts-drawer-shell" role="presentation" onClick={onClose}>
      <section className="manage-hosts-drawer" role="dialog" aria-modal="true" aria-labelledby="manage-hosts-title" onClick={(event) => event.stopPropagation()}>
        <div className="manage-hosts-drawer-sidebar">
          <div className="manage-hosts-drawer-header">
            <div>
              <p className="panel-kicker">Hosts</p>
              <h2 id="manage-hosts-title">Manage hosts</h2>
            </div>
            <button className="ghost-button small" onClick={onClose}>
              Close
            </button>
          </div>

          <label className="manage-hosts-search">
            <span>Search</span>
            <input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="name, address, tag" />
          </label>

          <div className="manage-hosts-list manage-hosts-list-drawer">
            {filteredHosts.map((host) => (
              <button
                key={host.id}
                className={`manage-host-item manage-host-item-drawer ${selectedHost?.id === host.id ? "active" : ""}`}
                onClick={() => onSelectHost(host.id)}
              >
                <strong>{host.config.label}</strong>
                <span>{host.config.address}</span>
              </button>
            ))}
            {filteredHosts.length === 0 ? <p className="empty-copy">No hosts match this search.</p> : null}
          </div>
        </div>

        <div className="manage-hosts-drawer-editor">
          {selectedHost ? (
            <>
              <div className="manage-hosts-summary manage-hosts-summary-drawer">
                <p className="panel-kicker">Editing</p>
                <h3>{selectedHost.config.label}</h3>
                <p>{selectedHost.config.address}</p>
              </div>

              <div className="connection-form compact-form dialog-form manage-hosts-form-drawer">
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

              <div className="dialog-actions manage-host-actions manage-host-actions-drawer">
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
      </section>
    </div>
  );
}
