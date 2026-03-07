import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Host } from "@talon/core";
import type { ConnectionAuthMethod, HostConnectionConfig, SavedHostFormState } from "../types/app";

type ManageHostsDialogProps = {
  selectedHost: Host | null;
  selectedHostConfig: HostConnectionConfig | null;
  savedHostForm: SavedHostFormState;
  isSavingHostConfig: boolean;
  isDeletingHostConfig: boolean;
  isLoadingPassword: boolean;
  onSetSavedHostForm: (updater: (current: SavedHostFormState) => SavedHostFormState) => void;
  onSaveHost: () => void;
  onDeleteSelectedHost: () => void;
  onClose: () => void;
};

type WindowBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function getDefaultBounds(authMethod: ConnectionAuthMethod): WindowBounds {
  return {
    left: 236,
    top: 24,
    width: 386,
    height: authMethod === "agent" ? 376 : 432,
  };
}

const MIN_WIDTH = 340;
const MIN_HEIGHT = 340;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ManageHostsDialog({
  selectedHost,
  selectedHostConfig,
  savedHostForm,
  isSavingHostConfig,
  isDeletingHostConfig,
  isLoadingPassword,
  onSetSavedHostForm,
  onSaveHost,
  onDeleteSelectedHost,
  onClose,
}: ManageHostsDialogProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [bounds, setBounds] = useState<WindowBounds>(() => getDefaultBounds(savedHostForm.authMethod));
  const dragStateRef = useRef<{ pointerX: number; pointerY: number; left: number; top: number } | null>(null);
  const resizeStateRef = useRef<{ pointerX: number; width: number; height: number; ratio: number } | null>(null);

  useEffect(() => {
    setBounds(getDefaultBounds(savedHostForm.authMethod));
  }, [savedHostForm.authMethod, selectedHost?.id]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const dragState = dragStateRef.current;
      if (dragState) {
        const nextLeft = dragState.left + (event.clientX - dragState.pointerX);
        const nextTop = dragState.top + (event.clientY - dragState.pointerY);
        const maxLeft = Math.max(12, window.innerWidth - bounds.width - 12);
        const maxTop = Math.max(12, window.innerHeight - bounds.height - 12);
        setBounds((current) => ({
          ...current,
          left: clamp(nextLeft, 12, maxLeft),
          top: clamp(nextTop, 12, maxTop),
        }));
        return;
      }

      const resizeState = resizeStateRef.current;
      if (resizeState) {
        let nextWidth = clamp(resizeState.width + (event.clientX - resizeState.pointerX), MIN_WIDTH, window.innerWidth - bounds.left - 12);
        let nextHeight = nextWidth / resizeState.ratio;
        if (nextHeight < MIN_HEIGHT) {
          nextHeight = MIN_HEIGHT;
          nextWidth = nextHeight * resizeState.ratio;
        }
        const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - bounds.top - 12);
        if (nextHeight > maxHeight) {
          nextHeight = maxHeight;
          nextWidth = nextHeight * resizeState.ratio;
        }
        const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - bounds.left - 12);
        if (nextWidth > maxWidth) {
          nextWidth = maxWidth;
          nextHeight = nextWidth / resizeState.ratio;
        }
        setBounds((current) => ({
          ...current,
          width: Math.round(nextWidth),
          height: Math.round(nextHeight),
        }));
      }
    }

    function handleMouseUp() {
      dragStateRef.current = null;
      resizeStateRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [bounds.height, bounds.left, bounds.top, bounds.width]);

  if (!selectedHost) {
    return null;
  }

  async function copyPassword() {
    if (!savedHostForm.savedPassword) return;
    await navigator.clipboard.writeText(savedHostForm.savedPassword);
  }

  function handleDragStart(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    dragStateRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: bounds.left,
      top: bounds.top,
    };
  }

  function handleResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    resizeStateRef.current = {
      pointerX: event.clientX,
      width: bounds.width,
      height: bounds.height,
      ratio: bounds.width / bounds.height,
    };
  }

  const authMethod = savedHostForm.authMethod;

  return (
    <div className="manage-hosts-popover-shell" role="presentation" onClick={onClose}>
      <section
        className="manage-hosts-popover manage-hosts-editor-popover compact single-pane movable"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${selectedHost.config.label}`}
        style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="manage-hosts-popover-header compact editor editor-actions-only drag-handle" onMouseDown={handleDragStart}>
          <button className="ghost-button small compact-close" onClick={onClose} type="button">
            x
          </button>
        </div>

        <div className="manage-hosts-editor-stack">
          <label className="connection-field compact-field">
            <span>Label</span>
            <input value={savedHostForm.label} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, label: event.target.value }))} />
          </label>

          <div className="editor-row address-row">
            <label className="connection-field compact-field grow">
              <span>Address</span>
              <input value={savedHostForm.address} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, address: event.target.value }))} />
            </label>
            <label className="connection-field compact-field port-cell">
              <span>Port</span>
              <input value={savedHostForm.port} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, port: event.target.value }))} inputMode="numeric" />
            </label>
          </div>

          <div className="editor-row operator-row">
            <label className="connection-field compact-field grow">
              <span>User</span>
              <input value={savedHostForm.username} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, username: event.target.value }))} />
            </label>
            <label className="connection-field compact-field auth-cell">
              <span>Auth</span>
              <select
                value={authMethod}
                onChange={(event) => onSetSavedHostForm((current) => ({ ...current, authMethod: event.target.value as ConnectionAuthMethod }))}
              >
                <option value="agent">agent</option>
                <option value="private-key">private-key</option>
                <option value="password">password</option>
              </select>
            </label>
          </div>

          <div className="editor-row meta-row">
            <label className="connection-field compact-field grow">
              <span>Tags</span>
              <input value={savedHostForm.tags} onChange={(event) => onSetSavedHostForm((current) => ({ ...current, tags: event.target.value }))} placeholder="production, hk" />
            </label>
            <label className="connection-field compact-field grow">
              <span>Fingerprint</span>
              <input
                value={savedHostForm.fingerprintHint}
                onChange={(event) => onSetSavedHostForm((current) => ({ ...current, fingerprintHint: event.target.value }))}
                placeholder="Pending trust"
              />
            </label>
          </div>

          {authMethod === "password" ? (
            <div className="auth-inline auth-inline-password">
              <span>Password</span>
              <div className="password-field-row compact inline-tools">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={savedHostForm.savedPassword}
                  onChange={(event) => onSetSavedHostForm((current) => ({ ...current, savedPassword: event.target.value }))}
                  placeholder={isLoadingPassword ? "Loading..." : selectedHostConfig?.hasSavedPassword ? "Saved password" : "Enter password"}
                />
                <button className="ghost-button small" onClick={() => setIsPasswordVisible((current) => !current)} type="button">
                  {isPasswordVisible ? "Hide" : "Show"}
                </button>
                <button className="ghost-button small" onClick={() => void copyPassword()} type="button" disabled={!savedHostForm.savedPassword}>
                  Copy
                </button>
              </div>
            </div>
          ) : null}

          {authMethod === "private-key" ? (
            <div className="auth-inline auth-inline-key">
              <label className="connection-field compact-field auth-inline-field">
                <span>Private key</span>
                <input
                  value={savedHostForm.privateKeyPath}
                  onChange={(event) => onSetSavedHostForm((current) => ({ ...current, privateKeyPath: event.target.value }))}
                  placeholder="C:\\Users\\...\\id_ed25519"
                />
              </label>
              <p className="auth-inline-note">Inline pasted key support still needs a backend model change.</p>
            </div>
          ) : null}
        </div>

        <div className="dialog-actions manage-host-actions manage-host-actions-drawer compact">
          <button className="ghost-button small" onClick={onSaveHost} disabled={isSavingHostConfig || isLoadingPassword} type="button">
            {isSavingHostConfig ? "Saving..." : "Save"}
          </button>
          <button className="ghost-button small destructive" onClick={onDeleteSelectedHost} disabled={isDeletingHostConfig} type="button">
            {isDeletingHostConfig ? "Deleting..." : "Delete"}
          </button>
        </div>

        <div className="manage-hosts-resize-handle" onMouseDown={handleResizeStart} />
      </section>
    </div>
  );
}
