# World Engine (Phase 1)

World Engine is a user-controllable, local-first single-NPC story engine built on Taverncraft's
SillyTavern-compatible character, lorebook, persona, preset, and chat flows. It
adds a constrained and auditable world state without replacing the original
card or chat formats.

Phase 1 deliberately does not run multiple autonomous NPCs, distance-based NPC
simulation, map pathfinding, multiplayer, or untrusted MOD code. Taverncraft's
multi-agent components remain installed but are disabled by default in this
product path.

## Requirements and startup

- Node.js 20.18.1 or newer.
- A local Taverncraft data directory with normal write access.
- For real dialogue, an OpenAI-compatible connection configured in Taverncraft's
  Connection Manager. Never place an API key in a character card, world book,
  chat export, state backup, test fixture, or Git.

From the repository root:

```bash
npm ci
npm start
```

Open the local URL printed by Taverncraft, import a character card, open a chat, then
open the Extensions drawer and verify **World Engine** is enabled. It can be
disabled per installation. Memory Graph is a separate opt-in switch; it is not
enabled automatically.

## SillyTavern compatibility

World Engine accepts Character Card V1/V2/V3 JSON and PNG, embedded Character
Books, standalone World Info, personas, presets, and JSONL chats. When both
`chara` and `ccv3` PNG metadata exist, `ccv3` is authoritative. Unknown card,
extension, and lorebook-entry fields are preserved on import/edit/export.

The original character-card system prompt and `post_history_instructions` are
not rewritten. World Engine Post-History is an additional transparent layer
with global, model-preset, character, and chat scopes. The Request Inspector
shows the effective source, prompt order, token estimate, and truncation.

## World state and model operations

The State Inspector shows the current clock, location, player, active NPC,
items, relationships, tasks, flags, and extension namespaces. The model cannot
replace this object directly. It may only propose validated `WorldOperationV1`
operations through native tool calls, or through the strict tagged JSON
fallback when tools are unavailable.

Every accepted operation records its expected hash, result hash, source
message, swipe, and floor. Editing, deleting, regenerating, switching swipes,
or branching restores the matching state and Memory Graph view. Ordinary prose
that resembles JSON cannot mutate the state.

## Backup, restore, and restart

Use two complementary backup paths:

1. Use Taverncraft's normal data backup for characters, chats, personas, presets,
   secrets, extension settings, and auxiliary state.
2. In World Engine, choose **Export state backup** for a portable snapshot of
   the current authoritative state.

The state file uses the `world-engine-state-backup-v1` schema and contains only
the normalized state, source chat/character labels, timestamp, and SHA-256
state hash. It does not contain connection settings or API keys.

To restore a state snapshot, open the intended character chat, choose
**Validate and import backup**, and select the JSON file. Imports larger than
5 MB, malformed JSON, unsafe object keys, unsupported schemas, or mismatched
hashes are rejected before the current state is changed. A successful import
creates a new commit at the current chat floor, so later history operations
retain normal rollback semantics.

After an application restart, reopen the same character and chat. Verify the
selected swipe, visible history, World Engine state hash, Memory Graph status,
persona lock, and model preset before continuing. API secrets remain in
Taverncraft's local secret/connection storage and are not part of portable exports.

## Migration and rollback

Importing existing SillyTavern data does not require rewriting it. Back up the
source data first, then use Taverncraft's existing migration/import flow. World
Engine state is stored in its own Floor State namespace and adds extension
metadata without deleting original card or chat fields.

Before changing storage backends or updating from upstream Taverncraft:

1. Create a full Taverncraft backup and export important World Engine states.
2. Record the current branch/commit and run the Phase 1 regression gates.
3. Apply the upstream or storage migration.
4. Reopen a known chat and compare its state hash, active swipe, memory sources,
   world-book activation trace, and Request Inspector layers.

To leave World Engine, disable the extension and export the chat/card in normal
SillyTavern-compatible formats. The additional extension fields are preserved
but ignored by clients that do not understand them. Keep a data backup when
moving to clients whose unknown-field preservation has not been verified.

## Privacy and security

- Keep the server local unless Taverncraft's authentication and network controls are
  configured for the intended users.
- Request Inspector metadata is bounded and allow-listed before storage, then
  removed before provider dispatch.
- State and Post-History exports exclude API keys, cookies, authorization
  headers, and connection profiles.
- Never import state or MOD data from an untrusted source without reviewing it.
  Phase 1 validates declarative state data and does not execute MOD code.
- Model output is untrusted input. Invalid, conflicting, stale-hash, or
  unauthorized operations are rejected without mutating the current state.

## Known limitations

- The authorized real-model 50-turn gate and synthetic 200-turn runs passed on
  2026-07-20. These runs validate the tested scenario, not every provider or a
  general guarantee of narrative quality; final user confirmation remains in the
  Phase 1 completion definition.
- Only one active NPC is accepted in Phase 1. Far-away NPC scheduling and
  catch-up simulation belong to later work.
- Memory Graph can add model calls and token cost when enabled. It remains
  explicitly opt-in.
- Token counts shown by local inspection are estimates; provider tokenization
  and limits remain authoritative.
- The strict tagged-operation fallback is less robust than native tool calls.
- MySQL and PostgreSQL require external services and are outside the local
  filesystem/SQLite Phase 1 acceptance path.
- Third-party SillyTavern frontend extensions and arbitrary executable MODs are
  not guaranteed compatible.

## License and acceptance status

This downstream work retains Taverncraft's AGPL-3.0 license, copyright notices, and
source structure. Review AGPL source-offer obligations before distribution or
network hosting.

The authoritative implementation and acceptance checklist is the
[Phase 1 plan](../development/phase1-single-npc-world-engine.md). A green local
test run does not by itself mean Phase 1 is accepted. The real-model gate has
passed, and final user confirmation remains required by the completion definition.
