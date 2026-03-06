# Talon Status

## Goal
Build Talon into an AI-native SSH troubleshooting desktop app that captures failed commands, packages incident context, and keeps remediation operator-confirmed.

## Current Stage
As of 2026-03-06, the repository has moved from a scenario demo toward a product-shaped skeleton.

## Completed
- Connected the local workspace to `origin/main` and synced the repository.
- Replaced the desktop demo contract with a workspace-state model built around hosts, sessions, failure context, diagnosis, terminal output, and suggested actions.
- Added shared domain types in `packages/core/src`.
- Updated the desktop UI to render product state instead of switching between hard-coded incident scenarios.

## In Progress
- Extracting backend session state into a dedicated session store module.
- Defining the first SSH package contracts for host config, session lifecycle, and failure capture hooks.
- Writing project status documents so progress, scope, and next steps remain easy to follow.

## Next Steps
1. Move mock workspace/session state behind a reusable backend session manager interface.
2. Define the real SSH lifecycle boundary: connect, stream, detect command completion, capture non-zero exits.
3. Replace mock session state with a real SSH-backed implementation.
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
