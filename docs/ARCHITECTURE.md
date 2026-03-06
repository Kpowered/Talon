# Talon Architecture (Initial)

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
- `packages/ssh` contains initial TypeScript-side lifecycle contracts only.
- `apps/desktop/src-tauri/src/session_store.rs` is the temporary backend session provider that serves mock workspace state.

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

1. Desktop UI calls `get_workspace_state`
2. Tauri backend delegates to `session_store`
3. `session_store` returns mock host/session/failure/diagnosis state
4. Desktop UI renders the workspace model
5. User-triggered read-only actions call `run_suggested_action`

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
