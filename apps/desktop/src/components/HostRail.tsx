import type { Host } from "@talon/core";
import { formatTime, statusLabel } from "../lib/formatters";
import type { AgentSettings, ConnectionAuthMethod, HostConnectionConfig, SessionConnectionIssue } from "../types/app";

type HostRailProps = {
  hosts: Host[];
  selectedHost: Host;
  selectedHostConfig: HostConnectionConfig | null;
  agentSettings: AgentSettings | null;
  agentBaseUrlInput: string;
  agentModelInput: string;
  agentAutoDiagnoseInput: boolean;
  agentApiKeyInput: string;
  isSavedConfigExpanded: boolean;
  isSessionOverrideExpanded: boolean;
  hostLabelInput: string;
  hostAddressInput: string;
  hostRegionInput: string;
  hostTagsInput: string;
  hostPortInput: string;
  hostUsernameInput: string;
  hostAuthMethodInput: ConnectionAuthMethod;
  hostFingerprintHintInput: string;
  hostPrivateKeyPathInput: string;
  savedHostPasswordInput: string;
  connectionAddress: string;
  connectionPort: string;
  connectionUsername: string;
  connectionAuthMethod: ConnectionAuthMethod;
  connectionPassword: string;
  activeConnectionIssue: SessionConnectionIssue | null;
  isSavingHostConfig: boolean;
  isDeletingHostConfig: boolean;
  onSelectHost: (hostId: string) => void;
  onSetAgentBaseUrlInput: (value: string) => void;
  onSetAgentModelInput: (value: string) => void;
  onSetAgentAutoDiagnoseInput: (value: boolean) => void;
  onSetAgentApiKeyInput: (value: string) => void;
  onSaveAgentConfiguration: () => void;
  onSaveAgentApiKey: () => void;
  onClearAgentApiKey: () => void;
  onToggleSavedConfig: () => void;
  onSetHostLabelInput: (value: string) => void;
  onSetHostAddressInput: (value: string) => void;
  onSetHostRegionInput: (value: string) => void;
  onSetHostTagsInput: (value: string) => void;
  onSetHostPortInput: (value: string) => void;
  onSetHostUsernameInput: (value: string) => void;
  onSetHostAuthMethodInput: (value: ConnectionAuthMethod) => void;
  onSetHostFingerprintHintInput: (value: string) => void;
  onSetHostPrivateKeyPathInput: (value: string) => void;
  onSetSavedHostPasswordInput: (value: string) => void;
  onSaveSavedHostPassword: () => void;
  onClearSavedHostPassword: () => void;
  onUpdateSelectedHost: () => void;
  onDeleteSelectedHost: () => void;
  onToggleSessionOverride: () => void;
  onSetConnectionAddress: (value: string) => void;
  onSetConnectionPort: (value: string) => void;
  onSetConnectionUsername: (value: string) => void;
  onSetConnectionAuthMethod: (value: ConnectionAuthMethod) => void;
  onSetConnectionPassword: (value: string) => void;
  onResetConnectionOverride: () => void;
  onPrepareHostTrustFlow: () => void;
  onConfirmHostTrustFlow: () => void;
};

export function HostRail(props: HostRailProps) {
  const {
    hosts,
    selectedHost,
    selectedHostConfig,
    agentSettings,
    agentBaseUrlInput,
    agentModelInput,
    agentAutoDiagnoseInput,
    agentApiKeyInput,
    isSavedConfigExpanded,
    isSessionOverrideExpanded,
    hostLabelInput,
    hostAddressInput,
    hostRegionInput,
    hostTagsInput,
    hostPortInput,
    hostUsernameInput,
    hostAuthMethodInput,
    hostFingerprintHintInput,
    hostPrivateKeyPathInput,
    savedHostPasswordInput,
    connectionAddress,
    connectionPort,
    connectionUsername,
    connectionAuthMethod,
    connectionPassword,
    activeConnectionIssue,
    isSavingHostConfig,
    isDeletingHostConfig,
    onSelectHost,
    onSetAgentBaseUrlInput,
    onSetAgentModelInput,
    onSetAgentAutoDiagnoseInput,
    onSetAgentApiKeyInput,
    onSaveAgentConfiguration,
    onSaveAgentApiKey,
    onClearAgentApiKey,
    onToggleSavedConfig,
    onSetHostLabelInput,
    onSetHostAddressInput,
    onSetHostRegionInput,
    onSetHostTagsInput,
    onSetHostPortInput,
    onSetHostUsernameInput,
    onSetHostAuthMethodInput,
    onSetHostFingerprintHintInput,
    onSetHostPrivateKeyPathInput,
    onSetSavedHostPasswordInput,
    onSaveSavedHostPassword,
    onClearSavedHostPassword,
    onUpdateSelectedHost,
    onDeleteSelectedHost,
    onToggleSessionOverride,
    onSetConnectionAddress,
    onSetConnectionPort,
    onSetConnectionUsername,
    onSetConnectionAuthMethod,
    onSetConnectionPassword,
    onResetConnectionOverride,
    onPrepareHostTrustFlow,
    onConfirmHostTrustFlow,
  } = props;

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
          <button
            key={host.id}
            className={`host-card compact-host-card status-${host.observed.status} ${host.id === selectedHost.id ? "selected" : ""}`}
            onClick={() => onSelectHost(host.id)}
          >
            <div className="host-row">
              <div>
                <h3>{host.config.label}</h3>
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
            <input value={agentBaseUrlInput} onChange={(event) => onSetAgentBaseUrlInput(event.target.value)} />
          </label>
          <label className="connection-field">
            <span>Model</span>
            <input value={agentModelInput} onChange={(event) => onSetAgentModelInput(event.target.value)} />
          </label>
          <label className="connection-field">
            <span>API key</span>
            <input
              type="password"
              value={agentApiKeyInput}
              onChange={(event) => onSetAgentApiKeyInput(event.target.value)}
              placeholder={agentSettings?.hasApiKey ? "Stored in system keychain" : "Paste API key"}
            />
          </label>
          <label className="connection-field checkbox-field">
            <span>Auto diagnose</span>
            <input type="checkbox" checked={agentAutoDiagnoseInput} onChange={(event) => onSetAgentAutoDiagnoseInput(event.target.checked)} />
          </label>
          <div className="host-config-actions">
            <button className="ghost-button small" onClick={onSaveAgentConfiguration}>
              Save settings
            </button>
            <button className="ghost-button small" onClick={onSaveAgentApiKey} disabled={!agentApiKeyInput.trim()}>
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
                <input value={hostLabelInput} onChange={(event) => onSetHostLabelInput(event.target.value)} />
              </label>
              <label className="connection-field">
                <span>Saved address</span>
                <input value={hostAddressInput} onChange={(event) => onSetHostAddressInput(event.target.value)} />
              </label>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Region</span>
                  <input value={hostRegionInput} onChange={(event) => onSetHostRegionInput(event.target.value)} />
                </label>
                <label className="connection-field">
                  <span>Tags</span>
                  <input value={hostTagsInput} onChange={(event) => onSetHostTagsInput(event.target.value)} placeholder="production, api" />
                </label>
              </div>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Saved port</span>
                  <input value={hostPortInput} onChange={(event) => onSetHostPortInput(event.target.value)} inputMode="numeric" />
                </label>
                <label className="connection-field">
                  <span>Saved user</span>
                  <input value={hostUsernameInput} onChange={(event) => onSetHostUsernameInput(event.target.value)} />
                </label>
              </div>
              <label className="connection-field">
                <span>Saved auth</span>
                <select value={hostAuthMethodInput} onChange={(event) => onSetHostAuthMethodInput(event.target.value as ConnectionAuthMethod)}>
                  <option value="agent">agent</option>
                  <option value="private-key">private-key</option>
                  <option value="password">password</option>
                </select>
              </label>
              <label className="connection-field">
                <span>Fingerprint trust</span>
                <input
                  value={hostFingerprintHintInput}
                  onChange={(event) => onSetHostFingerprintHintInput(event.target.value)}
                  placeholder="SHA256:... or Pending trust"
                />
              </label>
              <label className="connection-field">
                <span>Private key path</span>
                <input
                  value={hostPrivateKeyPathInput}
                  onChange={(event) => onSetHostPrivateKeyPathInput(event.target.value)}
                  placeholder="C:\\Users\\...\\.ssh\\id_ed25519"
                />
              </label>
              <label className="connection-field">
                <span>Saved password</span>
                <input
                  type="password"
                  value={savedHostPasswordInput}
                  onChange={(event) => onSetSavedHostPasswordInput(event.target.value)}
                  placeholder={selectedHostConfig?.hasSavedPassword ? "Password saved in system keychain" : "Store password in system keychain"}
                />
              </label>
              <div className="host-config-actions">
                <button className="ghost-button small" onClick={onSaveSavedHostPassword} disabled={!savedHostPasswordInput.trim()}>
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
          <span>{connectionUsername || "user"}</span>
          <span>port {connectionPort || "22"}</span>
          <span>{connectionAuthMethod}</span>
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
                <input value={connectionAddress} onChange={(event) => onSetConnectionAddress(event.target.value)} />
              </label>
              <div className="connection-grid">
                <label className="connection-field">
                  <span>Port</span>
                  <input value={connectionPort} onChange={(event) => onSetConnectionPort(event.target.value)} inputMode="numeric" />
                </label>
                <label className="connection-field">
                  <span>User</span>
                  <input value={connectionUsername} onChange={(event) => onSetConnectionUsername(event.target.value)} />
                </label>
              </div>
              <label className="connection-field">
                <span>Auth</span>
                <select value={connectionAuthMethod} onChange={(event) => onSetConnectionAuthMethod(event.target.value as ConnectionAuthMethod)}>
                  <option value="agent">agent</option>
                  <option value="private-key">private-key</option>
                  <option value="password">password</option>
                </select>
              </label>
              {connectionAuthMethod === "password" ? (
                <label className="connection-field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={connectionPassword}
                    onChange={(event) => onSetConnectionPassword(event.target.value)}
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
