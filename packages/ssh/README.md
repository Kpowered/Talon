# @talon/ssh

SSH connection and PTY/session primitives for Talon.

## Current status
Early skeleton stage with initial frontend/backend connection contracts, a backend-managed preview session registry, and command stream scaffolding.

## Implemented in this phase
- First-pass package contracts for host config, session lifecycle events, and failure capture hooks in `src/contracts.ts`
- Shared intent boundary for a future workspace state provider
- A matching Rust-side managed session registry now exists in the desktop backend
- Terminal buffer and command submission scaffolding exist in the backend so a live transport can plug into stable interfaces

## Planned responsibilities
- host connection lifecycle
- PTY stream handling
- shell metadata capture
- command boundary detection hooks
- failure capture and packaging triggers

## Next step
Replace the managed preview command flow with a real SSH-backed implementation that emits lifecycle events and terminal stream updates from live sessions.
