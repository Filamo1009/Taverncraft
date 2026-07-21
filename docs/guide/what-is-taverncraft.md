# What is Taverncraft

Taverncraft is a deeply refactored world-simulation and roleplay platform based on [Luker](https://github.com/funnycups/Luker), which is derived from [SillyTavern](https://github.com/SillyTavern/SillyTavern). It retains SillyTavern's mature character card ecosystem and data format compatibility while introducing extensive innovations in authoritative world state, data transfer architecture, extensibility, and built-in tooling.

Taverncraft supports the standard SillyTavern data paths covered by the current
compatibility suite, including Character Card V1/V2/V3, World Info, personas,
presets, and JSONL chats. Taverncraft-specific state is additive and may be ignored
by other clients. Back up before migrating or downgrading, and do not assume arbitrary
third-party extensions preserve every field without verification.

## Why Taverncraft

SillyTavern is an excellent roleplay frontend with an active community and a rich character card ecosystem. Building on that foundation, Taverncraft introduces systematic improvements in the following areas:

### More Efficient Data Transfer

Most save operations in SillyTavern use full-payload transfers — every message edit, settings toggle, or world info change sends the complete data to the backend. For cloud-deployed users, this means significant bandwidth consumption.

Taverncraft introduces an incremental sync mechanism that uniformly uses patch endpoints compliant with the [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) standard. Toggling a plugin setting that previously transferred 3 MB of data now takes less than 200 bytes. Save operations also support debounced triggering and conflict detection, fundamentally preventing data corruption caused by concurrent writes.

### Stronger Extensibility

Taverncraft provides richer infrastructure for plugin developers: character/preset state APIs, managed regex providers, unified extension injection settings, a function call runtime, and more. Plugins can conveniently reuse the user's existing API and chat completion presets without redundant configuration.

### Built-in Professional Tooling

Taverncraft ships with several professional tools designed for roleplay scenarios — Memory Graph, multi-agent orchestration, character card editing assistant, search plugins, and more — all ready to use out of the box without installing third-party extensions.

## Core Features Overview

### Memory Graph

A character memory system based on knowledge graph structures. It organizes events, characters, locations, storylines, and other information from roleplay sessions into a graph structure, enabling intelligent memory recall through either LLM-driven multi-hop exploration or semantic vector retrieval with optional rerank. The recall model finds the most relevant memory nodes for the current storyline and injects them into the creative context.

→ [Memory Graph Documentation](/features/memory-graph)

### Orchestrator

Before the creative LLM generates a response, agents can analyze and orchestrate the
plot. Five runtime modes are available: Spec, Single Agent, Agenda, Loop, and Director.
Most modes inject a compact capsule for the main model; Director takes over writing the
final message. Character binding and file-level import/export capabilities vary by mode;
see the mode documentation for the current contract.

→ [Orchestrator Documentation](/features/orchestrator/)

### Character Card Editing Assistant (CEA / CardApp Studio)

An AI-assisted character card editing tool with an integrated CodeMirror 6 code editor. It supports editing character cards and world info through natural language conversation, with diff-based approval for each batch of changes. When a character card is updated, it automatically detects world info changes and offers intelligent sync options. Regular cards use the popup editor; cards with an embedded CardApp open in the more capable Studio.

→ [CEA Overview](/features/card-editor/)　·　[Popup](/features/card-editor/popup)　·　[CardApp Studio](/features/card-editor/studio)

### Search Tools

Provides web search capabilities for AI, supporting search engine backends like DuckDuckGo, SearXNG, and Brave Search. Two operating modes are available: as a callable tool for the creative LLM, or as a pre-request agent that automatically searches before generation and writes results into world info.

→ [Search Tools Documentation](/features/search-tools)

### Preset Decoupling

In SillyTavern, API presets and chat completion presets are switched together. Taverncraft decouples them — switching API connections no longer changes the chat completion preset, allowing you to freely mix and match different LLM backends with different prompt presets.

### Incremental Sync

Saving world info, chat logs, user settings, and other content uniformly uses patch endpoints compliant with the RFC 6902 standard, dramatically reducing data transfer volume. Combined with debounced triggering and conflict detection (409 responses), it ensures data consistency in multi-device scenarios.

### Function Call Runtime

A unified function call / tool call runtime supporting two modes:

- **Native tool calls**: Compatible with native tool call formats from OpenAI, Claude, Gemini, and other APIs
- **Plain-text function calls**: Implements tool calls through a text protocol, suitable for models that don't support native tool calls

### CardApp

An embedded application runtime within character cards. Allows character cards to carry custom application logic, providing context APIs and lifecycle management.

### Prompt Groups & Preset Groups

The preset manager and prompt manager support collapsible grouping systems for convenient organization and management of large numbers of presets and prompt entries.

### Card-Bound Presets and Personas

Character cards can bind dedicated chat completion presets and user personas. Bound presets and personas are independent of the global list, won't pollute the user's global configuration, automatically disappear when the character card chat is closed, and can be imported/exported with the character card. Card creators no longer need to ask users to manually import dedicated presets.

### Request Inspector

A per-user generation request diagnostic tool that can trace request details for all backends (including image generation), making debugging and troubleshooting easy.

### Authentication and Quotas

Supports GitHub / Discord OAuth login. Administrators can configure storage quotas for each user. Discord login can additionally require users to be members of a specific server or hold specific roles.

::: tip More Features
Taverncraft includes many other improvements: Undo Toast system, Chat Persona Lock, dynamic model lists, World Info activation chain tracing, preset-associated world info, extensive mobile / Android optimizations, startup performance improvements, and more. These features are covered in detail on their respective pages.
:::

## Compatibility

Taverncraft maintains tested compatibility with the following standard SillyTavern data paths:

| Data Type | Compatibility |
|---------|--------|
| Character Cards (PNG/JSON) | V1/V2/V3 import/export and unknown-field round-trip covered |
| World Info / Lorebook | Embedded and standalone paths covered |
| Chat Logs | JSONL import/export and normal chat operations covered |
| Chat Completion Presets / Personas | Supported; verify bound Taverncraft extension state after migration |
| Third-party Extensions | Uses the compatible loading surface, but arbitrary extensions are not guaranteed |
| User Settings | Supported; migrate onto Taverncraft defaults instead of overwriting config blindly |

::: info Bidirectional Migration
Taverncraft-exclusive data such as World Engine state, Memory Graph, and
orchestration configuration is stored as additive state or extension metadata. A client
that does not understand it may ignore it, and unknown-field preservation varies by
client. Always keep a backup and verify a known character/chat after either direction
of migration.
:::

## Next Steps

Ready to get started?

→ [Getting Started](/guide/getting-started) — Install and deploy Taverncraft
