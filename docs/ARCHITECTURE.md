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
- `apps/desktop/src-tauri/src/session_store.rs` is the temporary backend state provider for failure and diagnosis samples.
- `apps/desktop/src-tauri/src/session_registry.rs` holds the in-memory host config list, managed sessions, active session id, recent lifecycle events, terminal buffers, command history, and live SSH runtime handles.
- `apps/desktop/src-tauri/src/session_manager.rs` is the backend boundary that exposes registry-backed session and terminal commands to the UI.
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
4. `session_registry` still merges active session information with the mock incident payload from `session_store`
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
  - `password` is not implemented
- Bootstrap:
  - after spawn, Talon writes probe commands to capture `$SHELL` and `pwd`
  - stdout parsing converts those markers into live session metadata
- Command framing:
  - submitted commands are wrapped with Talon control markers before being written to the remote shell
  - stdout parsing detects command start and command end markers
  - command completion records now store exit code, updated cwd, and bounded stdout/stderr tails
- State propagation:
  - stdout and stderr are read on background threads
  - the registry stores recent lifecycle events, a bounded rendered terminal buffer, and bounded per-session stdout/stderr tails
  - process exit transitions the session to `disconnected`

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
