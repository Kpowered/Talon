# Talon Roadmap

## Phase 0 — Product bootstrap
- Define product thesis
- Lock MVP scope
- Create repo structure
- Choose desktop stack

## Phase 1 — Local prototype
- Basic desktop shell
- Static server list
- Embedded terminal view
- Mock AI side panel
- Fake context payload rendering

## Phase 2 — Real SSH session integration
- SSH connect/disconnect
- PTY rendering
- session metadata capture
- command boundary heuristics

## Phase 3 — Failure-aware AI loop
- detect non-zero exits
- output tail capture
- prompt builder
- structured diagnosis response

## Phase 4 — Read-only deep diagnostics
- allow AI to request safe diagnostics:
  - `systemctl status`
  - `docker ps`
  - `docker logs --tail`
  - `ss -lntp`
  - `df -h`
- explicit user confirmation per action or per host policy

## Phase 5 — Quality of life
- host groups/tags
- saved incident threads
- reusable runbooks
- host-level memory

## Future
- command application with confirmation
- rollback-aware actions
- mobile companion
- team/shared environments
