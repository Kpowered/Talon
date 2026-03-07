import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { HostConnectionConfig, SavedHostFormState } from "../types/app";

export const HOST_EDITOR_WINDOW_LABEL = "host-editor";
export const HOST_EDITOR_LOAD_EVENT = "host-editor:load";
export const HOST_EDITOR_READY_EVENT = "host-editor:ready";
export const HOST_EDITOR_SAVE_EVENT = "host-editor:save";
export const HOST_EDITOR_DELETE_EVENT = "host-editor:delete";
export const HOST_EDITOR_ERROR_EVENT = "host-editor:error";

export type HostEditorLoadPayload = {
  hostId: string;
  form: SavedHostFormState;
  hostConfig: HostConnectionConfig | null;
  isLoadingPassword: boolean;
};

export type HostEditorSavePayload = {
  hostId: string;
  form: SavedHostFormState;
};

export type HostEditorDeletePayload = {
  hostId: string;
};

export type HostEditorErrorPayload = {
  message: string;
};

export async function openHostEditorWindow() {
  const existing = await WebviewWindow.getByLabel(HOST_EDITOR_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return existing;
  }

  const window = new WebviewWindow(HOST_EDITOR_WINDOW_LABEL, {
    title: "Host Editor",
    width: 386,
    height: 396,
    minWidth: 340,
    minHeight: 320,
    resizable: false,
    decorations: false,
    visible: false,
    center: false,
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    void window.once("tauri://created", () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    void window.once("tauri://error", (event) => {
      if (!settled) {
        settled = true;
        reject(new Error(String(event.payload)));
      }
    });
  });

  await window.show();
  await window.setFocus();
  return window;
}

export async function closeHostEditorWindow() {
  const existing = await WebviewWindow.getByLabel(HOST_EDITOR_WINDOW_LABEL);
  if (existing) {
    await existing.close();
  }
}

export function emitHostEditorLoad(payload: HostEditorLoadPayload) {
  return emitTo(HOST_EDITOR_WINDOW_LABEL, HOST_EDITOR_LOAD_EVENT, payload);
}

export function emitHostEditorError(payload: HostEditorErrorPayload) {
  return emitTo(HOST_EDITOR_WINDOW_LABEL, HOST_EDITOR_ERROR_EVENT, payload);
}

export function emitHostEditorReady() {
  return emit(HOST_EDITOR_READY_EVENT);
}

export function emitHostEditorSave(payload: HostEditorSavePayload) {
  return emit(HOST_EDITOR_SAVE_EVENT, payload);
}

export function emitHostEditorDelete(payload: HostEditorDeletePayload) {
  return emit(HOST_EDITOR_DELETE_EVENT, payload);
}

export function listenHostEditorReady(handler: () => void) {
  return listen(HOST_EDITOR_READY_EVENT, () => handler());
}

export function listenHostEditorSave(handler: (payload: HostEditorSavePayload) => void) {
  return listen<HostEditorSavePayload>(HOST_EDITOR_SAVE_EVENT, (event) => handler(event.payload));
}

export function listenHostEditorDelete(handler: (payload: HostEditorDeletePayload) => void) {
  return listen<HostEditorDeletePayload>(HOST_EDITOR_DELETE_EVENT, (event) => handler(event.payload));
}

export function listenHostEditorLoad(handler: (payload: HostEditorLoadPayload) => void) {
  return listen<HostEditorLoadPayload>(HOST_EDITOR_LOAD_EVENT, (event) => handler(event.payload), {
    target: { kind: "WebviewWindow", label: HOST_EDITOR_WINDOW_LABEL },
  });
}

export function listenHostEditorError(handler: (payload: HostEditorErrorPayload) => void) {
  return listen<HostEditorErrorPayload>(HOST_EDITOR_ERROR_EVENT, (event) => handler(event.payload), {
    target: { kind: "WebviewWindow", label: HOST_EDITOR_WINDOW_LABEL },
  });
}
