# AI 酒馆完整使用说明与功能优势

本文面向第一次接触 Taverncraft 酒馆工坊的玩家、角色卡作者和部署者。它按当前 `release` 分支的实际代码、测试和验收记录整理，帮助你快速回答三个问题：

1. 这个 AI 酒馆能做什么；
2. 它与 SillyTavern、Luker 是什么关系；
3. 为什么在长剧情、角色创作、调试和自托管场景中更有优势。

> 本项目的直接上游名称是 **Luker**（仓库为 `funnycups/Luker`），Luker 又源自 **SillyTavern**。本文统一使用这两个正式项目名。

## 一分钟理解 Taverncraft

Taverncraft 不是一个自带大模型的聊天网站，而是一套本地优先、可自托管的 AI 角色扮演和互动叙事引擎。你需要为它连接 OpenAI、Claude、Gemini、OpenRouter、本地模型或其他兼容接口，然后使用角色卡、世界书、Persona 和预设来控制剧情。

它的核心优势是把普通的“AI 接着写一段话”升级为可管理的叙事系统：

- 保留 SillyTavern 的角色卡、世界书、Persona、预设、聊天与扩展生态；
- 继承 Luker 的增量存储、生成恢复、记忆图、多 Agent、创作工具和多种存储后端；
- 新增 Taverncraft 第一阶段世界引擎，让时间、地点、物品、关系和任务成为可验证、可回滚的权威状态；
- 可以检查最终提示词、世界书激活和模型请求，遇到“角色为什么这样回答”时有证据可查；
- 数据默认保存在自己的设备或服务器中，并提供聊天、完整数据和世界状态三类备份路径。

## 项目关系与能力来源

| 层级 | 当前项目保留或新增的内容 | 对用户的意义 |
| --- | --- | --- |
| SillyTavern 兼容基础 | 角色卡、世界书、Persona、预设、宏、聊天、Swipe、分支、群聊、扩展体系和多模型连接 | 原有素材和使用习惯可以继续使用 |
| Luker 上游增强 | 增量同步、后端生成任务、断线恢复、Memory Graph、Orchestrator、角色卡/预设 AI 编辑、Skills、CardApp、多存储后端、Android 等 | 长聊天更可靠，创作和扩展能力更强 |
| Taverncraft 本项目新增 | 单 NPC 权威世界状态、受约束世界操作、事件链和状态哈希、历史联动回滚、四级 Post-History、提示层快照、状态备份、旧 `initvar` 导入和真实长跑验收 | 剧情状态不再只依赖模型“记得”，并且能够审计、恢复和验证 |

这里的“兼容”指已在当前仓库中覆盖的标准数据与操作。Character Card V1/V2/V3、PNG/JSON、内嵌 Character Book、独立 World Info、Persona、预设和 JSONL 聊天是当前第一阶段的重点兼容范围。任意第三方前端扩展、可执行 MOD 或其他客户端对未知字段的保留能力不作无条件保证，跨客户端迁移前仍需备份。

## 最快上手流程

### 1. 安装并启动

Git Clone 方式需要 Node.js 20.18.1 或以上：

```bash
git clone https://github.com/Filamo1009/Taverncraft.git
cd Taverncraft
npm ci
npm start
```

服务启动后访问终端显示的本地地址，默认通常是 `http://127.0.0.1:8000/`。也可以使用 Docker 或 Android APK，详见[快速开始](/zh-CN/guide/getting-started)。

### 2. 配置模型连接

打开 API 连接或 Connection Manager：

1. 选择模型服务类型；
2. 填入 API 地址和密钥；
3. 选择模型并测试连接；
4. 另行选择聊天补全预设。

Taverncraft 把“连接到哪个模型”和“使用怎样的提示词/采样参数”分开管理，因此切换模型不会自动破坏当前预设。详细设置见 [API 连接](/zh-CN/basics/connections)和[预设系统](/zh-CN/basics/presets)。

### 3. 准备角色和玩家身份

- 导入 PNG/JSON 角色卡，或使用角色卡编辑助手创建角色；
- 选择 Persona，告诉模型玩家是谁；
- 检查角色卡自带的首条消息、世界书、绑定预设和绑定 Persona；
- 使用复杂 V3 卡时，确认所需开场白和角色书已经正确载入。

### 4. 开始聊天

发送消息后可以：

- 编辑用户或 AI 消息；
- 继续生成、重新生成或在多个 Swipe 版本间切换；
- 从历史楼层创建分支；
- 合并、拆分、重命名、导入或导出聊天；
- 将不同 Persona 锁定到不同聊天。

世界引擎启用时，这些历史操作会同时恢复对应楼层的世界状态和 Memory Graph 视图，而不只是改变屏幕上显示的文字。

### 5. 使用世界引擎

在扩展抽屉确认 **World Engine** 已启用。状态检查器会显示：

- 当前时钟和地点；
- 玩家与当前活动 NPC；
- 物品、关系、任务和标记；
-允许的扩展命名空间；
- 当前状态哈希和最近提交情况。

模型不能任意覆盖整个状态对象。它只能提交经过 Schema、路径、大小、前置哈希和安全键检查的操作；失败或过期的操作不会改变当前状态。

### 6. 检查提示词和记忆

- 用 **Prompt Dry Run** 在不调用真实模型的情况下查看本地提示拼装；
- 用 **Request Inspector** 查看真正发给服务商的提示层、来源、顺序、Token 估算和截断；
- 用 **World Info Trace** 查看哪些世界书条目被匹配并注入；
- 按需启用 **Memory Graph**，让重要事实以可追溯节点参与长期召回。

Memory Graph 可能产生额外模型调用和费用，所以不会被世界引擎静默开启。

### 7. 备份

建议同时保留：

1. Taverncraft 完整数据备份：角色、聊天、Persona、预设、Secret、扩展设置和附加状态；
2. 标准角色卡/聊天导出：便于跨客户端使用；
3. World Engine 状态备份：带 SHA-256 哈希的当前权威世界状态快照。

世界状态快照不包含 API Key、Cookie、Authorization 或连接配置。恢复前仍应确认目标角色和聊天正确。

## 完整功能目录

以下按用户可见模块归纳当前仓库能力。“来源”用于区分生态基础、Luker 上游能力与 Taverncraft 新增能力。

### 角色、世界设定与提示词

| 功能 | 可以做什么 | 来源 | 详细说明 |
| --- | --- | --- | --- |
| 角色卡 | 导入、创建、编辑、复制和导出 PNG/JSON 角色卡；支持 V1/V2/V3 | ST 基础 + Taverncraft 兼容加固 | [角色卡](/zh-CN/basics/character-cards) |
| V3/未知字段往返 | `ccv3` 优先读取；保留根级、`data`、`extensions` 和 Character Book 未知字段 | Taverncraft | [世界引擎验收计划](/development/phase1-single-npc-world-engine) |
| Persona | 定义玩家身份；可绑定角色或锁定到聊天 | ST 基础 + Luker 增强 | [聊天管理](/zh-CN/basics/chat-management) |
| 世界书 | 关键字、常驻、递归、概率、深度和向量化激活；支持角色/聊天/预设绑定 | ST 基础 + Luker 增强 | [世界书](/zh-CN/basics/world-info) |
| 世界书追踪 | 查看条目匹配、排除和最终注入链路 | Luker | [激活链路追踪](/zh-CN/features/world-info-trace) |
| 预设 | 管理提示词模板、采样参数和上下文策略 | ST 基础 | [预设](/zh-CN/basics/presets) |
| 预设解耦 | 模型连接与聊天预设独立切换 | Luker | [预设解耦](/zh-CN/improvements/preset-decoupling) |
| 角色绑定预设/Persona | 创作者可把推荐配置随角色卡分发，不污染全局列表 | Luker | [角色绑定配置](/zh-CN/improvements/card-bound-presets) |
| 宏与变量 | 在提示词中动态引用角色、玩家、时间和状态数据 | ST 基础 + Luker 增强 | [宏](/zh-CN/basics/macros) |
| Prompt/Post-History | 配置全局、模型预设、角色卡、聊天四级额外提示层 | Taverncraft | [世界引擎](/zh-CN/features/world-engine) |

### 对话与剧情控制

| 功能 | 可以做什么 | 来源 | 详细说明 |
| --- | --- | --- | --- |
| 单角色聊天 | 流式/非流式生成、继续、编辑、删除和导入导出 | ST 基础 | [聊天管理](/zh-CN/basics/chat-management) |
| Swipe/重生成 | 保留同一楼层的多个答案并切换，或请求新答案 | ST 基础 | [聊天管理](/zh-CN/basics/chat-management) |
| 分支 | 从任意历史节点探索另一条剧情路线 | ST 基础 + 状态联动加固 | [聊天管理](/zh-CN/basics/chat-management) |
| 合并与拆分 | 重排、裁剪、重复来源并处理名称冲突，支持文件和 SQLite 路径 | Luker + Taverncraft 回归加固 | [合并与拆分](/zh-CN/features/chat-merge-split) |
| 群聊 | 多角色轮流或按规则发言 | ST/Luker 现有能力 | [聊天管理](/zh-CN/basics/chat-management) |
| 后台生成任务 | 前端刷新或临时断线后继续保存并恢复正在生成的结果 | Luker | [后端存储](/zh-CN/improvements/backend-storage) |
| 生成失败保护 | 服务商失败时清理空占位与未提交世界操作；中断后可继续请求 | Taverncraft | [第一阶段验收](/development/phase1-single-npc-world-engine) |

### 世界状态与长期一致性

| 功能 | 可以做什么 | 来源 | 详细说明 |
| --- | --- | --- | --- |
| 权威世界状态 | 维护时钟、地点、人物、物品、关系、任务、标记和扩展数据 | Taverncraft | [世界引擎](/zh-CN/features/world-engine) |
| 受约束世界操作 | 使用原生 Tool Call；不支持时使用严格标签 JSON 回退 | Taverncraft | [开发与验收计划](/development/phase1-single-npc-world-engine) |
| 状态事件链 | 每次提交记录期望/结果哈希、来源消息、Swipe 和 Floor，可确定性重放 | Taverncraft | [开发与验收计划](/development/phase1-single-npc-world-engine) |
| 历史联动回滚 | 编辑、删除、重生成、Swipe 和分支时恢复对应状态与记忆视图 | Taverncraft | [世界引擎](/zh-CN/features/world-engine) |
| 状态备份 | 导出、校验并导入带哈希的可移植快照 | Taverncraft | [世界引擎](/zh-CN/features/world-engine) |
| 旧卡初始化 | 读取旧 `<initvar>` 并映射为安全世界状态；支持复杂 V4 多开场隔离 | Taverncraft | [开发与验收计划](/development/phase1-single-npc-world-engine) |
| Memory Graph | 用图节点、向量检索和可选 LLM 召回保存长期事实 | Luker | [记忆图](/zh-CN/features/memory-graph) |
| 精确记忆桥 | 从当前可见记忆节点选取指定来源回合的原文，进行可追溯召回 | Taverncraft | [开发与验收计划](/development/phase1-single-npc-world-engine) |
| 逐楼层变量/状态系统 | 让状态跟随聊天楼层、Swipe 和分支变化 | Luker | [逐楼层变量](/zh-CN/features/variable-op-log) · [状态系统](/zh-CN/features/state-system) |

### AI 创作与自动化工具

| 功能 | 可以做什么 | 来源 | 详细说明 |
| --- | --- | --- | --- |
| 多 Agent 编排 | 用 Spec、Single、Agenda、Loop 或 Director 模式进行策划、写作和评审 | Luker | [Orchestrator](/zh-CN/features/orchestrator/) |
| 角色卡编辑助手 | 用自然语言修改角色卡和世界书，以 diff 审批每批更改 | Luker | [角色卡编辑助手](/zh-CN/features/card-editor/) |
| 补全预设助手 | 理解、修改和优化聊天补全预设 | Luker | [预设助手](/zh-CN/features/preset-assistant) |
| Iteration Studio / edits-lib | 多轮 AI 编辑、漂移检测、冲突处理和按消息回滚 | Luker | [迭代工作台 API](/zh-CN/development/extension-api/iteration-studio) |
| Skills | 用 `SKILL.md` 封装可复用规则；可按全局、预设、角色作用域分发 | Luker | [Skills](/zh-CN/features/skills/) |
| 搜索工具 | 通过 DuckDuckGo、SearXNG 或 Brave Search 为模型提供联网检索 | Luker | [搜索工具](/zh-CN/features/search-tools) |
| 函数调用运行时 | 统一原生工具调用与纯文本函数调用，覆盖不同模型能力 | Luker | [函数调用运行时](/zh-CN/improvements/function-call-runtime) |
| CardApp | 在角色卡内嵌受管理的交互应用和自定义界面 | Luker | [CardApp](/zh-CN/features/cardapp) |
| 插件正则与钩子排序 | 插件注册文本处理规则，并控制扩展执行先后 | Luker | [正则提供者](/zh-CN/features/regex-provider) · [钩子排序](/zh-CN/features/hook-order) |

> Orchestrator 等多 Agent 功能仍在 Taverncraft 中可用，但它不是第一阶段单 NPC 世界引擎的默认依赖。不要把“多 Agent 创作辅助”与“多个 NPC 在世界中自主运行”混为一谈。

### 诊断、存储、部署与多人使用

| 功能 | 可以做什么 | 来源 | 详细说明 |
| --- | --- | --- | --- |
| Request Inspector | 检查提示层、最终请求、响应、Token 用量和错误 | Luker + Taverncraft 提示层增强 | [请求检查器](/zh-CN/improvements/request-inspector) |
| Prompt Dry Run | 不调用服务商即可预览本地提示拼装和截断 | Taverncraft | [世界引擎](/zh-CN/features/world-engine) |
| 日志系统 | 捕获和导出服务端/客户端诊断信息 | Luker | [日志](/zh-CN/features/logging) |
| 增量同步 | 聊天、设置和世界书仅传输变更，带冲突检测 | Luker | [增量同步](/zh-CN/improvements/incremental-sync) |
| 多存储后端 | 选择文件系统、SQLite、MySQL 或 PostgreSQL；结构化数据与二进制资源分工存储 | Luker | [后端存储](/zh-CN/improvements/backend-storage) |
| WebSocket/局域网同步 | 处理持久隧道、心跳、偏移恢复和局域网场景 | Luker | [WebSocket 代理](/zh-CN/improvements/ws-proxy) · [局域网同步](/zh-CN/improvements/lan-sync) |
| 认证与配额 | 多用户、本地账户、GitHub/Discord OAuth 和每用户空间配额 | Luker | [认证与配额](/zh-CN/improvements/auth-and-quota) |
| Android | 在手机内运行后端并通过本机 WebView 打开 | Luker + Taverncraft 品牌/发布适配 | [Android](/zh-CN/guide/android) |
| 插件 API | 使用 Taverncraft/SillyTavern 兼容上下文、状态、提示和生命周期钩子扩展功能 | Luker + Taverncraft 兼容层 | [Extension API](/zh-CN/development/extension-api/) |

## 相比 SillyTavern 和 Luker 的主要优势

### 相比标准 SillyTavern

- **状态更可信**：关键世界数据由受约束状态机维护，不只依赖模型自然语言记忆；
- **长对话更稳**：增量写入、后端生成任务、断线恢复和 Memory Graph 降低长聊天丢失或遗忘风险；
- **问题更容易解释**：可以查看世界书激活、提示词层级、最终请求和状态事件；
- **创作链更完整**：角色卡、世界书、预设、Skills、多 Agent 和 CardApp 可以在同一套系统内制作和分发；
- **部署选择更多**：桌面浏览器、自托管、Docker、Android 和多种存储后端可按场景组合。

### 相比直接使用 Luker

Taverncraft 继续使用 Luker 的成熟底座，主要增加了第一阶段单 NPC 世界引擎和与其配套的兼容/验收加固：

- 规范化权威世界状态与状态检查器；
- 带前置哈希、安全路径和原子提交的世界操作协议；
- 与消息楼层、Swipe、分支和 Memory Graph 对齐的事件链；
- 四级 Post-History 配置和提示层快照；
- 状态备份、旧 `initvar` 导入、V3/V4 角色卡往返保真；
- 200 回合合成长跑、50 回合真实模型硬门和隐私泄露检查。

项目没有大面积复制或替换 Luker 核心，而是优先通过扩展 API 和小型兼容层增加世界引擎。这样更便于继续同步上游修复。

## 当前边界与不要误解的部分

当前已经交付的是“单玩家、单活动 NPC 的完整剧情闭环”。以下能力不属于第一阶段：

- 多个 NPC 在玩家看不见时持续自主行动；
- 远距离 NPC 冷/温/热区调度和离线补算；
- 地图画布、寻路或大规模地点模拟；
- 联机多人游戏；
- 未经沙箱处理的任意 MOD 代码执行；
- 保证所有第三方 SillyTavern 前端扩展直接兼容。

自动门禁、200 回合合成长跑和真实模型 50 回合硬门已通过，未发现 P0/P1；产品完成定义仍保留最终用户确认项。MySQL/PostgreSQL 依赖外部服务，不在第一阶段本地文件/SQLite 的完整验收范围内。

## 常见问题

### 它是否包含模型或免费额度？

不包含。你需要连接自己的云端 API 或本地模型。不同功能可能产生额外请求，尤其是 Memory Graph、搜索和多 Agent 编排。

### 原来的 SillyTavern 卡能否直接使用？

标准 V1/V2/V3 PNG/JSON、世界书、Persona、预设和 JSONL 聊天是当前重点兼容范围。迁移前必须保留备份；不要假设任意第三方扩展或任意客户端都能无损保留 Taverncraft 扩展字段。

### 为什么有时模型说世界发生了变化，但状态没有更新？

自然语言叙述本身不能修改权威状态。模型必须提交合法的工具操作或严格标签操作，而且前置哈希、路径、类型和安全检查都要通过。请查看状态检查器、最近提交诊断和 Request Inspector。

### 为什么 Memory Graph 默认不自动打开？

它可能调用额外模型并产生 Token/费用，也可能与主对话争用连接。世界引擎只在用户明确选择后使用它。

### 怎样最安全地更新？

更新前创建完整备份和重要世界状态快照，记录当前 commit；更新后重新打开一段已知聊天，核对 Swipe、状态哈希、记忆来源、世界书追踪和 Request Inspector，再运行对应模块测试。开发者请从[开发维护地图](/development/maintenance-map)开始。

## 延伸阅读

- [快速开始](/zh-CN/guide/getting-started)
- [世界引擎用户与运维指南](/zh-CN/features/world-engine)
- [Luker/SillyTavern 改进总览](/zh-CN/improvements/overview)
- [第一阶段开发与验收计划](/development/phase1-single-npc-world-engine)
- [开发维护地图](/development/maintenance-map)
