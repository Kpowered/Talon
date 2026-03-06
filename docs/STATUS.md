# Talon Status

## Goal
Build Talon into an AI-native SSH troubleshooting desktop app that captures failed commands, packages incident context, and keeps remediation operator-confirmed.

## Current Stage
As of 2026-03-07, the repository has moved from a scenario demo to a backend-managed product skeleton with real SSH process lifecycle management wired through the Tauri backend.

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
- Added bounded per-session stdout/stderr tail capture in the backend so live stream state is preserved beyond the rendered terminal buffer.
- Added local command echo to the terminal buffer before remote output arrives, keeping the stream readable during async execution.
- Added backend command framing markers so submitted commands now produce explicit start/end lifecycle events, captured exit codes, and updated remote cwd values.
- Added completed command records in the backend with per-command stdout/stderr tails for later failure packaging.
- Added live failure-context packaging for non-zero exits, including host/session metadata, stdout tail, stderr tail, cwd, shell, and captured timestamp.
- Projected live command history and captured failures back into the workspace timeline and diagnosis pane instead of always relying on static sample incident data.
- Extracted failure, diagnosis, and timeline shaping into a dedicated backend `context_builder` module so the session registry stays focused on transport/runtime state.
- Added explicit backend disconnect and reconnect flows for managed SSH sessions and surfaced those controls in the desktop shell.
- Added in-flight command guardrails so each session now serializes wrapped command execution and rejects concurrent submissions until completion.
- Added desktop-side busy-session awareness so the composer reflects when a managed shell already has an active command in progress.
- Added operator-visible connection issue handling for host trust, authentication, timeout, and network-path failures, including suggested operator actions and recommended commands in the UI.
- Added a verification log in `docs/VERIFICATION.md` and captured the current environment's local SSH probe transcripts.
- Validated an operator-provided external password-auth SSH target outside the product flow, confirming reachable handshake, shell bootstrap, and a controlled non-zero remote exit.
- Added product-integrated password authentication support through operator-supplied connection overrides in the desktop UI and backend-managed `SSH_ASKPASS` handling for `ssh.exe`.
- Validated the product-equivalent password-auth transport options against the external test host, including successful shell bootstrap and a controlled non-zero exit through `ssh.exe + SSH_ASKPASS + -T`.
- Projected connection issues into the workspace timeline and diagnosis state so pre-shell failures now appear as first-class incident history.
- Replaced the static nginx incident fallback in `session_store` with neutral placeholder state until live runtime evidence exists.
- Added backend support for persistent host connection configs stored in a local JSON file, including create/update/delete mutation commands.
- Added desktop UI flows for creating, editing, and deleting persistent host configs without persisting passwords.
- Split the desktop connection controls into explicit saved host defaults versus per-session connection overrides, including reset-to-default actions and non-persistent password messaging.
- Moved the desktop host inventory onto backend-persisted host records so host create/edit/delete now survives refresh without relying on `session_store` mock hosts.
- Expanded saved host editing to include `region`, `tags`, and fingerprint trust hints alongside address, port, username, and auth method.
- Split the shared host model into `host.config` versus `host.observed`, so editable inventory fields are separated from read-only runtime telemetry.
- Wired real session lifecycle events into `host.observed.status` and `host.observed.lastSeenAt`, so connect, disconnect, and connection-path failures now update host health telemetry.
- Added a lightweight real `host.observed.latencyMs` measurement based on SSH connect-to-shell-ready elapsed time.
- Added a command-outcome health rule so successful commands restore `host.observed.status` to `healthy`, while recent consecutive non-zero exits now escalate host health from `warning` to `critical`.
- Added high-signal command `stderr` classification so host health now escalates immediately for disk, memory, and network-path failures instead of relying only on exit codes.
- Projected matched command `stderr` classes into live failure context, diagnosis text, and timeline details so the UI explains why host health changed.
- Branched diagnosis likely causes and read-only suggested actions by `stderr_class`, so filesystem, resource-pressure, network-path, and permission failures no longer share generic next steps.
- Surfaced `stderr_class` directly in the desktop diagnosis panel as a visible failure signal instead of leaving it only inside diagnosis prose.
- Surfaced the matched `stderr` evidence snippet in the diagnosis panel so operators can see the concrete trigger line behind the classifier.

## In Progress
- Reducing the remaining placeholder responsibilities in `session_store` now that host inventory is registry-backed.

## Next Steps
1. Decide whether to persist operator-entered connection overrides locally or keep them session-only.
2. Continue reducing mock `session_store` responsibilities as more runtime state becomes authoritative.
3. Expand the command `stderr` pattern set beyond the current high-signal core and decide which additional classes deserve dedicated UI signals, diagnosis copy, suggested actions, or richer evidence snippets.

## Risks And Open Questions
- `ssh.exe` is now the selected transport for the first real backend path, which avoids new Rust SSH crate dependencies but creates Windows/OpenSSH-specific assumptions that may need abstraction later.
- Strict host key checking is enabled, so first-contact hosts without an existing known-hosts entry will fail until Talon exposes an explicit operator-confirmed trust flow.
- Password auth is now supported in the product transport, but end-to-end desktop verification against the external host still depends on running the Tauri shell against that target.
- Child `ssh.exe` processes launched from `cargo test` do not inherit unrestricted network access in the current execution environment, so automated Rust-side network tests for the external host must remain opt-in / ignored here.
- Frontend verification is available via Node, but full desktop runtime verification beyond local probes still depends on local operator access to reachable SSH targets. In this session, `sshd` was stopped and `ssh-agent` was disabled on the local machine.

## Working Rules
- Keep execution human-confirmed.
- Bias toward read-only diagnostics first.
- Keep docs updated alongside code changes.
- Commit and push each meaningful phase so project state is recoverable.
