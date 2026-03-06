# Talon

**AI-native terminal for server troubleshooting**

Talon is not a generic terminal, and not a generic AI chat app.
It is built to help operators diagnose and fix server-side problems **in context**.

## Why Talon

Today, when a deployment or install fails in SSH, the workflow is broken:

1. Run command
2. Hit error
3. Copy stderr
4. Paste into third-party AI
5. Re-explain environment
6. Copy suggestions back into terminal

Talon collapses that loop.

It aims to provide:

- **SSH-native troubleshooting**
- **Error-aware AI assistance**
- **Session context capture**
- **Safe, operator-controlled repair suggestions**
- **Multi-server awareness**

## Product thesis

The terminal should not just be a shell.
It should be a **live incident context surface**.

When something breaks, Talon should already know:

- what command just ran
- what failed
- what the stderr/stdout looked like
- what host this happened on
- what directory and environment were active
- what services/logs are likely relevant

## MVP scope

### Included
- Server list / host registry
- Embedded SSH session
- Command failure capture
- Context packaging for AI diagnosis
- Read-only diagnosis mode
- Suggested repair commands

### Explicitly not in MVP
- Full autonomous repair
- Mobile clients
- Fleet orchestration
- Infra provisioning
- Fancy terminal theming as a priority
- Broad coding IDE features

## Core user

Operators, indie hackers, and developers who manage servers directly and are tired of context-switching to external AI whenever SSH workflows fail.

## First principles

- **Context first**: AI without terminal context is weak
- **Safety first**: read-only diagnosis before automated execution
- **Ops-first**: server deployment and troubleshooting before general coding
- **Human in control**: suggestions first, execution later

## Planned structure

- `apps/desktop` — desktop shell / UI
- `packages/core` — shared types and app logic
- `packages/ssh` — SSH/session primitives
- `packages/agent` — AI context packing and diagnosis pipeline
- `docs` — PRD, architecture, roadmap

## Status

Early project bootstrap.

## Vision sentence

**Talon is the terminal that stays with you when production breaks.**
