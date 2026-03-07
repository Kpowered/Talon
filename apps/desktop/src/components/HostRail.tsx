import type { Host } from "@talon/core";
import { formatTime, statusLabel } from "../lib/formatters";
import type {
  AgentFormState,
  AgentSettings,
  ConnectionAuthMethod,
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
};

export function HostRail({
  hosts,
  selectedHost,
  selectedHostConfig,
  agentSettings,
  agentForm,
  savedHostForm,
  sessionOverride,
  activeConnectionIssue,
  isSavedConfigExpanded,
  isSessionOverrideExpanded,
  isSavingHostConfig,
  isDeletingHostConfig,
  onSelectHost,
  onSetAgentForm,
  onSaveAgentConfiguration,
  onSaveAgentApiKey,
  onClearAgentApiKey,
  onToggleSavedConfig,
  onSetSavedHostForm,
  onSaveSavedHostPassword,
  onClearSavedHostPassword,
  onUpdateSelectedHost,
  onDeleteSelectedHost,
  onToggleSessionOverride,
  onSetSessionOverride,
  onResetConnectionOverride,
  onPrepareHostTrustFlow,
  onConfirmHostTrustFlow,
}: HostRailProps) {
  return (
    <aside className="panel panel-hosts compact-panel host-rail">
      <div className="panel-header compact-panel-header">
        <div>
          <p className="panel-kicker">Hosts</p>
          <h2>Inventory</h2>
        </div>
        <span className="pill">{hosts.length}</span>
      </div>

      <div className="search-box compact-search-box">
        <span>Selected</span>
        <input value={selectedHost.config.label} readOnly aria-label="Selected host" />
      </div>

      <div className="host-list compact-host-list">
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
              <span>{host.config.region}</span>
              <span>{host.observed.latencyMs}ms</span>
              <span>last {formatTime(host.observed.lastSeenAt)}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="section-block compact-summary-block">
        <div className="section-title-row compact-section-title">
          <div>
            <p className="panel-kicker">Selected host</p>
            <h2>{selectedHost.config.label}</h2>
          </div>
          <span className={`status-badge status-${selectedHost.observed.status}`}>{statusLabel(selectedHost.observed.status)}</span>
        </div>
        <div className="session-facts compact-facts">
          <span>{selectedHost.config.address}</span>
          <span>{selectedHostConfig?.username ?? "unknown"}</span>
          <span>port {selectedHostConfig?.port ?? 22}</span>
          <span>{selectedHostConfig?.authMethod ?? "agent"}</span>
        </div>
      </div>

      <div className="section-block compact-section-block">
        <div className="section-title-row compact-section-title">
          <div>
            <p className="panel-kicker">AI provider</p>
            <h2>Diagnosis settings</h2>
          </div>
          <span className="pill subtle">{agentSettings?.hasApiKey ? "API key saved" : "No API key"}</span>
        </div>
        <div className="connection-form compact-form">
          <label className="connection-field">
            <span>Base URL</span>
            <input value={agentForm.baseUrl} onChange={(event) => onSetAgentForm((current) => ({ ...current, baseUrl: event.target.value }))} />
          </label>
          <label className="connection-field">
            <span>Model</span>
            <input value={agentForm.model} onChange={(event) => onSetAgentForm((current) => ({ ...current, model: event.target.value }))} />
          </label>
          <label className="connection-field">
            <span>API key</span>
            <input
              type="password"
              value={agentForm.apiKey}
              onChange={(event) => onSetAgentForm((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder={agentSettings?.hasApiKey ? "Stored in system keychain" : "Paste API key"}
            />
          </label>
          <label className="connection-field checkbox-field">
            <span>Auto diagnose</span>
            <input
              type="checkbox"
              checked={agentForm.autoDiagnose}
              onChange={(event) => onSetAgentForm((current) => ({ ...current, autoDiagnose: event.target.checked }))}
            />
          </label>
          <div className="host-config-actions">
            <button className="ghost-button small" onClick={onSaveAgentConfiguration}>
              Save settings
            </button>
            <button className="ghost-button small" onClick={onSaveAgentApiKey} disabled={!agentForm.apiKey.trim()}>
              Save API key
            </button>
            <button className="ghost-button small" onClick={onClearAgentApiKey} disabled={!agentSettings?.hasApiKey}>
              Clear API key
            </button>
          </div>
        </div>
      </div>

      <div className="section-block collapsible-block">
        <button className="section-toggle" onClick={onToggleSavedConfig}>
          <div>
            <p className="panel-kicker">Saved host config</p>
            <h2>Persistent defaults</h2>
          </div>
          <span className="pill subtle">{isSavedConfigExpanded ? "Hide" : "Edit"}</span>
        </button>
        <div className="session-facts compact-facts">
          <span>{selectedHostConfig?.username ?? "unknown"}</span>
          <span>port {selectedHostConfig?.port ?? 0}</span>
          <span>{selectedHostConfig?.fingerprintHint ?? "no fingerprint"}</span>
        </div>
        {isSavedConfigExpanded ? (
          <>
            <p className="section-note">These values are saved locally for this host and become the default connection baseline.</p>
            <div className="connection-form compact-form">
              <label className="connection-field">
                <span>Label</span>
                <input value={savedHostForm.label} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, label: event.target.value }))} />
              </label>
              <label className="connection-field">
                <span>Saved address</span>
                <input value={savedHostForm.address} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Region</span>
                  <input value={savedHostForm.region} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, region: event.target.value }))} />
                </label>
                <label className="connection-field">
                  <span>Tags</span>
                  <input
                    value={savedHostForm.tags}
                    onChange={(event) => onSetSavedHostForm((current) => ({ ...current, tags: event.target.value }))}
                    placeholder="production, api"
                  />
                </label>
              </div>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Saved port</span>
                  <input value={savedHostForm.port} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, port: event.target.value }))} inputMode="numeric" />
                </label>
                <label className="connection-field">
                  <span>Saved user</span>
                  <input value={savedHostForm.username} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, username: event.target.value }))} />
                </label>
              </div>
              <label className="connection-field">
                <span>Saved auth</span>
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
                <span>Fingerprint trust</span>
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
              <div className="host-config-actions">
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
            </div>
          </>
        ) : null}
      </div>

      <div className="section-block collapsible-block">
        <button className="section-toggle" onClick={onToggleSessionOverride}>
          <div>
            <p className="panel-kicker">Session-only override</p>
            <h2>Next connection</h2>
          </div>
          <span className="pill subtle">{isSessionOverrideExpanded ? "Hide" : "Edit"}</span>
        </button>
        <div className="session-facts compact-facts">
          <span>{sessionOverride.username || "user"}</span>
          <span>port {sessionOverride.port || "22"}</span>
          <span>{sessionOverride.authMethod}</span>
        </div>
        {isSessionOverrideExpanded ? (
          <>
            <div className="override-banner compact-override-banner">
              <strong>Saved host config stays unchanged.</strong>
              <p>Use these fields only when the next connect or reconnect should differ from the saved defaults.</p>
            </div>
            <div className="connection-form compact-form">
              <label className="connection-field">
                <span>Address</span>
                <input value={sessionOverride.address} onChange={(event) => onSetSessionOverride((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Port</span>
                  <input value={sessionOverride.port} onChange={(event) => onSetSessionOverride((current) => ({ ...current, port: event.target.value }))} inputMode="numeric" />
                </label>
                <label className="connection-field">
                  <span>User</span>
                  <input value={sessionOverride.username} onChange={(event) => onSetSessionOverride((current) => ({ ...current, username: event.target.value }))} />
                </label>
              </div>
              <label className="connection-field">
                <span>Auth</span>
                <select
                  value={sessionOverride.authMethod}
                  onChange={(event) => onSetSessionOverride((current) => ({ ...current, authMethod: event.target.value as ConnectionAuthMethod }))}
                >
                  <option value="agent">agent</option>
                  <option value="private-key">private-key</option>
                  <option value="password">password</option>
                </select>
              </label>
              {sessionOverride.authMethod === "password" ? (
                <label className="connection-field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={sessionOverride.password}
                    onChange={(event) => onSetSessionOverride((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Enter password for the next connect"
                  />
                </label>
              ) : null}
              <div className="host-config-actions">
                <button className="ghost-button small" onClick={onResetConnectionOverride}>
                  Use saved host defaults
                </button>
              </div>
            </div>
            <p className="section-note">These values apply only to the next connect or reconnect action. The password is never persisted.</p>
          </>
        ) : null}
        {activeConnectionIssue ? (
          <div className={`connection-issue issue-${activeConnectionIssue.kind}`}>
            <strong>{activeConnectionIssue.title}</strong>
            <p>{activeConnectionIssue.summary}</p>
            {activeConnectionIssue.fingerprint ? <span>Fingerprint {activeConnectionIssue.fingerprint}</span> : null}
            {activeConnectionIssue.expectedFingerprintHint ? <span>Expected {activeConnectionIssue.expectedFingerprintHint}</span> : null}
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
      </div>
    </aside>
  );
}
