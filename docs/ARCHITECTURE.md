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
- `apps/desktop/src-tauri/src/session_registry.rs` holds the persisted host inventory, persisted host connection config list, managed sessions, active session id, recent lifecycle events, terminal buffers, command history, and live SSH runtime handles.
- `apps/desktop/src-tauri/src/session_registry.rs` now persists both host records and host connection configs to local JSON files under the user's local app data directory.
- The shared `Host` contract is now split into `config` and `observed` sections so operator-editable fields are separated from runtime telemetry.
- `apps/desktop/src-tauri/src/session_manager.rs` is the backend boundary that exposes registry-backed session and terminal commands to the UI.
- `apps/desktop/src-tauri/src/context_builder.rs` now owns the temporary agent-facing shaping logic for failure packets, diagnosis scaffolding, and timeline construction.
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
  - the current diagnosis builder lives in a separate backend `context_builder` module, but it is still scaffolding rather than a dedicated agent pipeline
- State propagation:
  - stdout and stderr are read on background threads
  - the registry stores recent lifecycle events, a bounded rendered terminal buffer, and bounded per-session stdout/stderr tails
  - process exit transitions the session to `disconnected`
  - operator-triggered disconnect uses the tracked ssh pid to stop the transport and let the registry observe normal process teardown
  - connection-path stderr is classified into operator-visible issue states such as host trust, auth, timeout, and network failures

This is intentionally a transport-first implementation. Command framing, exit detection, and structured failure capture still need to be layered on top of the live shell stream.

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
- Likely `xterm.js`

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
