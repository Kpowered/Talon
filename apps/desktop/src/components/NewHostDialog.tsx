import type { NewHostDraft } from "../types/app";

type NewHostDialogProps = {
  draft: NewHostDraft;
  errorMessage: string | null;
  isSaving: boolean;
  isConnecting: boolean;
  onChange: (updater: (current: NewHostDraft) => NewHostDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  onConnect: () => void;
};

export function NewHostDialog({ draft, errorMessage, isSaving, isConnecting, onChange, onCancel, onSave, onConnect }: NewHostDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-card new-host-dialog" role="dialog" aria-modal="true" aria-labelledby="new-host-title">
        <div className="dialog-header">
          <div>
            <p className="panel-kicker">New host</p>
            <h2 id="new-host-title">Create SSH target</h2>
          </div>
          <button className="ghost-button small" onClick={onCancel} disabled={isSaving || isConnecting}>
            Cancel
          </button>
        </div>

        {errorMessage ? <div className="dialog-error" role="alert">{errorMessage}</div> : null}

        <div className="connection-form compact-form dialog-form">
          <label className="connection-field">
            <span>Name</span>
            <input value={draft.label} onChange={(event) => onChange((current) => ({ ...current, label: event.target.value }))} placeholder="prod-web-1" />
          </label>
          <label className="connection-field">
            <span>Address</span>
            <input value={draft.address} onChange={(event) => onChange((current) => ({ ...current, address: event.target.value }))} placeholder="103.97.200.241" />
          </label>
          <div className="connection-grid">
            <label className="connection-field">
              <span>Port</span>
              <input value={draft.port} onChange={(event) => onChange((current) => ({ ...current, port: event.target.value }))} inputMode="numeric" placeholder="22" />
            </label>
            <label className="connection-field">
              <span>User</span>
              <input value={draft.username} onChange={(event) => onChange((current) => ({ ...current, username: event.target.value }))} placeholder="root" />
            </label>
          </div>
          <label className="connection-field">
            <span>Auth</span>
            <select value={draft.authMethod} onChange={(event) => onChange((current) => ({ ...current, authMethod: event.target.value as NewHostDraft["authMethod"] }))}>
              <option value="agent">agent</option>
              <option value="private-key">private-key</option>
              <option value="password">password</option>
            </select>
          </label>
          {draft.authMethod === "password" ? (
            <label className="connection-field">
              <span>Password</span>
              <input
                type="password"
                value={draft.password}
                onChange={(event) => onChange((current) => ({ ...current, password: event.target.value }))}
                placeholder="Enter password for this connection"
              />
            </label>
          ) : null}
        </div>

        <p className="section-note dialog-note">Save stores the host defaults. Connect saves the host first, then immediately opens a real SSH session with the same values.</p>

        <div className="dialog-actions">
          <button className="ghost-button small" onClick={onSave} disabled={isSaving || isConnecting}>
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button className="primary-button small" onClick={onConnect} disabled={isSaving || isConnecting}>
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </section>
    </div>
  );
}
