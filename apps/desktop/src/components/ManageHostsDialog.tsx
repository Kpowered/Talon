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
  initialEditorOpen: boolean;
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
  initialEditorOpen,
  onSelectHost,
  onSetSavedHostForm,
  onSaveHost,
  onDeleteSelectedHost,
  onClose,
}: ManageHostsDialogProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(initialEditorOpen);

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
    <div className="manage-hosts-popover-shell" role="presentation" onClick={onClose}>
      <section
        className="manage-hosts-popover manage-hosts-list-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-hosts-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="manage-hosts-popover-header compact">
          <h2 id="manage-hosts-title">Hosts</h2>
          <button className="ghost-button small" onClick={onClose} type="button">
            x
          </button>
        </div>

        <label className="manage-hosts-search compact">
          <input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Search hosts" />
        </label>

        <div className="manage-hosts-list manage-hosts-list-popover-body compact">
          {filteredHosts.map((host) => (
            <button
              key={host.id}
              className={`manage-host-item manage-host-item-drawer compact ${selectedHost?.id === host.id ? "active" : ""}`}
              onClick={() => onSelectHost(host.id)}
              type="button"
            >
              <strong>{host.config.label}</strong>
              <span>{host.config.address}</span>
            </button>
          ))}
          {filteredHosts.length === 0 ? <p className="empty-copy">No hosts match.</p> : null}
        </div>

        {selectedHost ? (
          <div className="manage-hosts-popover-footer compact">
            <button className="ghost-button small" onClick={() => setIsEditorOpen((current) => !current)} type="button">
              {isEditorOpen ? "Hide" : "Edit"}
            </button>
          </div>
        ) : null}
      </section>

      {isEditorOpen && selectedHost ? (
        <section
          className="manage-hosts-popover manage-hosts-editor-popover compact"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${selectedHost.config.label}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="manage-hosts-popover-header compact editor">
            <div className="manage-hosts-editor-title">
              <strong>{selectedHost.config.label}</strong>
              <span>{selectedHost.config.address}</span>
            </div>
            <button className="ghost-button small" onClick={() => setIsEditorOpen(false)} type="button">
              x
            </button>
          </div>

          <div className="manage-hosts-editor-grid">
            <label className="connection-field compact-field span-2">
              <span>Label</span>
              <input value={savedHostForm.label} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label className="connection-field compact-field span-2">
              <span>Address</span>
              <input value={savedHostForm.address} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, address: event.target.value }))} />
            </label>
            <label className="connection-field compact-field">
              <span>Port</span>
              <input value={savedHostForm.port} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, port: event.target.value }))} inputMode="numeric" />
            </label>
            <label className="connection-field compact-field">
              <span>User</span>
              <input value={savedHostForm.username} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, username: event.target.value }))} />
            </label>
            <label className="connection-field compact-field">
              <span>Region</span>
              <input value={savedHostForm.region} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, region: event.target.value }))} />
            </label>
            <label className="connection-field compact-field">
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
            <label className="connection-field compact-field span-2">
              <span>Tags</span>
              <input value={savedHostForm.tags} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, tags: event.target.value }))} placeholder="production, hk" />
            </label>
            <label className="connection-field compact-field span-2">
              <span>Fingerprint</span>
              <input
                value={savedHostForm.fingerprintHint}
                onChange={(event) => onSetSavedHostForm((current) => ({ ...current, fingerprintHint: event.target.value }))}
                placeholder="Pending trust"
              />
            </label>
            <label className="connection-field compact-field span-2">
              <span>Private key</span>
              <input
                value={savedHostForm.privateKeyPath}
                onChange={(event) => onSetSavedHostForm((current) => ({ ...current, privateKeyPath: event.target.value }))}
                placeholder="C:\\Users\\...\\.ssh\\id_ed25519"
              />
            </label>
            <label className="connection-field compact-field span-2">
              <span>Password</span>
              <div className="password-field-row compact">
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

          <div className="dialog-actions manage-host-actions manage-host-actions-drawer compact">
            <button className="ghost-button small" onClick={onSaveHost} disabled={isSavingHostConfig || isLoadingPassword} type="button">
              {isSavingHostConfig ? "Saving..." : "Save"}
            </button>
            <button className="ghost-button small destructive" onClick={onDeleteSelectedHost} disabled={isDeletingHostConfig} type="button">
              {isDeletingHostConfig ? "Deleting..." : "Delete"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
