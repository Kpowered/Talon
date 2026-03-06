# Talon Status

## Goal
Build Talon into an AI-native SSH troubleshooting desktop app that captures failed commands, packages incident context, and keeps remediation operator-confirmed.

## Current Stage
As of 2026-03-06, the repository has moved from a scenario demo toward a product-shaped skeleton with a backend-managed session registry and command stream scaffolding.

## Completed
- Connected the local workspace to `origin/main` and synced the repository.
- Replaced the desktop demo contract with a workspace-state model built around hosts, sessions, failure context, diagnosis, terminal output, and suggested actions.
- Added shared domain types in `packages/core/src`.
- Updated the desktop UI to render product state instead of switching between hard-coded incident scenarios.
- Introduced a Rust-side `session_manager` layer with connection request and lifecycle event response shapes.
- Added a preview session connect flow in the desktop UI so session events are now visible in the product shell.
- Added an in-memory backend session registry with host connection config, managed session records, active session tracking, and recent lifecycle events.
- Added terminal buffer and command submission scaffolding so managed sessions now accept commands through stable Tauri APIs.

## In Progress
- Keeping mock workspace/session state behind a reusable backend session manager boundary.
- Defining the first SSH package contracts for host config, session lifecycle, command streaming, and failure capture hooks.
- Writing project status documents so progress, scope, and next steps remain easy to follow.

## Next Steps
1. Replace the managed preview command flow with a real SSH-backed connection and stream implementation.
2. Emit stdout/stderr incrementally from the backend instead of appending preview lines.
3. Detect command completion and capture non-zero exits into structured failure context.
4. Introduce an agent-facing context builder and structured diagnosis contract.

## Risks And Open Questions
- The local shell currently does not expose `npm` or `cargo` on PATH, so build verification is blocked in this environment.
- The SSH runtime choice is still open at implementation level; the product docs favor a Tauri-native backend, but the exact crate stack has not been selected yet.
- The command-boundary and exit-code detection strategy needs to be reliable across interactive shell behavior.

## Working Rules
- Keep execution human-confirmed.
- Bias toward read-only diagnostics first.
- Keep docs updated alongside code changes.
- Commit and push each meaningful phase so project state is recoverable.
