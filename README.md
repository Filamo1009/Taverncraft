# Taverncraft 酒馆工坊

Taverncraft is a moddable world-simulation and interactive narrative engine built on
[Luker](https://github.com/funnycups/Luker), which is itself derived from
[SillyTavern](https://github.com/SillyTavern/SillyTavern). It keeps the established
character-card, lorebook, preset, and extension ecosystem while adding authoritative
world state, inspectable prompt assembly, stronger long-term memory, and a staged path
from a single NPC to a multi-actor simulated world.

## World Engine (Phase 1)

This branch adds a user-controllable, single-NPC world engine on top of Taverncraft's existing
SillyTavern-compatible chat flow. It supports Character Card V1/V2/V3 and
World Info round-tripping, inspectable prompt layers, authoritative world
state, rollback-aware Memory Graph integration, and validated state backup and
restore. Taverncraft's multi-agent features remain available but are not part of the
Phase 1 path and stay disabled by default.

- [World Engine user and operations guide](docs/features/world-engine.md)
- [Phase 1 development and acceptance plan](docs/development/phase1-single-npc-world-engine.md)
- [简体中文使用与运维指南](docs/zh-CN/features/world-engine.md)

## Why Taverncraft

- Reliable generation lifecycle: backend-owned generation jobs keep running and persisting even if the frontend disconnects/reloads, and active output can be recovered after reconnect.
- Incremental persistence: chat/message and settings changes are patch-first instead of repeated full-save payloads.
- Better plugin ergonomics: prompt-preset-aware message assembly, world-info simulation/finalization hooks, and chat-bound plugin state helpers.
- Built-in advanced plugins: `Orchestrator` (multi-agent planning) and `Memory` (graph memory + recall).

## Developer Quick Start (Plugins)

Use `Taverncraft.getContext()` or the SillyTavern-compatible `getContext()` surface as
the primary integration API. The legacy `Luker` global remains available as a deprecated
alias so existing extensions and CardApps continue to run.

- [Extension API reference](docs/development/extension-api/index.md)
- [Plugin integration guide](docs/development/extension-api/plugin-integration.md)

- Persistence helpers:
  - `appendChatMessages(messages)`
  - `patchChatMessages(operations)`
  - `saveChatMetadata(withMetadata?)`
  - `getChatStateBatch(namespaces, options?)`
  - `getChatState(namespace, options?)`
  - `patchChatState(namespace, operations, options?)`
  - `updateChatState(namespace, updater, options?)`
  - `deleteChatState(namespace, options?)`
- Prompt/world-info helpers:
  - `buildPresetAwarePromptMessages(options)`
  - `simulateWorldInfoActivation(options?)`
  - WI helper payloads are entries-first: use `worldInfoBeforeEntries` / `worldInfoAfterEntries`
  - For preset/world-info assembly semantics, see the
    [presets and prompts reference](docs/development/extension-api/presets-and-prompts.md).
- Generation lifecycle hooks (`context.eventSource.on(context.eventTypes.*)`):
  - `GENERATION_BEFORE_WORLD_INFO_SCAN`
  - `GENERATION_AFTER_WORLD_INFO_SCAN`
  - `GENERATION_WORLD_INFO_FINALIZED`
  - `GENERATION_BEFORE_API_REQUEST`
  - `GENERATION_STARTED` / `GENERATION_STOPPED` / `GENERATION_ENDED`
  - `MESSAGE_EDITED` → `(messageId, meta?)`
  - `MESSAGE_UPDATED` → `(messageId)`
  - `MESSAGE_DELETED` → `(chatLength, meta?)`

### Compatibility identifiers

Some internal identifiers intentionally retain the `luker` prefix, including state
sidecars, configuration keys, extension fields, tool names, and generation endpoints.
They are stable compatibility contracts rather than the product name. New public UI and
documentation use Taverncraft; legacy identifiers will only migrate through versioned,
backward-compatible adapters.

## Android (Backend-in-App)

Taverncraft now includes an Android app workspace at `android-app/` that runs backend locally on the phone and opens it via WebView (`127.0.0.1`).

- Android project docs: [`android-app/README.md`](android-app/README.md)
- CI workflow: [`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml)

Release model:
- Every commit/push builds debug APK artifacts.
- Tag pushes build signed release APK and publish/update a GitHub Release for that tag.

## Storage backends

Taverncraft supports four storage backends, selectable in `config.yaml`:

- **`fs`** (default): every resource lives in per-user files on disk. Simplest for single-user installs; matches upstream SillyTavern.
- **`sqlite`**: each user gets a per-user `luker-storage.sqlite` file (WAL mode, online-backup-friendly). Same single-user shape as `fs` but with stronger consistency guarantees.
- **`mysql`** / **`postgres`**: shared-DB backends keyed by `handle` column. Designed for multi-user servers.

In db modes, **structured resources** (chats, settings, presets, world info, themes, groups, stats) live in the engine. **Binary resources** (character cards, avatars, backgrounds, user uploads, plugin extension trees, vector databases) stay on disk under `<dataRoot>/<handle>/` even in db mode — they're a poor fit for SQL columns. See `src/storage/README.md` for the full resource-vs-storage table.

Backup ZIPs in db mode include an `_engine_dump.bin` engine-side dump alongside the on-disk file tree. Restore works in-engine; switching engines requires `scripts/storage-migrate.js`.

## Upstream projects and credits

- [Luker](https://github.com/funnycups/Luker) — the direct upstream codebase.
- [SillyTavern](https://github.com/SillyTavern/SillyTavern) — the upstream ecosystem and
  compatibility foundation.
- [TavernAI](https://github.com/TavernAI/TavernAI) — an earlier upstream project.

Taverncraft is independently maintained and is not affiliated with or endorsed by the
Luker or SillyTavern maintainers. See [NOTICE.md](NOTICE.md) for provenance and
modification notices.

## License

GNU AGPL-3.0. Modified versions served over a network must offer users access to the
corresponding source code. Copyright notices and third-party credits remain in their
original files.
