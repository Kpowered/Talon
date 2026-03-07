# Talon Architecture

## High-level

Talon is split into four layers:

1. **Desktop Shell**
   - Windowing
   - Terminal UI
   - Server list
   - AI side panel

2. **SSH Session Layer**
   - Connection lifecycle
   - PTY management
   - Shell output streaming
   - Command boundary detection

3. **Context Engine**
   - Recent command tracking
   - Exit code capture
   - stdout/stderr tail capture
   - cwd / host / user / shell metadata capture
   - structured context packaging

4. **Agent Layer**
   - Prompt construction
   - Model routing
   - Structured diagnosis output
   - future: tool-mediated read-only diagnostics

## Current implementation snapshot

As of 2026-03-06:
- `apps/desktop` renders a workspace state model instead of scenario-specific UI state.
- `packages/core` contains the first shared domain contracts.
- `packages/ssh` contains initial TypeScript-side lifecycle contracts.
- `apps/desktop/src-tauri/src/session_store.rs` is the temporary backend state provider for neutral workspace placeholders while runtime state is still being wired through the registry.
- `apps/desktop/src-tauri/src/session_registry/mod.rs` is now the entry point for the backend session registry and composes internal `include!`-based modules for `types`, `state`, `registry_ops`, `trust`, `transport`, and `projection`.
- Those internal registry modules still own the persisted host inventory, persisted host connection configs, managed sessions, active session id, recent lifecycle events, terminal buffers, command history, diagnosis cache, and live SSH runtime handles.
- The shared `Host` contract is now split into `config` and `observed` sections so operator-editable fields are separated from runtime telemetry.
- `apps/desktop/src-tauri/src/session_manager.rs` is the backend boundary that exposes registry-backed session and terminal commands to the UI.
- `apps/desktop/src-tauri/src/session_manager.rs` now acts as a thin Tauri-safe boundary: read-only getters still return direct DTOs, while mutating commands return `Result<..., String>` so backend/runtime failures surface to the UI instead of panicking the app.
- `apps/desktop/src/App.tsx` now delegates the read-only workspace tabs to extracted React components under `src/components/views/`, and shared frontend DTOs / formatting helpers live under `src/types/` and `src/lib/` instead of staying embedded in the root app component.
- The root app component now also delegates top-level operator shell chrome to src/components/TopBar.tsx, src/components/HostRail.tsx, and src/components/ShellWorkspace.tsx, leaving App.tsx primarily responsible for state orchestration and Tauri command handlers.
- `apps/desktop/src/lib/tauri.ts` now wraps every Tauri invoke behind a typed command helper that classifies common backend/runtime failures into operator-facing auth, host-trust, network, agent, validation, and transport error messages before they reach React state.
- Top-level action feedback in the desktop shell is delivered through a transient notice banner that supports manual dismiss and timed expiry, keeping command/configuration feedback visible without adding another permanent panel.
- Root-shell orchestration is now further split through `src/hooks/useActionNotice.ts`, `src/hooks/useTimelineSignals.ts`, `src/components/ActionNoticeBar.tsx`, `src/components/AppEmptyState.tsx`, and `src/components/WorkspacePanels.tsx`, so `App.tsx` mostly wires runtime state, form inputs, and operator actions together.
- The timeline, diagnosis, and artifact views now render explicit empty or partial-evidence states instead of collapsing to blank panels when filters exclude events or when no structured packet / diagnosis messages are available yet.
- Frontend command-error normalization is now source-aware: the same backend failure can surface different operator hints depending on whether it happened during connect, command submission, host trust, host config mutation, agent configuration, or live-state refresh.
- Host-rail form orchestration now lives in `src/hooks/useHostRailState.ts`, which owns saved-host defaults, session-only override input, agent settings input, expansion state, and selected-host synchronization instead of leaving those responsibilities in the root app component.
- `src/components/HostRail.tsx` now consumes grouped form models rather than dozens of flat scalar props, which makes the operator-editable host model boundaries clearer between persisted defaults, session-only overrides, and agent configuration.
- New host creation now enters through `src/components/NewHostDialog.tsx` instead of mutating backend host state immediately from the top bar; operators provide SSH details first, then explicitly save or save-and-connect.
- Saved host maintenance while disconnected now enters through `src/components/ManageHostsDialog.tsx`, which exposes a dedicated left-list/right-editor management surface for host selection, saved-config edits, password storage, and host deletion outside the connected HostRail layout.
- The desktop stack now exposes a read path for stored host passwords so the manage-hosts password field can load, reveal, copy, replace, or remove the current keychain-backed password instead of forcing separate save/clear actions.
- `useOperatorActions` now exposes a dedicated create-host-from-draft path that persists the host record, persists its default SSH config, and can immediately open a live SSH session from the same draft payload.
- `useWorkspaceRuntime` now clears the cached diagnosis context packet when the active SSH session disappears so artifact rendering tracks the current runtime session boundary more faithfully.
- The same runtime hook now also clears cached packet state on packet-load failure, always mirrors the backend terminal snapshot even when it becomes empty, and re-validates `selectedHostId` against the current backend host inventory during refresh.
- Registry and SSH-stdin lock access now goes through local recovery helpers instead of `expect(...)` so a poisoned lock degrades more safely during long-lived desktop sessions.
- Real session connection management is now handled by backend-spawned `ssh.exe` child processes with piped stdin/stdout/stderr and reader threads owned by the registry layer.

## Proposed repo layout

```text
Talon/
  apps/
    desktop/
  packages/
    core/
    ssh/
    agent/
  docs/
```

## MVP data flow

1. User connects to host
2. SSH PTY streams output into terminal view
3. Command tracker detects command start/end
4. On non-zero exit:
   - capture command
   - capture exit code
   - capture last N lines of output
   - capture cwd / hostname / username
5. Context engine builds structured payload
6. Agent layer sends payload to model
7. UI renders:
   - diagnosis
   - likely causes
   - suggested next commands

## Temporary implementation flow

1. Desktop UI calls `get_workspace_state`, `get_session_registry`, `get_session_events`, and `get_terminal_snapshot`
2. Tauri backend delegates to `session_manager`
3. `session_manager` reads and mutates managed state in `session_registry`
4. `session_registry` now supplies the host inventory and active session information, while `session_store` only supplies placeholder incident scaffolding where live runtime evidence is still absent
5. Desktop UI can request `connect_session` for a selected host and `submit_session_command` for the active session
6. `connect_session` now spawns a real `ssh.exe` child process in batch mode with strict host key checking, piped stdin/stdout/stderr, and remote shell metadata probes
7. Reader threads append terminal lines and lifecycle events back into `session_registry`
8. Desktop UI polls the backend so async transport state and terminal output remain visible
9. User-triggered read-only actions still call `run_suggested_action`

## Implemented SSH transport

The current real backend path uses the platform OpenSSH client instead of a Rust SSH crate:

- Spawn model:
  - `ssh -T` with piped stdin/stdout/stderr
  - `BatchMode=yes`
  - `StrictHostKeyChecking=yes`
  - connection timeout set from the backend
- Auth model:
  - `agent` uses the local OpenSSH agent or default key discovery
  - `private-key` uses `TALON_SSH_KEY_PATH_<HOST_ID>` first, then falls back to `~/.ssh/id_ed25519` or `~/.ssh/id_rsa`
  - `password` is supplied by the operator at connect time and bridged into `ssh.exe` through a temporary `SSH_ASKPASS` helper
- Bootstrap:
  - after spawn, Talon writes probe commands to capture `$SHELL` and `pwd`
  - stdout parsing converts those markers into live session metadata
- Connection overrides:
  - the desktop UI now separates saved host defaults from per-session connection overrides
  - the operator can override the selected host's address, port, username, auth method, and password at connect time
  - overrides are session-scoped operator input and are not persisted into saved host config
- Host config management:
  - saved host records are now created, updated, and deleted through backend Tauri commands instead of frontend-only state mutation
  - saved host config fields now live under `host.config` and are editable from the desktop UI
  - the current desktop shell allows editing host label, address, region, tags, port, username, auth method, and fingerprint trust hints
  - host health, latency, CPU, memory, and last-seen timestamps now live under `host.observed` and are rendered read-only in the UI
  - real SSH lifecycle events currently update `host.observed.status` and `host.observed.lastSeenAt` on shell-ready, disconnect, and connection-path failure transitions
  - `host.observed.latencyMs` is now populated from the elapsed time between SSH transport launch and shell metadata readiness
  - command completion now applies a graded health rule: `exit 0` restores `host.observed.status` to `healthy`, while recent consecutive non-zero exits escalate from `warning` to `critical`
  - high-signal command `stderr` patterns currently override the consecutive-failure rule: auth/permission errors map to `warning`, while network-path, disk, and memory exhaustion patterns map to `critical`
  - the matched command `stderr` class is now preserved in failure context and projected into diagnosis copy and timeline details for operator visibility
  - diagnosis scaffolding now branches likely causes and read-only suggested actions by `stderr_class` for filesystem, resource-pressure, network-path, and permission failures
  - the desktop diagnosis panel now renders `stderr_class` as an explicit visual failure signal in addition to the generated diagnosis text
  - the desktop diagnosis panel now also renders the matched `stderr` evidence line when available so operators can see the concrete classifier trigger
  - incident timeline entries now also include the same matched `stderr` evidence so context remains visible outside the diagnosis panel
  - timeline events now carry structured `stderr_class` / `stderr_evidence` metadata, which the desktop UI uses to badge and highlight repeated failure signals within the current timeline window
  - connection-issue timeline events now also map `issue.kind` / `issue.summary` into that structured signal metadata so pre-shell failures participate in the same UI treatment
  - the desktop timeline now renders a compact summary row above the event list for repeated signal classes within the current incident window
  - those summary pills now act as a frontend-only filter over the current timeline window, allowing operators to isolate a single repeated signal class without changing backend state
  - the selected timeline signal filter is intentionally sticky across polling refreshes and auto-clears only when that signal no longer exists in the current timeline window; the active pill remains rendered even if its count drops below the repeated threshold
  - the desktop shell now has two primary presentation states: disconnected sessions render a terminal-first layout with a compact host picker and a single main terminal surface, while connected sessions expand only a narrow host rail alongside that same main workspace
  - diagnosis, timeline, and artifacts now share the main workspace tabs instead of rendering as separate always-visible panels, keeping the connected layout focused on one primary work surface
  - the shell surface is now `xterm.js`, not a static tail-only div; frontend keyboard input is captured directly inside the terminal pane
- session state is now explicitly lifecycle-based: `connecting` at spawn time, `connected` only after live shell output, `disconnected` on transport exit, and `degraded` on stream/wait failures
- terminal projection is intentionally sanitized before rendering into xterm so ANSI control sequences that clear the screen or rewrite window metadata do not erase Talon-managed transcript state
  - the operator-facing terminal now uses one Talon-managed direct-input mode: typing happens inside xterm, but `Enter` still submits through Talon command wrapping so command completion and exit-code capture remain intact
  - a lower-level stdin passthrough helper still exists in the backend as scaffolding, but it is no longer exposed as a primary UI mode until a fuller PTY model exists
  - saved config persists address, port, username, auth method, and fingerprint hint
  - passwords are still operator-entered at connect time rather than persisted
- Command framing:
  - submitted commands are wrapped with Talon control markers before being written to the remote shell
  - stdout parsing detects command start and command end markers
  - command completion records now store exit code, updated cwd, and bounded stdout/stderr tails
  - a session can have only one wrapped command in flight; additional submissions are rejected until completion markers are observed
- Failure packaging:
  - non-zero command completions are converted into structured `FailureContext` records
  - workspace timeline and diagnosis state are now derived from live command history and connection issues when runtime data exists
  - `context_builder` remains responsible for deterministic fallback diagnosis copy and timeline shaping, while `diagnosis_engine` now turns the same runtime evidence into a reusable `DiagnosisContextPacket` and optionally sends it to an OpenAI-compatible provider
- State propagation:
  - stdout and stderr are read on background threads
  - the registry stores recent lifecycle events, a bounded rendered terminal buffer, and bounded per-session stdout/stderr tails
  - process exit transitions the session to `disconnected`
  - operator-triggered disconnect uses the tracked ssh pid to stop the transport and let the registry observe normal process teardown
  - connection-path stderr is classified into operator-visible issue states such as host trust, auth, timeout, and network failures

The implementation is no longer transport-only: the real SSH path, structured failure capture, provider-backed diagnosis, host-trust confirmation, and system-keychain credential storage are all wired through the current desktop stack. Remaining work is now mostly hardening, testing, and UX refinement.

## Context schema (draft)

```json
{
  "host": {
    "name": "prod-1",
    "hostname": "example-host",
    "user": "root"
  },
  "session": {
    "cwd": "/root/app",
    "shell": "bash"
  },
  "command": {
    "text": "systemctl restart nginx",
    "exitCode": 1
  },
  "output": {
    "tail": ["...last lines..."]
  }
}
```

## Initial technical bets

### Desktop app
- Prefer **Tauri** for lean footprint
- Web UI frontend for speed of iteration

### Terminal rendering
- `xterm.js` is now the desktop shell surface
- The current shell path is single-mode and Talon-managed: backend output is appended into xterm while the current input line is rendered locally inside the terminal surface
- The transport now forces PTY allocation instead of `ssh -T`, because Talon is acting as a persistent shell session rather than a one-shot non-interactive command pipe
- xterm rendering now prefers incremental append over full reset/replay to reduce visible flashing during polling refreshes
- when structured command/failure signals are absent, the workspace timeline degrades gracefully to recent lifecycle events from the session registry so connection progress is still visible to the operator
- A lower-level stdin passthrough helper exists in the backend but is intentionally not surfaced as a normal operator mode until fuller PTY/TUI behavior is implemented

### SSH layer
- To be evaluated:
  - Rust-native SSH for Tauri backend
  - Node/TS SSH approach if Electron chosen

### Agent layer
- Start with model-agnostic provider interface
- Support OpenAI-compatible endpoints first

## Constraints

- Must remain useful before autonomous execution exists
- Must avoid collecting excessive context by default
- Must preserve user trust with transparent context capture

## Principle

Talon should feel like **a terminal with incident memory**, not a chatbot bolted onto a shell.













