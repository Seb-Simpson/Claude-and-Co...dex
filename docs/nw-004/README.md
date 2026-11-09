# NW-004 — Chapter One: The Awakening

This is a phased production package for the complete chapter, based on integrated
main `7db740e83a9bd6e8b2b5acd1423bf4114e3980c1`. **It is not a finished chapter.**
The title screen, loading sequence, audio settings, Blender assets and playable
NW-002A ward remain the running game until the chapter's production dependencies
and adapters have been implemented and verified.

## Reading order

1. [Actual repository audit](AUDIT.md): existing, partial and missing capabilities.
2. [Complete narrative treatment and chronology](NARRATIVE.md).
3. [Dialogue, cinematic cue sheet and voice direction](DIALOGUE.md).
4. [Map and asset production handoff](MAP-AND-ASSETS.md).
5. [Versioned interface proposal and file ownership](INTERFACES.md).
   [Compatibility with Claude's published NW-004A handoff](CLAUDE-HANDOFF.md).
6. [Implementation phases and acceptance matrix](PRODUCTION.md).
7. [Implementation and verification report](IMPLEMENTATION.md).
8. [Detailed Patient sequence, encounter API and acceptance](PATIENT-CHASE.md).

The treatment precedes the implementation of chapter logic. Source-level proposals
are explicitly distinguished from the contracts already installed in the game.
Claude's acceptance of the new cross-owner interface is **pending**; neither a
document nor a passing unit test constitutes that agreement.

## Delivery boundary

The first phase supplies independently testable, deterministic gameplay logic,
reusable camera/dialogue transport, real gameplay camera/input leases, core
checkpoint serialization, a staged Nurse controller and dedicated tests. It also
provides the complete production specification for Claude's Fractured Ward map.
It does not register an unfinished chapter module or silently substitute temporary
geometry, camera staging or robotic speech for Claude's production work.

All four acts, five cinematics, Nurse encounter, records/power puzzle, Patient
climax, five safe checkpoints including completion, Save/Continue and recorded
playtesting remain acceptance requirements. The 20–30 minute first-time target
must be measured in the combined chapter; no delay in the progression logic is
allowed to manufacture that duration. Do not start Chapter Two.

No automatic merges. The draft pull request is the concrete handoff for interface
review and production coordination; later implementation phases must use the
accepted revision, not independent competing contracts.
