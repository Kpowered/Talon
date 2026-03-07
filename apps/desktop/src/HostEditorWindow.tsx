import { useEffect, useMemo, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { HostConnectionConfig, SavedHostFormState } from "./types/app";
import {
  emitHostEditorDelete,
  emitHostEditorReady,
  emitHostEditorSave,
  listenHostEditorError,
  listenHostEditorLoad,
} from "./lib/hostEditorWindow";
import "./App.css";

const EMPTY_FORM: SavedHostFormState = {
  label: "",
  address: "",
  region: "custom",
  tags: "",
  port: "22",
  username: "",
  authMethod: "agent",
  fingerprintHint: "Pending trust",
  privateKeyPath: "",
  savedPassword: "",
};

export function HostEditorWindow() {
  const [hostId, setHostId] = useState<string | null>(null);
  const [form, setForm] = useState<SavedHostFormState>(EMPTY_FORM);
  const [hostConfig, setHostConfig] = useState<HostConnectionConfig | null>(null);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    const unlistenPromises = [
      listenHostEditorLoad((payload) => {
        setHostId(payload.hostId);
        setForm(payload.form);
        setHostConfig(payload.hostConfig);
        setIsLoadingPassword(payload.isLoadingPassword);
        setErrorMessage(null);
        setIsBusy(false);
      }),
      listenHostEditorError((payload) => {
        setErrorMessage(payload.message);
        setIsBusy(false);
      }),
    ];

    void emitHostEditorReady();

    return () => {
      void Promise.all(unlistenPromises).then((unlistenFns) => {
        unlistenFns.forEach((unlisten) => unlisten());
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void getCurrentWebviewWindow().close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const authMethod = form.authMethod;
  const passwordPlaceholder = useMemo(() => {
    if (isLoadingPassword) return "Loading...";
    if (hostConfig?.hasSavedPassword) return "Saved password";
    return "Enter password";
  }, [hostConfig?.hasSavedPassword, isLoadingPassword]);

  return (
    <main className="host-editor-window-shell">
      <section className="host-editor-window-card" data-tauri-drag-region>
        <div className="host-editor-window-grip" data-tauri-drag-region />

        <div className="manage-hosts-editor-stack host-editor-window-form">
          <label className="connection-field compact-field">
            <span>Label</span>
            <input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
          </label>

          <div className="editor-row address-row">
            <label className="connection-field compact-field grow">
              <span>Address</span>
              <input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
            </label>
            <label className="connection-field compact-field port-cell">
              <span>Port</span>
              <input value={form.port} onChange={(event) => setForm((current) => ({ ...current, port: event.target.value }))} inputMode="numeric" />
            </label>
          </div>

          <div className="editor-row operator-row">
            <label className="connection-field compact-field grow">
              <span>User</span>
              <input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
            </label>
            <label className="connection-field compact-field auth-cell">
              <span>Auth</span>
              <select value={authMethod} onChange={(event) => setForm((current) => ({ ...current, authMethod: event.target.value as SavedHostFormState["authMethod"] }))}>
                <option value="agent">agent</option>
                <option value="private-key">private-key</option>
                <option value="password">password</option>
              </select>
            </label>
          </div>

          <div className="editor-row meta-row">
            <label className="connection-field compact-field grow">
              <span>Tags</span>
              <input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="production, hk" />
            </label>
            <label className="connection-field compact-field grow">
              <span>Fingerprint</span>
              <input value={form.fingerprintHint} onChange={(event) => setForm((current) => ({ ...current, fingerprintHint: event.target.value }))} placeholder="Pending trust" />
            </label>
          </div>

          {authMethod === "password" ? (
            <div className="auth-inline auth-inline-password">
              <span>Password</span>
              <div className="password-field-row compact inline-tools">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={form.savedPassword}
                  onChange={(event) => setForm((current) => ({ ...current, savedPassword: event.target.value }))}
                  placeholder={passwordPlaceholder}
                />
                <button className="ghost-button small" onClick={() => setIsPasswordVisible((current) => !current)} type="button">
                  {isPasswordVisible ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          ) : null}

          {authMethod === "private-key" ? (
            <div className="auth-inline auth-inline-key">
              <label className="connection-field compact-field auth-inline-field">
                <span>Private key</span>
                <input
                  value={form.privateKeyPath}
                  onChange={(event) => setForm((current) => ({ ...current, privateKeyPath: event.target.value }))}
                  placeholder="C:\\Users\\...\\id_ed25519"
                />
              </label>
              <p className="auth-inline-note">Inline pasted key support still needs a backend model change.</p>
            </div>
          ) : null}
        </div>

        {errorMessage ? <div className="host-editor-window-error">{errorMessage}</div> : null}

        <div className="dialog-actions manage-host-actions manage-host-actions-drawer compact host-editor-window-actions">
          <button
            className="ghost-button small"
            onClick={() => {
              if (!hostId || isBusy) return;
              setIsBusy(true);
              void emitHostEditorSave({ hostId, form });
            }}
            disabled={!hostId || isBusy || isLoadingPassword}
            type="button"
          >
            {isBusy ? "Saving..." : "Save"}
          </button>
          <button
            className="ghost-button small destructive"
            onClick={() => {
              if (!hostId || isBusy) return;
              setIsBusy(true);
              void emitHostEditorDelete({ hostId });
            }}
            disabled={!hostId || isBusy}
            type="button"
          >
            {isBusy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </section>
    </main>
  );
}
