# Talon Status

## Goal
Build Talon into an AI-native SSH troubleshooting desktop app that captures failed commands, packages incident context, and keeps remediation operator-confirmed.

## Current Stage
As of 2026-03-06, the repository has moved from a scenario demo to a backend-managed product skeleton with real SSH process lifecycle management wired through the Tauri backend.

## Completed
- Connected the local workspace to `origin/main` and synced the repository.
- Replaced the desktop demo contract with a workspace-state model built around hosts, sessions, failure context, diagnosis, terminal output, and suggested actions.
- Added shared domain types in `packages/core/src`.
- Updated the desktop UI to render product state instead of switching between hard-coded incident scenarios.
- Introduced a Rust-side `session_manager` layer with connection request and lifecycle event response shapes.
- Added a preview session connect flow in the desktop UI so session events are now visible in the product shell.
- Added an in-memory backend session registry with host connection config, managed session records, active session tracking, and recent lifecycle events.
- Added terminal buffer and command submission scaffolding so managed sessions now accept commands through stable Tauri APIs.
- Replaced preview-only session connect behavior with a real `ssh.exe`-backed backend session transport.
- Added backend-managed SSH process lifecycle tracking, stdout/stderr reader threads, remote shell metadata probes, and stricter host key / batch-mode connection defaults.
- Added desktop polling so asynchronous backend session state and terminal updates are reflected without a reload.

## In Progress
- Replacing preview terminal output with structured live stream handling on top of the real SSH transport.
- Detecting command completion and non-zero exits from the managed remote shell stream.
- Converting live failures into structured capture packets instead of leaving diagnosis state on the static mock payload.

## Next Steps
1. Wrap submitted commands with backend control markers so start/end boundaries and exit codes are detected reliably.
2. Track stdout/stderr tails per command and persist the last completed command record per session.
3. Build structured failure context from live command metadata, host/session metadata, and output tails.
4. Swap the static diagnosis placeholder for an agent-facing context contract built from captured runtime state.

## Risks And Open Questions
- `ssh.exe` is now the selected transport for the first real backend path, which avoids new Rust SSH crate dependencies but creates Windows/OpenSSH-specific assumptions that may need abstraction later.
- Strict host key checking is enabled, so first-contact hosts without an existing known-hosts entry will fail until Talon exposes an explicit operator-confirmed trust flow.
- Password auth is still unsupported in the backend; the current real path assumes agent or private-key auth.
- Frontend verification is available via Node, but full desktop runtime verification beyond `cargo check` still depends on local operator access to reachable SSH targets.

## Working Rules
- Keep execution human-confirmed.
- Bias toward read-only diagnostics first.
- Keep docs updated alongside code changes.
- Commit and push each meaningful phase so project state is recoverable.
