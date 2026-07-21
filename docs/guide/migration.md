# Migrating from SillyTavern

Taverncraft is a downstream of Luker and SillyTavern and preserves the standard data
paths covered by its compatibility suite. Migration is usually direct for character
cards, World Info, personas, presets, and JSONL chats, but you must keep a backup and
verify extensions and Taverncraft-specific state separately.

::: tip Migrating from Termux on Android?
This guide covers PC / Linux / Docker → Taverncraft, and **Termux(SillyTavern) → Termux(Taverncraft)** — both sides share the filesystem, so follow the steps below to copy `data/`.

Only **Termux → Taverncraft APK** needs the mobile-specific flow because of Android's sandbox isolation (the data has to pass through `/sdcard`); see [Migrating from Termux to the Taverncraft APK](/guide/migration-from-termux).
:::

## Migration Steps

### 1. Back Up Your Existing Data

Before migrating, it's recommended to back up SillyTavern's `data/` directory:

```bash
cp -r SillyTavern/data/ SillyTavern-data-backup/
```

### 2. Install Taverncraft

Follow the steps in [Getting Started](/guide/getting-started) to install Taverncraft.

### 3. Copy the Data Directory

Copy SillyTavern's `data/` directory to Taverncraft's data root (default: `./data`):

```bash
cp -r SillyTavern/data/* Taverncraft/data/
```

If you've customized `dataRoot` in `config.yaml`, copy to the corresponding path.

### 4. Migrate the Configuration File

Migrate your customized settings from SillyTavern's `config.yaml` to Taverncraft's `config.yaml`. It's recommended to start with Taverncraft's default config file and migrate your custom values one by one, rather than overwriting the entire file.

### 5. Migrate Third-Party Extensions

If you have third-party extensions installed, copy SillyTavern's global extensions directory to Taverncraft:

```bash
cp -r SillyTavern/public/scripts/extensions/third-party/* Taverncraft/public/scripts/extensions/third-party/
```

### 6. Copy User Settings (Multi-User Mode)

If you have multi-user mode enabled (`enableUserAccounts: true`), user data is stored in `data/<username>/` subdirectories. The directory structure is identical to SillyTavern's — just copy them over.

### 7. Start Taverncraft

```bash
node server.js
```

On first launch, Taverncraft will automatically detect the existing data and load it normally.

## Data Compatibility

The current compatibility suite covers the following standard data paths:

| Data Type | Compatibility | Notes |
| --- | --- | --- |
| Character Cards (PNG/JSON) | Tested | V1/V2/V3, embedded books, and unknown-field round-trip |
| Chat Logs (.jsonl) | Tested | Import/export and normal edit/swipe/branch paths |
| World Info | Tested | Embedded and standalone World Info paths |
| Presets / Personas | Supported | Verify bound Taverncraft extension state after migration |
| Extension Settings | Requires verification | Loading surface is compatible; arbitrary extensions are not guaranteed |
| Group Chats | Inherited path | Verify groups important to your deployment after migration |
| API Keys (secrets) | Sensitive | Move only between trusted local installs; verify without publishing the file |

## Taverncraft's Additional State Files

During operation, Taverncraft generates some additional **state files** in the data directory to store data for Taverncraft-exclusive features:

- `.luker-state.<chat_id>.json` — Chat state files storing integrity checksums for incremental sync, etc.
- Character card state files — Storing card-bound presets, Memory Graph data, editing assistant sessions, etc.
- Preset state files — Storing preset-associated world info and other extension state

These files **do not affect SillyTavern's original data**. If you need to migrate data back to SillyTavern, simply ignore these state files. SillyTavern won't read them and won't error due to their presence.

## Notes

1. **Node.js Version**: Taverncraft requires Node.js >= 20.18.1. Verify the current `package.json` before migrating.

2. **Third-Party Extensions**: Taverncraft uses the compatible extension loading surface, with extensions located in `public/scripts/extensions/third-party/`. Test each important extension; arbitrary frontend extensions are not guaranteed.

3. **Configuration File**: SillyTavern's `config.yaml` is format-compatible with Taverncraft's, but Taverncraft adds some new configuration sections (such as `sso`, `hostWhitelist`, etc.). Settings like `requestProxy` already exist in SillyTavern and require no additional handling. It's recommended to start with Taverncraft's default `config.yaml` and migrate your custom settings. See [Configuration](/guide/configuration) for details.

4. **Preset Decoupling**: Taverncraft separates API connection parameters from presets. After migration, your presets still work normally — Taverncraft automatically handles field classification during loading.

5. **Return migration**: Standard exports can be opened by compatible clients, while World Engine, Memory Graph, and Orchestrator data may be ignored. Keep the original backup and verify that the destination preserves unknown fields before treating the return path as lossless.

6. **Docker Deployment**: If you're using Docker, refer to Taverncraft's provided `docker-compose.yml` reference configuration and mount the data directory as a volume.
