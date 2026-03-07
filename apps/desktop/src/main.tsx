import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import { HostEditorWindow } from "./HostEditorWindow";

const windowLabel = (() => {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
})();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{windowLabel === "host-editor" ? <HostEditorWindow /> : <App />}</React.StrictMode>,
);
