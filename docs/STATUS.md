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
- Projected the same `stderr` evidence into timeline events so incident memory stays self-contained outside the diagnosis card.
- Added structured `stderr_class` / `stderr_evidence` timeline fields and frontend repeated-signal highlighting so recurring failure classes stand out in the current incident window.
- Extended the same structured signal treatment to connection-issue timeline events, so pre-shell failures now badge and repeat-highlight consistently with command failures.
- Added a compact timeline signal summary row that surfaces repeated failure classes in the current incident window without scanning each event card.
- Made timeline signal summary pills interactive so operators can toggle the visible timeline down to a single repeated `stderr_class` and clear the filter in place.
- Kept the active timeline signal filter stable across polling refreshes, only clearing it when that signal disappears from the current timeline window; the active summary pill now remains visible even after the count drops below the repeated threshold.
- Compressed the desktop shell into a terminal-first workspace: before connection the app now hides the host rail and keeps only a host picker plus terminal surface, then expands a narrow host rail after a real session is connected.
- Removed the always-visible diagnosis sidebar and moved diagnosis, timeline, and artifacts into the main workspace tabs so the connected layout stays closer to a Termius-style terminal-first surface.
- Added a real diagnosis engine path with cached OpenAI-compatible provider calls, system-keychain API key storage, and rule-engine fallback when the provider is unavailable or disabled.
- Added system-keychain host password storage, persistent per-host private key paths, in-app host-trust preparation/confirmation, and a structured diagnosis context packet that now powers provider requests and can be inspected from the desktop UI.

- Hardened the backend command boundary so the mutable Tauri commands in `session_manager` now return `Result<..., String>` instead of panicking on missing hosts or registry mutation failures.
- Reduced panic-style runtime failure paths in `session_registry` by adding recoverable lock helpers for the registry and SSH stdin handles, and by removing `expect(...)` from command completion / connected-session lookup paths.
- Split the Rust backend session registry into internal `session_registry/` modules (`state`, `registry_ops`, `trust`, `transport`, `projection`, `types`) while keeping the existing Tauri command surface unchanged.
- Split desktop-only frontend concerns out of `App.tsx` by extracting shared app types, formatter helpers, and dedicated timeline / diagnosis / artifacts view components while preserving the existing Tauri-driven behavior.
- Continued shrinking App.tsx by extracting the remaining top bar, host rail, and shell workspace UI into focused React components, and tightened the desktop layout to keep the terminal-first surface denser with less vertical waste.
- Added friendlier frontend Tauri error normalization so auth, host-trust, network, agent, validation, and transport failures now surface with operator-oriented guidance instead of raw command strings.
- Added dismissible top notices with auto-expiring success/error timing so transient action feedback stays visible without permanently consuming vertical space.
- Reduced `apps/desktop/src/App.tsx` again by extracting notice lifecycle, timeline signal filtering, workspace panel rendering, and empty-shell fallback into dedicated frontend hooks/components.
- Added explicit operator-facing empty states for diagnosis, timeline filtering, artifact capture, and initial workspace load failure so the desktop shell stays readable when runtime evidence is partial.
- Expanded frontend error copy with source-aware operator hints for command submission, reconnect, host trust, host config, agent config, and live-state refresh failures.
- Split the remaining HostRail form state out of `App.tsx` into a dedicated `useHostRailState` hook and grouped HostRail props around agent settings, saved host defaults, and session-only overrides.
- Reduced `apps/desktop/src/App.tsx` again to about 200 lines by moving host/config/session-override orchestration into that hook and by tightening HostRail prop boundaries.
- Cleared stale diagnosis context packets when no active session exists so the artifacts view no longer carries over old SSH session evidence after disconnect.
- Hardened live workspace refresh so the selected host falls back to a valid current host when inventory changes and terminal tail state now clears correctly when the active SSH session no longer has buffered output.
- Cleared cached context packets on packet-fetch failure as well, avoiding stale artifact rendering when a diagnosis packet disappears between real SSH session transitions.
- Replaced the old silent `New host` behavior with an explicit create-host dialog that lets operators enter SSH connection details up front and choose `Save`, `Connect`, or `Cancel` before any host record is created.
- Added a direct create-and-connect flow for new hosts so Talon can persist a host/config pair and immediately open a real SSH session from the same modal input without forcing a second pass through HostRail.
- Added a `Manage hosts` dialog from the top bar so operators can edit or delete saved hosts while disconnected; the dialog presents a left-side host list and a right-side saved-config editor with password management.
- Restored and expanded Rust regression coverage for context shaping, stream-tail truncation, command marker parsing, non-zero failure capture, and connection-issue classification; `cargo test` now passes again.
## In Progress
- Continuing to reduce the remaining size of `App.tsx` and to harden diagnosis/trust UX now that backend internals and core test coverage are stable.

## Next Steps
1. Reduce HostRail complexity further by splitting its inventory, saved-config, and session-override sections into smaller presentational components.
2. Add deeper Rust-side coverage around diagnosis cache invalidation and trust-confirmation state transitions.
3. Continue UI cleanup only where it improves operation of the provider, host management, trust, credential, command, and failure-context flows.
## Risks And Open Questions
- `ssh.exe` is now the selected transport for the first real backend path, which avoids new Rust SSH crate dependencies but creates Windows/OpenSSH-specific assumptions that may need abstraction later.
- Strict host key checking remains enabled; Talon now has an explicit operator-confirmed trust flow, but fingerprint refresh and repeat-trust UX still need more hardening.
- Password auth is now supported in the product transport, but end-to-end desktop verification against the external host still depends on running the Tauri shell against that target.
- Child `ssh.exe` processes launched from `cargo test` do not inherit unrestricted network access in the current execution environment, so automated Rust-side network tests for the external host must remain opt-in / ignored here.
- Frontend verification is available via Node, but full desktop runtime verification beyond local probes still depends on local operator access to reachable SSH targets. In this session, `sshd` was stopped and `ssh-agent` was disabled on the local machine.

## Working Rules
- Keep execution human-confirmed.
- Bias toward read-only diagnostics first.
- Keep docs updated alongside code changes.
- Commit and push each meaningful phase so project state is recoverable.












