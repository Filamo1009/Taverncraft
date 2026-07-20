# Taverncraft branding and compatibility

Taverncraft 酒馆工坊 is the public product and project name. User-facing pages,
documentation, packages, install commands, desktop/mobile labels, release artifacts,
and new integrations should use `Taverncraft` or `Taverncraft 酒馆工坊`.

The project is based on Luker and remains licensed under AGPL-3.0-or-later. See the
[Taverncraft provenance notice](https://github.com/Filamo1009/Taverncraft/blob/release/NOTICE.md)
for the full statement.

## Compatibility policy

Existing integrations and user data may depend on legacy identifiers. The following
names are therefore compatibility contracts rather than current branding:

- `globalThis.Luker` remains as a deprecated alias of `globalThis.Taverncraft`.
- `X-Luker-Export-Warning` remains alongside `X-Taverncraft-Export-Warning`.
- Existing `luker_*` configuration keys, storage paths, CSS hooks, command aliases,
  Android package identifiers, and plugin API names remain readable.
- `Luker System` remains accepted when reading old chats or TTS settings.
- The `luker` CLI command remains an alias of the primary `taverncraft` command.

New code must use Taverncraft identifiers. A legacy identifier may only be added or
retained when it is needed to read existing data or keep an external integration
working. Compatibility aliases can be removed only through a documented migration.
