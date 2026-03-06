# Talon PRD

## 1. Product Summary

Talon is an AI-native terminal focused on **server troubleshooting in SSH contexts**.
Its primary value is eliminating the broken loop between terminal errors and external AI consultations.

## 2. Problem

Current workflow when server tasks fail:
- User runs install/deploy/debug commands in SSH
- Command fails
- User manually copies errors into ChatGPT/Claude/etc.
- AI lacks host/session/runtime context
- Suggestions are generic or wrong
- User manually retries commands

This causes delay, confusion, repeated commands, and unsafe guesswork.

## 3. Target Users

### Primary
- Solo operators
- Indie hackers running multiple VPSes
- Developers deploying their own services
- AI-native technical users who use SSH daily

### Secondary
- Small infra/devops teams
- Homelab users
- SRE-minded builders

## 4. Value Proposition

Talon gives users an AI assistant that is:
- aware of the current SSH session
- aware of recent terminal failures
- aware of host-level troubleshooting context
- able to suggest the next safe step without manual copy/paste

## 5. MVP Goals

### Must-have
1. Connect to a server via SSH
2. Display terminal session
3. Capture most recent command, exit code, cwd, stderr/stdout tail
4. Package context into AI prompt
5. Return diagnosis + likely causes + next-step commands
6. Keep execution human-confirmed

### Nice-to-have
- Auto-detect common failure classes (port conflict, permission error, missing package, bad systemd unit, docker start failure)
- Pull suggested logs automatically in read-only mode

## 6. Non-goals

- Replacing IDEs
- Becoming a generic AI code editor
- Autonomous server repair in v1
- Full infrastructure provisioning
- Mobile-first product in v1

## 7. Key User Stories

### Story A — install failure
As a user, when `bash install.sh` fails on a VPS, I want Talon to automatically capture the error and explain what likely failed, so I don’t need to retype the context elsewhere.

### Story B — service won’t start
As a user, when `systemctl restart myservice` fails, I want Talon to suggest the exact next diagnostic commands, so I can move forward immediately.

### Story C — docker deployment issue
As a user, when a container exits unexpectedly, I want Talon to correlate recent command output with docker status/log suggestions.

## 8. Core UX Loop

1. User runs command in SSH session
2. Talon observes result
3. If command fails, Talon shows lightweight prompt: 
   - Explain error
   - Diagnose deeper
   - Suggest fix
4. Talon builds context package
5. AI returns structured response
6. User reviews and optionally executes suggested commands

## 9. Safety Model

### v1
- Read-only diagnosis by default
- No auto-execution of fix commands
- Explicit user confirmation required for any command injection/copy/apply

### Future
- Policy-based trust levels
- Per-host command allowlists
- Rollback scaffolding

## 10. Product Differentiation

### vs Termius
Talon is error-aware and AI-native.

### vs Warp/Kaku
Talon is server-ops-first, not coding-first.

### vs Claude Code / Codex CLI
Talon is a host/session troubleshooting product, not just a terminal agent.

## 11. Success Criteria for MVP

- User can connect to at least one host
- Talon correctly captures failed commands and surrounding output
- AI explanation is context-specific enough to beat generic external chat
- User reaches next diagnosis step with fewer manual copy/paste actions

## 12. Open Questions

- Best SSH/session stack for desktop shell?
- Tauri vs Electron vs terminal-native shell approach?
- How much context should be auto-collected before token/cost/privacy tradeoffs bite?
- Should host memory/history be local-only in MVP?
