# Talon Status

## Goal
Build Talon into an AI-native SSH troubleshooting desktop app that captures failed commands, packages incident context, and keeps remediation operator-confirmed.

## Current Stage
As of 2026-03-07, the repository has moved from a scenario demo to a backend-managed SSH desktop app with a real transport path and direct terminal typing inside a managed terminal surface. The current stabilization pass is focused on live connect-state projection, terminal transcript preservation, lifecycle visibility, managed-command operator control, failure-context quality during interactive SSH sessions, and shrinking the desktop shell toward a denser terminal-first layout.

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
- Replaced the unstable xterm display layer with a managed terminal transcript view so live SSH output no longer clears unexpectedly.
- Reshaped host management into compact floating popovers anchored near the saved-host rail so list, edit, connect, and delete flows no longer take over the main terminal workspace.`r`n- Collapsed saved-host editing to a single compact editor popover: the left rail now remains the only host list, while Manage and right-click Edit both open direct inline editing for the currently targeted host.`r`n- Made the saved-host editor draggable and proportionally resizable so operators can enlarge or reposition it instead of being blocked by a fixed overlay size.`r`n- Repacked the saved-host editor into a denser desktop form by removing the unused region field, compressing header chrome, and regrouping address, port, credentials, and key material onto fewer rows.`r`n- Switched the saved-host editor to auth-driven detail boxes: password auth now reveals a compact password panel, private-key auth reveals the real key-path panel, and tags/fingerprint moved into a collapsible identity section.`r`n- Trimmed host-editor vertical spacing further by removing the identity heading, flattening row gaps, and tightening the password detail card.`r`n- Flattened host-editor secondary sections by removing the remaining tags/fingerprint and auth-card chrome, leaving inline fields and inline auth controls instead of boxed subpanels.`r`n- Fixed the editor grid to pin rows to the top of the floating window so unused vertical space no longer expands the gaps between form rows.`r`n- Reduced per-field vertical occupancy again by forcing grouped editor rows to min-content sizing and zero row-gap in the host editor grid.`r`n- Replaced the editor form grid with a flex-stack layout so row spacing is determined explicitly by sequential blocks rather than implicit CSS grid track sizing.`r`n- Reduced editor dead space further by making the default floating editor height auth-sensitive: smaller for agent mode, taller only when password/private-key details are present.`r`n- Removed the editor close button and proportional resize affordance again, leaving a drag-only floating editor with a smaller default height to keep more of the terminal visible.`r`n- Fully removed host-editor resize behavior from both the React component and CSS so the editor can no longer be resized accidentally by lingering chrome or stale handlers.
- Fixed the desktop window to a non-resizable `1024x768` frame to keep the terminal-first layout stable while UI density is still being refined.
- Added managed-command interrupt support through Ctrl+C and a shared raw-input path back to the SSH transport. Interrupt completion markers now carry shell and cwd metadata, and delayed fallback cleanup preserves a stable busy-state transition when the remote shell does not close the wrapper cleanly. The wrapped command path now emits a completion marker even when the operator interrupts a running command, so busy state can clear cleanly.
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
- The manage-hosts password field now loads the stored host password from the local credential store, supports show/hide and copy actions, and treats an empty password field on `Save host` as an explicit password removal.
- Saving a host from the manage-hosts dialog now persists both host metadata and password changes in one action and auto-closes the dialog on success.
- Restored and expanded Rust regression coverage for context shaping, stream-tail truncation, command marker parsing, non-zero failure capture, and connection-issue classification; `cargo test` now passes again.
- Hardened the managed command input so operators can submit with `Enter`, navigate per-session history with `Up/Down`, clear with `Esc`, and stay focused on the active session without relying on the `Send` button.
- Replaced the shell tail viewer with a managed terminal transcript surface so operators now type directly inside the terminal pane instead of a detached form field.
- Reworked the shell into a single operator-facing managed mode so terminal typing stays direct while Talon command framing, non-zero exit capture, interrupt handling, and failure packaging remain the default path.
- Hardened disconnect-state terminal preservation so polling no longer wipes the visible shell transcript on same-session empty snapshots, and backend SSH wait/exit failures are now written into the terminal buffer for operator review.
- Switched the live SSH transport from `ssh -T` to forced PTY allocation so the remote shell is kept alive as a terminal session instead of a brittle non-PTY stdin/stdout command channel.
- Removed the eager post-connect shell metadata probe from the SSH stdin path so Talon no longer writes bootstrap commands into a just-opened interactive shell before the operator starts typing.
- Frontend runtime selection now prefers the session registry active-session pointer over transient workspace projection fallbacks, reducing cases where the UI appears to drop a just-connected live session.
- Kept the lower-level raw stdin write path internal-only for now rather than exposing it as a first-class operator mode before PTY-grade behavior exists.
- Simplified the connected-session Host Rail into a compact live-session summary so terminal work stays primary and detailed host configuration remains in dialogs instead of the permanent sidebar.
- Restored a delayed one-shot post-connect metadata probe so live sessions refresh `cwd` and `shell` after the SSH transport is up, without reintroducing the earlier transcript-clearing bootstrap noise.
- Distinguished operator-interrupt capture from ordinary command failure capture in the timeline builder so interrupt packets and timeline rows no longer read like generic failures.
- Locked the terminal-first workspace to a stable grid structure across window resize; the app now prefers horizontal overflow and local wrapping instead of collapsing the main layout into different panel arrangements.
- Fixed the desktop window to a single operator baseline of `1024x768` and disabled resize so Talon now opens with a predictable layout footprint instead of drifting across ad hoc window sizes.
- Rebuilt the desktop shell into a fixed Termius-style frame: a narrow always-on left host sidebar, a single terminal-first main workspace, and an on-demand Inspect drawer for timeline, diagnosis, and artifacts.
- Removed the old always-visible multi-panel host/config layout from the main surface so host creation, editing, and deeper configuration now live in dialogs while the live terminal stays primary.
- Reduced layout crowding after the shell rewrite: connection state and in-flight command indicators now live in a compact terminal footer line instead of occupying the upper-right workspace header.
- Continued collapsing the UI toward navigation + terminal: the left host rail is now list-like instead of card-heavy, repeated selected-host blocks were removed, and suggested actions no longer live as a permanent upper-right panel.
- Removed the last top-right host/connect control strip from the main workspace and pinned the terminal status line to the bottom edge so session state now reads like terminal chrome instead of floating page furniture.
- Continued the same cleanup pass by fully removing the top workspace bar, narrowing the left rail again, and reducing the remaining terminal/drawer chrome so the main surface reads closer to a native SSH terminal.
- Added direct host-list interaction for saved servers: double-clicking a host row now connects immediately, and right-click opens a host action menu with connect, edit, and delete.
- Refined host management presentation: the right-click host menu is now styled as a lighter context menu, and the edit-host dialog has been resized into a smaller management card instead of a near full-screen overlay.
- Reworked saved-host management into a scale-oriented side drawer with a searchable host list on the left and a dedicated edit panel on the right, so managing dozens of hosts no longer depends on a blocking center modal.
- Split the same host-management drawer into two levels: opening Manage now defaults to the narrow searchable list, and detailed editing only expands when the operator explicitly opens host details.
## In Progress
- Tightening the new terminal-first shell after the layout rewrite, including spacing density, copy hierarchy, and any regressions around host-management entry points.

## Next Steps
1. Add deeper Rust-side coverage around live transcript tail capture, active-command state, diagnosis cache invalidation, and trust-confirmation state transitions.
2. Refine failure and interrupt context packaging so diagnosis and artifacts keep richer stdout/stderr evidence for both real errors and operator-aborted commands.
3. Continue UI cleanup only where it improves terminal operation, host management, trust, credential, command, and failure-context flows without reintroducing layout churn.
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





























