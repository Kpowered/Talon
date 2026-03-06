# AGENTS.md

## Project Intent
Talon is an AI-native SSH troubleshooting desktop app. The primary implementation priority is the real SSH path: connection lifecycle, terminal streaming, command boundary detection, failure capture, and AI-ready context packaging.

## Working Rules
- Keep progress durable. After each meaningful implementation phase, create a git commit and push it to the remote repository.
- Do not leave important work only in local state.
- Keep documentation updated alongside code changes.
- Prefer advancing the core product path over expanding demo-only UI behavior.
- Bias toward read-only diagnostics and explicit operator confirmation.

## Documentation Requirements
Update these files as the project evolves:
- `docs/STATUS.md`: current stage, completed work, in-progress work, next steps, risks.
- `docs/ARCHITECTURE.md`: actual implemented architecture and temporary scaffolding, not just intended future design.
- package README files when a package gains real responsibilities or changes phase.

Documentation should stay structured, complete, and easy to scan.

## Git Workflow
- Commit each meaningful phase with a concrete message.
- Push after each such commit so the repository can be resumed from another machine.
- Do not rely on unpushed local changes for continuity.

## Execution Priorities
1. Real SSH connection management
2. Terminal stream handling
3. Command completion and non-zero exit detection
4. Failure context packaging
5. Agent integration and diagnosis pipeline
6. UI refinement after the core path is real

## Handoff Expectations
A new session should be able to resume by reading:
1. `docs/STATUS.md`
2. `docs/ARCHITECTURE.md`
3. the latest commits on `main`

## Current Environment Constraint
If local build or verification is blocked by missing tools such as `npm` or `cargo`, record that constraint in `docs/STATUS.md` and continue making safe structural progress where possible.
