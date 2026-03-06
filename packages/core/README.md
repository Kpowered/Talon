# @talon/core

Shared types, contracts, and business logic for Talon.

## Current status
Initial domain model is in place under `src/domain.ts`.

## Implemented in this phase
- host definitions
- session models
- command failure context schema
- diagnosis response schema
- workspace state contract
- suggested action result contract

## Next step
Split these types into runtime-safe boundaries once the SSH layer and agent layer start producing real data.
