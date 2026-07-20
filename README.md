# Taverncraft 酒馆工坊

Taverncraft is a moddable world-simulation and interactive narrative engine built on
[Luker](https://github.com/funnycups/Luker), which is itself derived from
[SillyTavern](https://github.com/SillyTavern/SillyTavern). It keeps the established
character-card, lorebook, preset, and extension ecosystem while adding authoritative
world state, inspectable prompt assembly, stronger long-term memory, and a validated
single-NPC story path. Multi-NPC autonomous simulation is future work, not a current
Phase 1 capability.

## Start here

- **New users / 新用户**: [AI 酒馆完整使用说明与功能优势](docs/zh-CN/guide/complete-user-manual.md)
- **Install and connect a model**: [Getting started](docs/guide/getting-started.md) · [简体中文快速开始](docs/zh-CN/guide/getting-started.md)
- **Understand the Luker/SillyTavern improvements**: [Improvement overview](docs/improvements/overview.md) · [简体中文改进总览](docs/zh-CN/improvements/overview.md)
- **Operate World Engine safely**: [World Engine guide](docs/features/world-engine.md) · [简体中文世界引擎指南](docs/zh-CN/features/world-engine.md)
- **Maintain or extend the project**: [Developer maintenance map / 开发维护地图](docs/development/maintenance-map.md)
- **Check the acceptance evidence**: [Phase 1 development and acceptance plan](docs/development/phase1-single-npc-world-engine.md)

### Where to make the next change

| Change area | Start with | Source/test map |
| --- | --- | --- |
| Character cards, World Info, personas, presets, or chat | [User feature catalog](docs/zh-CN/guide/complete-user-manual.md#角色世界设定与提示词) | [Compatibility and module map](docs/development/maintenance-map.md#按改动类型定位) |
| World state, rollback, Post-History, prompt inspection, or memory bridge | [World Engine acceptance plan](docs/development/phase1-single-npc-world-engine.md) | [World Engine source map](docs/development/maintenance-map.md#world-engine-源码地图) |
| Memory Graph, Orchestrator, card/preset editors, Skills, or CardApp | [Advanced feature catalog](docs/zh-CN/guide/complete-user-manual.md#ai-创作与自动化工具) | [Luker capability map](docs/development/maintenance-map.md#luker-能力地图) |
| Persistence, storage engines, generation delivery, auth, or networking | [Improvement overview](docs/improvements/overview.md) | [Change routing table](docs/development/maintenance-map.md#按改动类型定位) |
| Plugin or extension API | [Extension API reference](docs/development/extension-api/index.md) | [Plugin integration guide](docs/development/extension-api/plugin-integration.md) |
| Branding, compatibility aliases, release notes, or docs | [Branding policy](docs/development/branding-and-compatibility.md) | [Documentation update rules](docs/development/maintenance-map.md#文档更新规则) |

Every user-visible change should update the relevant user guide, development contract,
tests, and changelog. The maintenance map records the expected path from a root README
entry to implementation and verification.

## World Engine (Phase 1)

This release adds a user-controllable, single-NPC world engine on top of Taverncraft's existing
SillyTavern-compatible chat flow. It supports Character Card V1/V2/V3 and
World Info round-tripping, inspectable prompt layers, authoritative world
state, rollback-aware Memory Graph integration, and validated state backup and
restore. Taverncraft's multi-agent features remain available but are not part of the
Phase 1 path and stay disabled by default.

Automated gates, synthetic 200-turn runs, and the authorized real-model 50-turn gate
passed on 2026-07-20 with no P0/P1 issue. The Phase 1 completion definition still
retains final user confirmation.

- [World Engine user and operations guide](docs/features/world-engine.md)
- [Phase 1 development and acceptance plan](docs/development/phase1-single-npc-world-engine.md)
- [简体中文使用与运维指南](docs/zh-CN/features/world-engine.md)
- [完整中文使用说明与优势总结](docs/zh-CN/guide/complete-user-manual.md)

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
