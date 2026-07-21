# Taverncraft 开发维护地图

本文是根目录 `README.md` 之后的第二级开发入口。目标不是重复每一份 API 文档，而是让维护者在收到需求或修复缺陷时，能快速定位：

> 用户说明 → 设计/验收契约 → 源码入口 → 回归测试 → 更新日志

## 当前文档完备度结论

截至 2026-07-20，Taverncraft 的用户功能文档、Luker 改进专题、Extension API 和第一阶段验收证据已经相当完整；本轮补齐了此前缺少的根目录维护索引、综合使用说明和世界引擎源码/测试映射，并修正了 Node 版本及验收状态的漂移。

仍需明确保留以下边界：

- `docs/changelog.md` 和 `docs/zh-CN/changelog.md` 目前仍是功能快照，不是完整逐版本历史；
- 第一阶段完成定义仍等待最终用户确认，虽然自动门禁、200 回合长跑和真实模型 50 回合硬门已经通过；
- MySQL/PostgreSQL 需要外部服务，不在第一阶段文件系统/SQLite 的完整验收范围内；
- 繁体中文尚未提供世界引擎和本维护地图的同等内容；
- 任意第三方 SillyTavern 前端扩展与可执行 MOD 不属于保证兼容范围。

因此结论是：**当前文档足以继续维护第一阶段和现有 Luker 功能，但不能把“完整逐版本变更史”“全部数据库实测”“全部第三方扩展兼容”写成已完成。**

## 先判断改动属于哪一层

| 层级 | 判断方式 | 维护原则 |
| --- | --- | --- |
| SillyTavern 兼容层 | 角色卡、世界书、Persona、预设、宏、聊天格式或通用扩展 API | 优先保持格式兼容；同步上游前运行相关 E2E |
| Luker 上游层 | Memory Graph、Orchestrator、CEA/CPA、Skills、增量存储、生成任务、数据库后端等 | 先检查 `upstream/release` 是否已有实现或修复，避免重复开发 |
| Taverncraft 产品层 | 品牌、World Engine、提示层快照、V3/V4 兼容加固和 Phase 1 验收 | 以第一阶段计划和本文件的源码/测试映射为验收边界 |

仓库远程约定：

- `origin`：`Filamo1009/Taverncraft`，项目发布仓库；
- `upstream`：`funnycups/Luker`，直接上游；
- 更早的 SillyTavern/TavernAI 来源与许可证见根目录 `NOTICE.md`。

## 文档入口

| 需求 | 先读 | 需要同步更新的文档 |
| --- | --- | --- |
| 用户想知道产品能做什么 | `docs/zh-CN/guide/complete-user-manual.md` | 综合使用说明、对应专题页、更新日志 |
| 安装、启动或模型连接 | `docs/zh-CN/guide/getting-started.md`、`docs/zh-CN/basics/connections.md` | 英文/简中/繁中快速开始、根 README |
| World Engine 行为或验收 | `docs/development/phase1-single-npc-world-engine.md` | 中英文世界引擎用户页、综合使用说明、更新日志 |
| Luker 相对 ST 的技术改进 | `docs/zh-CN/improvements/overview.md` | 对应 `docs/improvements/*` 专题及翻译 |
| 插件/API 改动 | `docs/development/extension-api/index.md` | 对应 API 专题、插件集成指南、类型声明 |
| 品牌或旧标识兼容 | `docs/development/branding-and-compatibility.md` | `README.md`、`NOTICE.md`、包名、UI 文案和兼容测试 |
| 发布或破坏性变更 | `docs/changelog.md` | 简中/繁中 changelog、README 入口 |

## World Engine 源码地图

世界引擎入口为 `public/scripts/extensions/world-engine/index.js`，它加载 `main.js`。核心职责按文件拆分如下：

| 文件 | 责任 | 主要回归测试 |
| --- | --- | --- |
| `main.js` | UI、生命周期事件、工具注册、状态初始化/提交、Floor 联动、导入导出和全局 API | `tests/e2e/chat/26-28*`、`tests/world-engine/*source.test.js` |
| `schema.js` | 世界状态 Schema、默认结构、规范化和可提示视图 | `tests/world-engine/events.test.js`、`long-run.test.js` |
| `events.js` | `WorldOperationV1` 信封、原子批处理、事件链、哈希和重放 | `tests/world-engine/events.test.js`、`long-run.test.js` |
| `operations.js` | `set/increment/append/remove/merge` 路径操作与严格标签回退 | `tests/world-engine/operations.test.js` |
| `tool-choice.js` | 哪些请求强制或允许调用世界状态工具 | `tests/world-engine/tool-choice.test.js` |
| `prompt.js` | 权威世界状态提示和默认 Post-History 文本 | `tests/world-engine/prompt.test.js` |
| `post-history.js` | 全局/模型/角色/聊天四级作用域、继承规则和导入导出 | `tests/world-engine/post-history.test.js` |
| `memory-bridge.js` | 明确记忆意图、精确召回、世界事件到 Memory Graph 的同步 | `tests/world-engine/memory-bridge.test.js`、`memory-long-run.test.js` |
| `legacy-st.js` | 旧 `<initvar>` 解析、候选选择和安全状态映射 | `tests/world-engine/legacy-st.test.js`、`v4-openings.test.js` |
| `state-portability.js` | `world-engine-state-backup-v1` 导出、哈希校验和地点列表 | `tests/world-engine/state-portability.test.js`、状态备份 E2E |
| `dry-run-report.js` | 无服务商请求的本地提示预览报告 | `tests/world-engine/dry-run-report.test.js` |
| `style.css` | 世界引擎设置、状态检查器和诊断 UI | 浏览器 E2E + 人工视觉检查 |

与世界引擎紧密耦合、但位于扩展目录之外的文件：

| 文件 | 为什么相关 | 主要回归测试 |
| --- | --- | --- |
| `public/scripts/prompt-inspector-snapshot.js` | 生成前后记录提示层、来源、顺序、大小和截断 | `tests/world-engine/prompt-inspector-snapshot.test.js` |
| `public/scripts/request-inspector.js`、`src/request-inspector.js` | 前端显示与服务端安全保存提示层元数据 | `tests/request-inspector-prompt-layers.test.js` |
| `src/character-card-parser.js`、`src/endpoints/characters.js` | Character Card V3、PNG `ccv3` 优先级和未知字段往返 | `tests/character-card-v3-roundtrip.test.js`、真实 V4 卡 E2E |
| `public/scripts/openai.js`、`public/scripts/tool-calling.js`、`public/scripts/generate-task.js` | 工具调用、供应商错误、中断和生成任务生命周期 | OpenAI-compatible、function-call 和聊天 E2E |
| `public/scripts/extensions/memory-graph/*` | Floor 可见记忆、读取 API 和来源节点 | Memory Graph 单测/E2E、世界引擎记忆测试 |

## Luker 能力地图

这些功能主要继承自直接上游。修改前先检查对应专题、扩展目录和上游提交：

| 功能 | 主要源码入口 | 文档 | 测试入口 |
| --- | --- | --- | --- |
| Memory Graph | `public/scripts/extensions/memory-graph/` | `docs/features/memory-graph.md` | `tests/memory-graph/`、`tests/e2e/memorygraph/` |
| Orchestrator | `public/scripts/extensions/orchestrator/` | `docs/features/orchestrator/` | `tests/orchestrator/`、`tests/e2e/orchestrator/` |
| 角色卡编辑助手 | `public/scripts/extensions/character-editor-assistant/` | `docs/features/card-editor/` | `tests/e2e/character/`、`tests/e2e/iterstudio/` |
| 补全预设助手 | `public/scripts/extensions/completion-preset-assistant/` | `docs/features/preset-assistant.md` | `tests/e2e/preset/`、Iteration Studio 测试 |
| Skills | `public/scripts/skills/`、`src/endpoints/skills.js` | `docs/features/skills/` | `tests/skills/`、`tests/skills-ui/` |
| 搜索工具 | 对应 search-tools 扩展与 Orchestrator 工具 | `docs/features/search-tools.md` | Orchestrator/Search E2E |
| CardApp | `public/scripts/extensions/card-app/` | `docs/features/cardapp.md` | `tests/card-app*.test.js` |
| 增量聊天/状态存储 | `src/endpoints/chats.js`、`src/storage/` | `docs/improvements/incremental-sync.md`、`backend-storage.md` | `tests/e2e/chat/`、`tests/storage/`、`tests/sync/` |
| 后台生成与 WS 交付 | `src/endpoints/generation-control.js`、`src/luker-dispatch/`、`src/ws-delivery.js`、`public/scripts/generate-task.js` | `docs/improvements/generation-layer.md`、`ws-proxy.md` | `tests/generate-task/`、`tests/ws-delivery*.test.js` |
| 认证和配额 | `src/users.js`、认证/管理端点 | `docs/improvements/auth-and-quota.md` | `tests/users.test.js`、persona/server E2E |
| Android | `android-app/` | `android-app/README.md`、`docs/guide/android.md` | Android CI workflow |

具体文件名可能随上游演进。若表格和代码不一致，更新功能时必须同时修正本页。

## 按改动类型定位

| 你要改什么 | 首选代码位置 | 最少验证 | 必须检查的文档 |
| --- | --- | --- | --- |
| 世界状态字段或默认值 | `world-engine/schema.js` | schema/events/long-run + 备份兼容 | 世界引擎用户页、Phase 1 Schema、本页 |
| 新增世界操作 | `events.js`、`operations.js`、`main.js` | operation/events/tool E2E + 安全拒绝 | 操作协议、用户说明、changelog |
| Swipe/编辑/删除/分支回滚 | `main.js`、Floor State/Memory Graph | 完整 chat E2E + 长跑 | 世界引擎页、验收计划 |
| Prompt/Post-History 层 | `post-history.js`、`prompt.js`、snapshot/inspector | post-history + snapshot + request inspector | 世界引擎页、Extension API |
| 角色卡/世界书兼容 | parser、character/world-info endpoints | V1/V2/V3、V4 真实卡、worldinfo E2E | 角色卡、世界书、迁移页 |
| 模型/工具调用 | `openai.js`、`tool-calling.js`、生成层 | provider + function-call + error cleanup | API 连接、函数运行时、changelog |
| Memory Graph 桥接 | `memory-bridge.js`、memory-graph | 短测 + 200 回合 + 分支污染检查 | 记忆图、世界引擎、费用说明 |
| 安装/依赖/Node 基线 | `package.json`、lockfile、Docker/Android | clean `npm ci` + 启动 + audit | 三语快速开始、README、验收风险 |
| 品牌/旧 `luker` 标识 | 公共 UI、包配置、Android、兼容别名 | branding test + plugin import check | branding policy、NOTICE、README |

## 文档更新规则

以后每个用户可见改动至少完成以下闭环：

1. 在根 `README.md` 的入口或维护路由中能找到对应模块；
2. 用户行为写入综合使用说明或对应专题，不把实现细节当作使用方法；
3. 接口、Schema、兼容性或文件职责变化写入开发文档；
4. 新行为有自动测试，或明确记录只能人工验证的原因与步骤；
5. 破坏性变化、迁移要求和数据影响写入 changelog；
6. 英文、简中、繁中页面若不能同批同步，必须在 PR/变更说明中列出待补翻译；
7. 不使用“完全兼容”“零迁移成本”“不会丢失”等无条件承诺，除非测试覆盖了所指的全部范围；
8. 计划中的多 NPC、地图、多人和可执行 MOD 不得写入“当前已实现功能”。

## 推荐验证命令

依赖与服务：

```bash
npm ci
npm start
```

第一阶段 Jest 门禁（从 `tests/` 目录运行）：

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --config jest.config.json \
  --runTestsByPath \
  world-engine/*.test.js \
  character-card-v3-roundtrip.test.js \
  request-inspector-prompt-layers.test.js \
  tavern-card-validator.test.js \
  luker-dispatch/providers/openai-compatible.test.js \
  ws-delivery-client.test.js \
  ws-delivery-fetch-proxy.test.js \
  dependency-security-compatibility.test.js \
  --runInBand
```

聊天与真实卡专项（从 `tests/` 目录运行）：

```bash
./node_modules/.bin/playwright test --project=e2e --workers=1 e2e/chat
./node_modules/.bin/playwright test --project=e2e --workers=1 \
  e2e/character/29-import-real-v4-worldbook.e2e.js \
  e2e/extensions/98-function-call-runtime.e2e.js
```

文档构建（从 `docs/` 目录运行）：

```bash
./node_modules/.bin/vitepress build
```

`npm run build` 会先渲染图表，需要系统已安装 `d2`；只修改不含新图表的 Markdown/导航时，可以直接运行 VitePress build。

真实模型 50 回合脚本会产生实际 API 调用和费用，不应作为普通文档或小改动的默认测试。它只在世界状态、提示组装、工具协议、Memory Graph 或供应商链路发生高风险变化时，经过明确授权后执行。

## 完成定义

一次功能更新只有在以下信息能够从根 README 连续找到时，才算文档闭环：

```text
README
  -> 用户功能/优势
  -> 对应使用专题
  -> 开发契约与源码入口
  -> 对应测试
  -> 更新日志/迁移影响
```

若其中任一项不存在，应在合并前补齐或把缺口登记为明确的后续工作，而不是只在提交消息中留下说明。
