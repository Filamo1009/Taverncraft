# Taverncraft 酒馆工坊是什么

Taverncraft 酒馆工坊是基于 [Luker](https://github.com/funnycups/Luker) 深度开发的世界模拟与角色扮演平台；Luker 本身源自 [SillyTavern](https://github.com/SillyTavern/SillyTavern)。它保留了 SillyTavern 成熟的角色卡生态和数据格式兼容性，同时加入权威世界状态、提示词检查、长期记忆和可扩展 Mod 架构。

Taverncraft 支持当前兼容测试覆盖的标准 SillyTavern 数据路径，包括 Character Card V1/V2/V3、世界书、Persona、预设和 JSONL 聊天。Taverncraft 专属状态以附加数据保存，其他客户端可能忽略它。迁移或降级前必须备份，不要在未经验证时假设任意第三方扩展都会保留全部字段。

## 为什么选择 Taverncraft

SillyTavern 是一款优秀的角色扮演前端，拥有活跃的社区和丰富的角色卡生态。Taverncraft 在此基础上，针对以下方向做了系统性改进：

### 更高效的数据传输

SillyTavern 的大部分保存操作采用全量传输——每次编辑消息、切换设置、修改世界书，都会将完整数据发送到后端。对于云端部署的用户，这意味着显著的流量消耗。

Taverncraft 引入了增量同步机制，统一使用遵循 [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) 标准的 patch 端点。以前开关一个插件设置可能传输 3MB 数据，现在不到 200 字节。保存操作还支持延迟触发和冲突检测，从根本上避免了并发写入导致的数据损坏。

### 更强的扩展能力

Taverncraft 为插件开发者提供了更丰富的基础设施：角色/预设状态 API、托管正则提供者、统一的扩展注入设置、函数调用运行时等。插件可以方便地复用用户已有的 API 预设和聊天补全预设，无需重复配置。

### 内置专业工具链

Taverncraft 内置了多个面向角色扮演场景的专业工具——记忆图、多 Agent 编排、角色卡编辑助手、搜索插件等，开箱即用，无需额外安装第三方扩展。

## 核心特性概览

### 记忆图（Memory Graph）

基于知识图谱结构的角色记忆系统。将角色扮演中的事件、人物、地点、主线等信息组织为图结构，通过认知层处理、向量索引检索和扩散式记忆传播实现智能记忆召回。召回模型可以在图中多轮深挖，找出与当前剧情最相关的记忆节点注入创作上下文。

→ [记忆图详细文档](/zh-CN/features/memory-graph)

### 多 Agent 编排（Orchestrator）

在创作 LLM 生成回复之前，可以先由 Agent 分析和编排剧情。当前提供五种运行模式：Spec、单 Agent、Agenda、Loop 和 Director。多数模式生成精简 capsule 交给主模型，Director 则直接接管最终正文。角色卡绑定与文件级导入导出能力因模式而异，以各模式专题为准。

→ [多 Agent 编排详细文档](/zh-CN/features/orchestrator/)

### 角色卡编辑助手（CEA / CardApp Studio）

集成 CodeMirror 6 代码编辑器的 AI 辅助角色卡编辑工具。支持通过自然语言对话编辑角色卡和世界书，每批修改提供 diff 审批。当角色卡更新时，自动检测世界书变更并提供智能同步方案。普通角色卡用弹窗版编辑助手，含 CardApp 的角色卡进入功能更完整的 Studio。

→ [角色卡编辑助手概览](/zh-CN/features/card-editor/)　·　[普通弹窗](/zh-CN/features/card-editor/popup)　·　[CardApp Studio](/zh-CN/features/card-editor/studio)

### 搜索插件（Search Tools）

为 AI 提供联网搜索能力，支持 DuckDuckGo、SearXNG、Brave Search 等搜索引擎后端。提供两种工作模式：作为创作 LLM 的可调用工具，或作为预请求 Agent 在生成前自动搜索并将结果写入世界书。

→ [搜索插件详细文档](/zh-CN/features/search-tools)

### 预设解耦

SillyTavern 中 API 预设和聊天补全预设是联动切换的。Taverncraft 将两者解耦，切换 API 连接不会连带切换聊天补全预设，你可以自由搭配不同的 LLM 后端和提示词预设。

### 增量同步

世界书、聊天记录、用户设置等内容的保存统一使用遵循 RFC 6902 标准的 patch 端点，大幅减少数据传输量。配合延迟触发和冲突检测（409 响应），确保多端场景下的数据一致性。

### 函数调用运行时（Function Call Runtime）

统一的函数调用 / 工具调用运行时，支持两种模式：

- **原生工具调用**：兼容 OpenAI、Claude、Gemini 等 API 的原生 tool call 格式
- **纯文本函数调用**：通过文本协议实现工具调用，适用于不支持原生工具调用的模型

### CardApp

角色卡内嵌应用运行时。允许角色卡携带自定义应用逻辑，提供上下文 API 和生命周期管理。

### 提示词分组 & 预设分组

预设管理器和提示词管理器支持可折叠的分组系统，方便组织和管理大量预设与提示词条目。

### 角色卡绑定预设与人设

角色卡可以绑定专属的聊天补全预设和用户人设（Persona）。绑定的预设和人设独立于全局列表，不会污染用户的全局配置，关闭角色卡聊天后自动消失，并可随角色卡导入导出。角色卡开发者不必再要求用户手动导入专属预设。

### 请求检查器（Request Inspector）

每用户的生成请求诊断工具，可追踪所有后端（包括图像生成）的请求详情，方便调试和排查问题。

### 认证与配额

支持 GitHub / Discord OAuth 登录，管理员可为每位用户配置空间大小配额。Discord 登录可额外要求用户必须在指定服务器中或拥有特定身份组。

::: tip 更多特性
Taverncraft 还包含许多其他改进：Undo Toast 撤销系统、聊天人设锁定（Chat Persona Lock）、动态模型列表、世界书激活链路追踪、预设关联世界书、大量移动端 / Android 适配优化、启动性能优化等。这些特性将在各自的专题页面中详细介绍。
:::

## 兼容性

Taverncraft 对以下标准 SillyTavern 数据路径保持经过测试的兼容性：

| 数据类型 | 兼容性 |
|---------|--------|
| 角色卡（PNG/JSON） | 已覆盖 V1/V2/V3 导入导出和未知字段往返 |
| 世界书 / Lorebook | 已覆盖内嵌与独立世界书路径 |
| 聊天记录 | 已覆盖 JSONL 导入导出和常用聊天操作 |
| 聊天补全预设 / Persona | 支持；迁移后需核对绑定的 Taverncraft 扩展状态 |
| 第三方扩展 | 使用兼容加载界面，但不保证任意扩展直接可用 |
| 用户设置 | 支持；应以 Taverncraft 默认配置为基础逐项迁移 |

::: info 双向迁移
世界引擎、记忆图和编排配置等 Taverncraft 专属数据保存在附加状态或扩展元数据中；不理解它的客户端可能忽略这些内容，不同客户端保留未知字段的能力也不同。双向迁移都必须保留备份，并在完成后核对一张已知角色卡和聊天。
:::

## 下一步

准备好开始使用了吗？

→ [快速开始](/zh-CN/guide/getting-started) — 安装和部署 Taverncraft
