# Tavern runtime dependencies

This directory contains the versioned Tavern Helper scripts installed by
`npm run tavern:deps:install`.

The installer manages four dependencies for one local TavernCraft profile:

- Tavern Helper (`JS-Slash-Runner`)
- ST-Prompt-Template
- MVU / MagVarUpdate global loader
- `mvu_zod` schema registration bridge

Run it from the repository root:

```sh
npm run tavern:deps:install
```

The default target is `data/default-user`. A different data root or user can
be selected explicitly:

```sh
npm run tavern:deps:install -- --data-root /absolute/path/to/data --user another-user
```

Existing extension repositories are updated only when they are on the expected
branch, use the expected remote, and have no local changes. The installer never
resets extension files. Before changing `settings.json`, it creates a timestamped
backup alongside the file. Re-running the command is safe and does not duplicate
the global scripts.

`mvu_zod` deliberately does not register a generic schema. Each MVU character
card must define and register its own Zod schema through `window.MvuZod`.
