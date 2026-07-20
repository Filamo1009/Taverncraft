# 从 SillyTavern 迁移

Taverncraft 是 Luker 与 SillyTavern 的下游项目，保留当前兼容测试覆盖的标准数据路径。角色卡、世界书、Persona、预设和 JSONL 聊天通常可以直接迁移，但必须保留备份，并单独验证第三方扩展和 Taverncraft 专属状态。

::: tip 在 Android 上从 Termux 迁移？
本指南适用于 PC / Linux / Docker → Taverncraft，以及 **Termux(Sillytavern) → Termux(Taverncraft)**，两端共享文件系统，按下面步骤复制 `data/` 即可。

只有 **Termux → Taverncraft APK** 因为 Android 沙盒隔离需要走 `/sdcard` 中转，请参考 [从 Termux 迁移到 Taverncraft APK](/zh-CN/guide/migration-from-termux)。
:::

## 迁移步骤

### 1. 备份现有数据

在迁移之前，建议备份 SillyTavern 的 `data/` 目录：

```bash
cp -r SillyTavern/data/ SillyTavern-data-backup/
```

### 2. 安装 Taverncraft

按照 [快速开始](/zh-CN/guide/getting-started) 中的步骤安装 Taverncraft。

### 3. 复制数据目录

将 SillyTavern 的 `data/` 目录复制到 Taverncraft 的数据根目录下（默认为 `./data`）：

```bash
cp -r SillyTavern/data/* Taverncraft/data/
```

如果你在 `config.yaml` 中自定义了 `dataRoot`，请复制到对应路径。

### 4. 迁移配置文件

将 SillyTavern 的 `config.yaml` 中你自定义过的配置项迁移到 Taverncraft 的 `config.yaml` 中。建议以 Taverncraft 的默认配置文件为基础，逐项迁移你的自定义值，而不是直接覆盖整个文件。

### 5. 迁移第三方扩展

如果你安装了第三方扩展，将 SillyTavern 的全局扩展目录复制到 Taverncraft：

```bash
cp -r SillyTavern/public/scripts/extensions/third-party/* Taverncraft/public/scripts/extensions/third-party/
```

### 6. 复制用户设置（多用户模式）

如果你启用了多用户模式（`enableUserAccounts: true`），用户数据存储在 `data/<用户名>/` 子目录中，目录结构与 SillyTavern 一致，直接复制即可。

### 7. 启动 Taverncraft

```bash
node server.js
```

首次启动时，Taverncraft 会自动识别已有数据并正常加载。

## 数据兼容性

当前兼容测试覆盖以下标准数据路径：

| 数据类型 | 兼容性 | 说明 |
| --- | --- | --- |
| 角色卡（PNG/JSON） | 已测试 | V1/V2/V3、内嵌世界书和未知字段往返 |
| 聊天记录（.jsonl） | 已测试 | 导入导出及常用编辑、Swipe、分支路径 |
| 世界书（World Info） | 已测试 | 内嵌与独立世界书路径 |
| 预设 / Persona | 支持 | 迁移后核对绑定的 Taverncraft 扩展状态 |
| 扩展设置 | 需逐项验证 | 加载界面兼容，但不保证任意扩展直接可用 |
| 群聊 | 继承路径 | 迁移后核对部署中重要的分组聊天 |
| API 密钥（secrets） | 敏感数据 | 只在可信本地安装间迁移，禁止提交或公开文件 |

## Taverncraft 新增的状态文件

Taverncraft 在运行过程中会在数据目录中生成一些额外的**状态文件**，用于存储 Taverncraft 独有功能的数据：

- `.luker-state.<chat_id>.json` — 聊天状态文件，存储增量同步的完整性校验值等
- 角色卡状态文件 — 存储角色绑定预设、记忆图数据、编辑助手会话等
- 预设状态文件 — 存储预设关联的世界书等扩展状态

这些文件**不会影响 SillyTavern 的原始数据**。如果你需要将数据迁回 SillyTavern，只需忽略这些状态文件即可。SillyTavern 不会读取它们，也不会因为它们的存在而出错。

## 注意事项

1. **Node.js 版本**：Taverncraft 要求 Node.js >= 20.18.1。迁移前请以当前 `package.json` 为准。

2. **第三方扩展**：Taverncraft 使用兼容的扩展加载界面，扩展目录位于 `public/scripts/extensions/third-party/`。重要扩展必须逐个测试，不保证任意前端扩展直接可用。

3. **配置文件**：SillyTavern 的 `config.yaml` 与 Taverncraft 的格式兼容，但 Taverncraft 新增了一些配置段（如 `sso`、`hostWhitelist` 等）。`requestProxy` 等配置项是 SillyTavern 已有的，无需额外处理。建议以 Taverncraft 的默认 `config.yaml` 为基础，将你的自定义配置迁移过来。详见 [基础配置](/zh-CN/guide/configuration)。

4. **预设解耦**：Taverncraft 将 API 连接参数与预设分离。迁移后，你的预设仍然正常工作，Taverncraft 会在加载时自动处理字段分类。

5. **迁回其他客户端**：标准导出可由兼容客户端读取，但世界引擎、记忆图和编排器状态可能被忽略。必须保留原始备份，并验证目标客户端会保留未知字段，才能把迁回路径视为无损。

6. **Docker 部署**：如果你使用 Docker 部署，请参考 Taverncraft 提供的 `docker-compose.yml` 参考配置，将数据目录挂载为卷。
