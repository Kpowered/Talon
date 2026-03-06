# @talon/ssh

SSH connection and PTY/session primitives for Talon.

## Current status
Early skeleton stage.

## Implemented in this phase
- First-pass package contracts for host config, session lifecycle events, and failure capture hooks in `src/contracts.ts`
- Shared intent boundary for a future workspace state provider

## Planned responsibilities
- host connection lifecycle
- PTY stream handling
- shell metadata capture
- command boundary detection hooks
- failure capture and packaging triggers

## Next step
Replace the desktop mock session store with a real SSH-backed implementation that emits these lifecycle events.
