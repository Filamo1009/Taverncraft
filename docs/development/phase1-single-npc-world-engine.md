# 第一阶段：单 NPC 世界剧情引擎开发与验收计划

状态：里程碑 A-F、本地自动门禁与真实模型 50 回合硬验收均已通过；等待用户确认验收结果
更新日期：2026-07-20
上游基线：Luker `release` / `a47718b50d3249a2b531d26d92a600f45826b658`
开发分支：`world-engine/phase1-single-npc`

## 1. 阶段目标

本阶段基于 Luker 源码开发 Taverncraft 酒馆工坊的本地 Web 版、单玩家、单 NPC 完整剧情与对话引擎。它需要保留 SillyTavern（下称 ST）的主要创作和聊天方式，同时加入可验证、可回滚的轻量世界状态与更可靠的长期记忆。

本阶段只验收一个活动 NPC。从 Luker 继承的多 Agent/编排功能保留在代码中，但必须默认关闭，不作为第一阶段的产品入口或验收依赖。

完成后的最小闭环是：

1. 导入 ST 角色卡、内嵌世界书、独立世界书和 Persona；
2. 编辑角色、Persona、世界书、提示词和模型预设；
3. 选择 OpenAI-compatible 模型后稳定开始单角色聊天；
4. 支持编辑、重生成、Swipe、分支、复制/合并/导入/导出聊天；
5. 世界书按 ST 规则激活并进入可检查的最终请求；
6. 模型可通过受约束操作推进时间、地点、位置、物品、关系、任务和标记；
7. 聊天编辑、Swipe、删除和分支会同步回滚世界状态与长期记忆；
8. 长对话能够检索相关旧事实，避免将全文无限塞入上下文；
9. 提供可配置的 Post-History/Jailbreak 提示层及请求检查器；
10. 使用工作区中的 `v4.0.png` 完成真实导入、往返和长对话验收。

## 2. 产品边界

### 2.1 本阶段包含

- 单角色聊天及完整 ST 风格聊天操作；
- Character Card V1/V2/V3 的 JSON/PNG 导入、编辑和导出；
- Character Book/World Info 的导入、激活、编辑、绑定和导出；
- 未识别字段与 `extensions` 的往返保留；
- Persona、模型连接、上下文预设、采样预设和宏；
- OpenAI、OpenRouter及本地 OpenAI-compatible 接口；
- 正常 System Prompt、角色 Prompt、世界书、作者注释、历史、Post-History Instructions/Jailbreak 的可检查拼装；
- Taverncraft Memory Graph 的长期记忆扩展；
- 轻量权威世界状态、操作日志、状态哈希、重放和回滚；
- 本地私有使用所需的启动、迁移、备份和诊断文档；
- 保留 Luker 及更早上游的许可证、版权信息与变更说明。

### 2.2 本阶段不包含

- 多 NPC 同时自主模拟；
- 远距离 NPC 冷/温/热区调度与补算；
- 地图画布、寻路和大规模地点模拟；
- 联机多人游戏；
- 任意第三方 ST 前端扩展直接运行；
- 无沙箱的任意 MOD 代码执行；
- 自动多轮提示绕过或针对服务商安全机制的自动攻击；
- 第二阶段的实现规格。

## 3. 基线策略

### 3.1 直接基于 Luker 源码

Taverncraft 是 Luker 的下游开发项目，不重新实现 Luker 已经稳定提供的聊天、存储、状态、Memory Graph、请求检查、编辑器和模型连接功能。

上游同步规则：

- 保留 `funnycups/Luker` 作为可拉取的上游来源；
- 业务开发只进入 `world-engine/*` 分支；
- 定期合并/变基前先运行本文件定义的回归门禁；
- 上游冲突优先通过扩展 API 或小型适配层解决，避免大面积复制核心代码；
- 私有本地使用期间保留 AGPL 与原版权信息；任何发布、托管或分发前单独进行许可证与源码提供义务审查。

### 3.2 复用的上游能力

- 角色卡与世界书管理；
- Persona、聊天记录和预设；
- OpenAI-compatible 模型接入；
- 编辑、重生成、Swipe、分支和聊天管理；
- Prompt/Context 构建、宏、Regex 和 Request Inspector；
- State System、Floor State 以及消息层级回滚；
- Memory Graph 的结构化记录、搜索和分支状态；
- Unified Generation Layer；
- 实时/增量存储和本地数据目录。

## 4. ST 兼容契约

### 4.1 角色卡版本

| 格式 | 导入 | 编辑 | 导出 | 往返保留 |
|---|---:|---:|---:|---:|
| Character Card V1 JSON | 是 | 是 | 是 | 是 |
| Character Card V2 JSON/PNG `chara` | 是 | 是 | 是 | 是 |
| Character Card V3 JSON/PNG `ccv3` | 是 | 是 | 是 | 是 |

当 PNG 同时包含 `chara` 与 `ccv3` 时，以 `ccv3` 为读取真值。保存时必须生成语义一致的 V3 数据，并保证兼容块不会静默覆盖 V3 专属内容。

必须支持并保留：

- `name`、`description`、`personality`、`scenario`；
- `first_mes`、`alternate_greetings`、`mes_example`；
- `system_prompt`、`post_history_instructions`；
- `creator_notes`、`tags`、`creator`、`character_version`；
- `character_book`；
- 根级与 `data.extensions` 中的已知/未知字段；
- 世界书条目内的未知字段和扩展字段。

### 4.2 世界书

第一阶段需要兼容：

- 主关键字、次级关键字；
- 常驻、选择性激活和概率；
- 扫描深度、递归、不可递归和延迟递归；
- 插入位置、角色、深度、顺序和 Token 预算；
- 角色/Persona/聊天/全局范围；
- 条目启用状态、分组、粘性、冷却、延迟；
- Character Book 与独立 World Info 的互转；
- 激活追踪，能够解释某条世界书为什么进入或没有进入最终上下文。

### 4.3 宏、预设和聊天

- 至少兼容 `{{char}}`、`{{user}}`、时间日期及 Taverncraft/ST 已支持的常用宏；
- 导入和编辑 Context/Instruct/Sampler/Prompt Preset；
- 未识别预设字段保留在原始数据中；
- 聊天 JSONL 导入导出；
- 编辑历史消息、重生成、Swipe、分支、合并和删除；
- 所有历史操作必须同步回滚世界状态和记忆，不允许只改可见文本。

## 5. `v4.0.png` 硬验收样本

测试文件：工作区根目录 `/Users/owen/Documents/AI RPG/v4.0.png`。

已确认的基准数据：

| 指标 | 期望值 |
|---|---|
| 图片尺寸 | 512 × 768 |
| PNG 元数据 | 同时含 `chara` 与 `ccv3` |
| 规范 | `chara_card_v3` / `3.0` |
| 角色名 | `苍玄界` |
| 备用开场白 | 18 条 |
| 内嵌世界书条目 | 174 条 |
| 已启用世界书条目 | 173 条 |
| 常驻条目 | 33 条 |
| `chara`/`ccv3` 解码数据 | 语义一致 |
| 解码 JSON SHA-256 | `e031e7062ee7e9f140c72cecd0156625443a87391f4ee8400d2902893d804c8f` |

自动测试不得把这张大卡提交到仓库。测试通过 `WORLD_ENGINE_TEST_CARD` 指定路径，未指定时仅在相邻工作区存在 `../v4.0.png` 时运行；CI 另外使用小型合成 V3 卡覆盖同一契约。

真实卡验收包括：

1. PNG 读取优先采用 `ccv3`；
2. V3 校验通过；
3. 字段数量与上表一致；
4. `regex_scripts`、`tavern_helper`、`world` 等扩展可见且不丢失；
5. 世界书条目扩展字段不丢失；
6. 读取、保存、再次读取后，原数据中所有 JSON 路径仍存在且值相同，只有明确记录的格式规范化字段可以改变；
7. 能在 UI 中创建角色、显示封面、选择开场并开始聊天；
8. 世界书激活和最终请求可在检查器中解释。

## 6. 提示词与“破甲”功能

本阶段将“破甲”实现为透明、可编辑、可关闭的 Prompt Layer，不实现自动化安全绕过攻击。

拼装顺序必须可配置并可在 Request Inspector 中查看：

1. 模型/连接级系统约束；
2. 用户选择的 System Prompt；
3. 角色卡 System Prompt；
4. Persona 与角色描述；
5. 已激活世界书；
6. 长期记忆召回；
7. 聊天历史；
8. 角色卡 Post-History Instructions；
9. 用户选择的 Jailbreak/Post-History 层；
10. 世界引擎的结构化操作协议。

要求：

- 内置一个关闭状态和一个可编辑示例预设；
- 可按角色卡、模型预设和聊天覆盖；
- 清楚显示每层来源、最终文本、Token 估算和截断结果；
- 不在后台秘密追加不可见提示词；
- 导入 ST/Taverncraft 预设时保留原 Post-History/Jailbreak 字段；
- 失败时允许用户查看原始请求和服务商响应，但诊断日志不得泄露 API Key。

已确定的作用域与持久化契约：

| 优先级 | 作用域 | 持久化位置 | 随什么导出 |
|---:|---|---|---|
| 1 | 当前聊天 | `chat_metadata.world_engine.postHistory` | 聊天 JSONL |
| 2 | 当前角色卡 | `data.extensions.world_engine.postHistory` | Character Card |
| 3 | 当前模型预设 | `extensions.world_engine.postHistory` | 对应模型预设 |
| 4 | 全局默认 | `extension_settings.world_engine.postHistoryGlobal` | 本地设置备份 |

每级只允许 `inherit`、`off`、`example`、`custom` 四种模式。解析时从低优先级向高优先级覆盖，最高级的非 `inherit` 配置生效；全部继承时回落到内置关闭状态。`off` 是显式关闭，能够压过低级别已启用配置。`example` 使用源码中的透明示例，用户修改示例文本时转为 `custom`。

World Engine 的 Post-History 是附加用户层，不读取、改写或删除角色卡原生 `post_history_instructions`、System Prompt 预设原生 `post_history`/`jailbreak` 字段。导入导出文件采用 `world-engine-post-history-config-v1`，只包含当前作用域的模式与提示文本；导入始终写入界面当前选中的作用域，不携带 API Key、Cookie、Authorization 或其他模型连接字段。

界面同时显示当前编辑来源、完整覆盖链、生效来源、最终注入文本和本地 Token 估算。Request Inspector 保存 tokenizer 估算、上下文截断、预览截断，以及 World Engine 层的作用域、来源标签和模式；这些诊断字段在服务端按白名单截断，并在调用服务商前从请求体删除。

## 7. 单 NPC 权威世界状态

### 7.1 状态模型

世界状态存储在 Taverncraft Chat State/Floor State 的专用命名空间中：

```json
{
  "schemaVersion": 1,
  "clock": {
    "turn": 0,
    "label": "string",
    "iso": "ISO-8601 string or null"
  },
  "location": {
    "current": "string",
    "region": "string",
    "area": "string",
    "known": [],
    "presentCharacters": []
  },
  "player": {
    "id": "player",
    "name": "string",
    "location": "string",
    "status": {},
    "inventory": {}
  },
  "npc": {
    "id": "npc:string",
    "name": "string",
    "location": "string",
    "status": {},
    "inventory": {},
    "knowledge": {"facts": []}
  },
  "items": {},
  "relationships": {},
  "tasks": {},
  "flags": {},
  "extensions": {},
  "meta": {}
}
```

固定核心字段用于稳定规则和 UI；世界专属属性进入有命名空间的 `extensions`，以便未来 WorldPack/MOD 扩展。第一阶段只显示去重后的轻量地点列表，不实现地图或寻路。地点列表由当前场景、`location.known`、玩家位置和单 NPC 位置合并生成，并标记当前场景和在场主体。

当前状态可导出为 `world-engine-state-backup-v1`。备份只包含规范化世界状态、来源聊天/角色标签和状态哈希，不包含模型设置或密钥。导入限制为 5 MB，先执行 JSON/深度/危险键校验，再校验 SHA-256 状态哈希，最后作为当前 Floor 的新提交写入；哈希不一致时不修改现有状态。

### 7.2 操作协议

模型不能直接覆写状态，只能提出 `WorldOperationV1[]`。优先使用模型原生 Tool Calls；模型不支持工具时，只接受严格标签包裹的 JSON 作为回退，不解析普通叙事文本。

首批操作：

- `advance_time`；
- `move_actor`；
- `set_flag` / `unset_flag`；
- `give_item` / `remove_item` / `transfer_item`；
- `adjust_relationship`；
- `create_task` / `update_task` / `complete_task`；
- `set_extension_value`（仅允许声明过的命名空间和 Schema）。

每个操作包含：

- `operation_id` 和幂等键；
- 目标聊天、消息、Swipe/Floor；
- `expected_state_hash`；
- 操作类型、参数和版本；
- 模型给出的理由（仅用于审计，不作为规则依据）；
- 校验结果与拒绝原因。

执行顺序：Schema 校验 → 权限校验 → 前置条件 → 冲突检测 → 原子应用 → 事件追加 → 新状态哈希 → Floor State/Memory Graph 提交。

### 7.3 事件与回滚

每次成功操作生成不可变 `WorldEventV1`。事件记录前后状态哈希、来源消息、来源 Swipe 和操作版本。

- 编辑历史消息：废弃受影响 Floor 之后的事件并重新生成；
- 切换 Swipe：恢复该 Swipe 对应的世界状态和记忆视图；
- 删除消息：同步删除/失活其派生事件；
- 创建分支：共享分叉点前历史，分叉点后使用独立事件链；
- 重放：相同初始状态、事件和随机种子必须得到相同最终哈希。

## 8. 长期记忆

在 Taverncraft Memory Graph 上增加世界引擎的来源关联，不另建互不相通的第二套记忆系统。

记忆类型：

- 结构化事实：人物、地点、物品、任务、关系证据；
- 情节事件：发生时间、参与者、地点和结果；
- 对话摘要：一段历史的压缩叙述；
- 角色承诺与未完成事项；
- NPC 私有认知和玩家已知信息（第一阶段只有一个 NPC，但数据结构必须隔离）；
- 原消息引用与世界事件引用。

检索采用关键词/FTS、向量相似度、时间新近性、实体关系和重要度的混合排序。召回结果必须带来源，并受单独 Token 预算控制。

一致性要求：

- 记忆写入与世界事件关联 `chat_id/message_id/swipe_id/floor_id/event_id`；
- 编辑、Swipe、删除和分支通过 Floor State 得到同样的回滚语义；
- 摘要不得覆盖原始事件；
- 冲突事实保留来源和时间，不用最后一次生成静默覆盖；
- 200 轮后仍可追溯关键事实来自哪条消息或事件。

## 9. 实施拆分

### 里程碑 A：可复现基线与真实卡测试（已完成）

工作：

- 固定 Taverncraft 上游提交、Node 版本和安装命令；
- 建立本地开发分支；
- 跑通现有单元测试；
- 增加 V1/V2/V3 角色卡读写契约测试；
- 增加 `v4.0.png` 条件式真实样本测试；
- 修复真实卡导入/导出过程中发现的丢字段问题；
- 确认多 Agent 功能默认关闭。

退出标准：全新安装可启动；现有测试不回退；真实卡自动测试通过。

### 里程碑 B：单 NPC ST 聊天闭环（已完成）

工作：

- 验证并修复角色卡、Character Book、独立世界书、Persona 和预设导入；
- 补足基础编辑器缺口；
- 验证开场白、备用开场、宏、世界书激活和 Token 预算；
- 验证编辑、重生成、Swipe、分支、合并和聊天导入导出；
- 建立 OpenAI-compatible 稳定连接、重试、超时和流式显示；
- 用 Request Inspector 对最终上下文做快照测试。

退出标准：`v4.0.png` 可在 UI 中完成从导入到连续剧情对话的完整流程。

### 里程碑 C：提示层与可诊断性（已完成）

工作：

- 增加可编辑 Jailbreak/Post-History Prompt Layer；
- 明确层级、作用域、启用状态和覆盖规则；
- 在 Request Inspector 中显示每层来源、Token 和截断；
- 对 API Key、Cookie 和 Authorization 做日志脱敏；
- 增加导入/导出和回归测试。

退出标准：相同输入和预设可复现相同提示拼装；用户可定位遗漏或冲突的提示层。

### 里程碑 D：世界状态核心（已完成）

工作：

- 新增 `world-engine` 前端扩展及专用模块；
- 定义状态、操作、事件 Schema 和版本；
- 实现校验、幂等、状态哈希与确定性重放；
- 接入原生 Tool Calls 和严格 JSON 回退；
- 接入 Chat State/Floor State；
- 增加轻量地点列表和状态检查面板；
- 增加编辑/Swipe/分支/删除回滚测试。

退出标准：模型叙事不能绕过操作协议改状态；合法操作可重放；所有聊天历史操作保持状态一致。

### 里程碑 E：Memory Graph 集成（已完成）

工作：

- 建立世界事件、消息、Floor 与记忆节点的引用；
- 实现事实、事件、摘要、承诺与认知写入策略；
- 实现混合检索、预算和来源显示；
- 增加冲突事实、撤销、Swipe 和分支测试；
- 增加 200 轮合成对话压力测试。

退出标准：关键旧事实能被正确召回；废弃分支记忆不会污染当前分支；检索来源可解释。

### 里程碑 F：真实运行与发布前门禁（进行中）

工作：

- 使用 `v4.0.png` 和真实 OpenAI-compatible 模型完成 50 轮叙事测试；
- 覆盖世界书激活、宏、编辑、重生成、Swipe、分支、世界操作和长期记忆；
- 记录失败率、响应时间、上下文大小和记忆召回；
- 做本地备份/恢复、重启续聊和异常响应测试；
- 更新 README、迁移、隐私、许可证和已知限制。

退出标准：满足第 10 节全部验收标准，且没有 P0/P1 缺陷。

## 10. 最终验收标准

### 10.1 自动测试

- Taverncraft 既有单元测试、集成测试和本阶段新增测试全部通过；
- `v4.0.png` V3 解析、校验和无损往返通过；
- Character Card V1/V2/V3 合成样本通过；
- 世界书 174 条完整导入，启用/常驻计数正确；
- 未知根字段、卡扩展、世界书扩展和 Regex 配置不丢失；
- 世界操作 Schema、权限、前置条件、冲突、幂等和非法文本拒绝测试通过；
- 状态事件重放哈希一致；
- 编辑、重生成、Swipe、删除和分支的状态/记忆回滚测试通过；
- Request Inspector 拼装顺序和 Token 预算快照通过；
- 200 轮合成剧情测试无状态漂移、无废弃记忆污染，指定事实召回达到测试集阈值。

### 10.2 50 轮真实叙事测试

必须使用 `v4.0.png`、一个明确的 Persona 和用户选择的真实模型。测试脚本覆盖：

- 至少 5 次世界书关键字激活；
- 至少 3 次常驻/递归/概率条目检查；
- 至少 5 个世界状态操作；
- 至少 2 次编辑历史消息；
- 至少 3 次重生成或 Swipe；
- 至少 1 次分支并返回原分支；
- 至少 3 个跨 30 轮以上的长期事实召回；
- 至少 1 次应用重启后续聊；
- 至少 1 次模型格式错误并验证安全拒绝/重试。

通过条件：

- 50 轮均可继续，不发生不可恢复崩溃或聊天损坏；
- 卡片人格、世界设定和 Persona 没有系统性串位；
- 被激活世界书与 Request Inspector 记录一致；
- 非法世界操作不会改变状态；
- 当前分支的世界状态、可见历史和长期记忆一致；
- 关键事实召回正确且能显示来源；
- 重启后角色、聊天、世界状态、记忆和预设完整恢复；
- 不在日志、导出文件或界面中泄露 API Key。

## 11. 缺陷等级与停止线

- P0：数据损坏、密钥泄露、任意代码执行、无法启动；
- P1：角色卡/世界书丢字段、分支状态污染、记忆回滚错误、合法聊天无法继续；
- P2：个别兼容字段或界面行为不一致，但有可用替代路径；
- P3：文案、视觉和非关键易用性问题。

最终验收不得存在 P0/P1。P2 必须记录影响、复现方式和后续处理；P3 可进入已知限制。

## 12. 第一阶段完成定义

只有同时满足以下条件，第一阶段才视为完成：

1. 本文里程碑 A-F 均达到退出标准；
2. 自动测试与 200 轮压力测试通过；
3. 使用 `v4.0.png` 的 50 轮真实叙事测试通过；
4. 本地安装、启动、备份、恢复和重启续聊可复现；
5. 未发现 P0/P1；
6. 文档与实际行为一致；
7. 用户确认验收结果。

在此之前，不开始编写第二阶段开发文档，也不把多 NPC 功能纳入默认产品路径。

## 13. 当前实现与验收记录

本节记录实际完成情况，不改变第 12 节的完成定义。自动门禁和真实模型 50 回合硬验收均已通过；第一阶段只剩第 12.7 项的用户确认。

### 13.1 已实现功能

- 在 Taverncraft `a47718b50d3249a2b531d26d92a600f45826b658` 基线上建立 `world-engine/phase1-single-npc` 分支，保留原许可证和上游结构；
- Character Card V3 `ccv3` 优先读取、校验、PNG 双元数据写回，以及根级、`data`、`extensions` 和 Character Book 未知字段的双向保留；
- `v4.0.png` 的 19 个可选开场状态隔离：`GameStart` 不预先生成时间、地点或 NPC，18 个显式开场按各自 `initvar` 初始化；
- 单 NPC 权威世界状态、SHA-256 状态哈希、`WorldOperationV1` 原子校验、幂等、事件链、确定性重放及严格标签回退；
- Floor State 下的编辑、删除、重生成、Swipe 和分支隔离，废弃 Swipe 不再向当前世界状态泄漏；
- 世界事件到 Memory Graph 的来源关联、可追溯召回、30 回合以上事实测试和分支回滚；Memory Graph 默认关闭，仅在用户明确勾选后启用，避免后台模型请求抢占主对话；
- 精确记忆请求会从当前可见 Memory Graph 中只选取用户指定来源回合的 `memory_anchor`，在同一轮最终请求中注入可追溯原文，要求模型先逐字回答再解释；
- World Engine Post-History 四级作用域、`inherit/off/example/custom` 覆盖、导入导出、Token 估算及 Request Inspector 透明显示；
- 轻量地点列表、状态检查器、带哈希校验的状态备份导入导出、服务器重启恢复和本地 Prompt Dry Run；
- OpenAI-compatible 优先接入、流式/非流式交付、中断取消与中断后立即续发；
- 模型供应商失败时回滚空助手占位和未提交世界操作；非法工具参数只允许一次语义纠错，显式安全探针只拒绝、不自动改写成合法状态变更；
- `stLegacy` 与 `worldEngine` 扩展命名空间受保护，WorldPack/MOD 可写数据限定在声明过的 `world`、`worldPack`、`mod` 等命名空间；
- ST 风格 Persona、编辑、删除、继续、重生成、多 Swipe、分支、聊天合并/拆分、JSONL 导入导出；内部聊天 ID 统一为无 `.jsonl` 后缀，避免重复扩展名；
- 合并/拆分弹窗在显示时即完成事件绑定，支持重排、裁剪、重复源、名称冲突、状态隔离和 SQLite 存储。

### 13.2 `v4.0.png` 实测证据

| 项目 | 实测结果 |
|---|---|
| PNG / V3 读取 | 通过；优先 `ccv3`，解码 SHA-256 与第 5 节一致 |
| 世界书 | 174 条导入、173 条启用、33 条常驻，计数通过 |
| PNG 往返 | 原始 V3 JSON 所有值在写入、再读取后保持一致 |
| 开场 | 1 个 `GameStart` 未初始化状态 + 18 个显式开场全部通过 |
| 浏览器导入 | 卡面、角色选择、19 个开场和聊天创建通过 |
| 64K Dry Run | 上下文设为 65,536；激活 28 条世界书（16 条 before、12 条 at-depth）；本地组装提示词 18,737 字符；不调用模型 |
| 开场切换隔离 | 从第 1 开场切到第 2 开场可得到对应时间、地点、NPC；切回第 1 开场恢复未初始化状态 |
| ST 聊天操作 | Persona、多 Swipe、重生成、分支、JSONL 导出/导入和重启后重开均通过 |
| 真实模型长对话 | DeepSeek `deepseek-v4-flash`、65,536 上下文、明确 Persona；完整生成 50/50 轮并通过全部硬断言 |
| 30+ 轮精确记忆 | 第 35、40、47 轮分别逐字召回第 2、7、14 轮事实；三个结果均带来源节点且断言通过 |
| 请求与隐私证据 | 重启前 64、重启后 36 个相关请求，按 ID 去重后共 100；世界书层和非法操作探针均可见；密钥泄露为 false，泄露文件为空 |

### 13.3 自动门禁结果

2026-07-20 在本地 Node/Jest/Playwright 环境执行最终回归：

| 门禁 | 结果 | 覆盖重点 |
|---|---:|---|
| Phase 1 Jest 契约/集成套件 | 27 套件、160 项全部通过 | V1/V2/V3、V4 无损往返、19 开场、世界状态、Memory Graph、Post-History、Request Inspector、OpenAI-compatible、WebSocket 中断、工具纠错、跨重启证据合并、ONNX/Protobuf 兼容性 |
| 完整单角色聊天 E2E | 28/28 通过 | 流式/非流式、编辑、删除、继续、中断恢复、Swipe、重生成、分支、合并/拆分、聊天导入导出、SQLite、世界状态备份恢复、供应商错误清理、工具非法参数单次纠错与重启持久化 |
| 真实卡与工具运行专项 E2E | 2/2 通过 | `v4.0.png` 的 174 条内嵌世界书经真实 UI 导入、扫描与重启恢复；原生函数调用完成工具往返 |
| 角色 ZIP 导入 E2E | 2/2 通过 | `adm-zip` 安全升级后，CHARX 与 BYAF 仍可通过真实界面导入 |
| 原失败场景定向回归 | 9/9 通过 | 中断后续发及全部合并变体 |
| 世界状态备份/重启 E2E | 1/1 通过 | 真实 UI 编辑与导出、密钥字段隔离、篡改哈希拒绝、合法恢复、服务器重启后状态与哈希一致 |
| 世界状态长跑 | 200 回合通过 | 无状态漂移；编辑、删除和 Swipe 回滚一致 |
| 长期记忆长跑 | 200 回合通过 | 指定 30+ 回合事实可追溯召回；废弃分支事实不可见 |
| `v4.0.png` 真实模型硬门 | 50/50 轮通过 | 8 个世界状态事件、2 次编辑、3 次 Swipe、1 次分支、1 次服务器重启、1 次非法写入拒绝；第 35/40/47 轮精确召回，最终无 P0/P1 |
| 干净安装与启动 | 通过 | 排除 `.git`、`node_modules`、`data` 后复制工作树，`npm ci` 成功；自动创建全新文件存储，HTTP 200 且返回 World Engine manifest |
| 生产依赖安全审计 | 31 项降至 12 项；Critical 1 降至 0 | 修复角色 ZIP、HTTP/表单/WebSocket 及 Protobuf/Undici 问题；剩余项按下表登记 |

可复现命令（从仓库 `tests` 目录运行）：

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runTestsByPath world-engine/*.test.js character-card-v3-roundtrip.test.js request-inspector-prompt-layers.test.js tavern-card-validator.test.js luker-dispatch/providers/openai-compatible.test.js ws-delivery-client.test.js ws-delivery-fetch-proxy.test.js dependency-security-compatibility.test.js --runInBand
./node_modules/.bin/playwright test --project=e2e --workers=1 e2e/chat
./node_modules/.bin/playwright test --project=e2e --workers=1 e2e/character/29-import-real-v4-worldbook.e2e.js e2e/extensions/98-function-call-runtime.e2e.js
```

面向使用者的启动、ST 迁移、世界状态备份/恢复、隐私、许可证和已知限制已写入 `docs/features/world-engine.md` 与 `docs/zh-CN/features/world-engine.md`，并从 README 和文档导航提供入口。VitePress 页面构建通过；仓库的 `npm run build` 预步骤仍依赖系统安装 `d2`，本地缺少该二进制时可直接运行 `./node_modules/.bin/vitepress build` 验证不含新图表的文档改动。

测试启动时会看到 Stable Diffusion 扩展探测 `localhost:7860` 的 `ECONNREFUSED` 日志；本阶段不依赖 Stable Diffusion，相关请求不影响上述门禁结果。依赖外部 MySQL/PostgreSQL 服务的全仓库测试没有在当前环境执行；本阶段实际使用的文件存储与 SQLite 聊天路径已覆盖。

### 13.4 依赖安全审计与已知风险

本轮将 `adm-zip` 升级至 `0.6.x`，锁定安全版本的 `undici` 与 `protobufjs`，并更新兼容范围内的 HTTP、表单、WebSocket 等依赖。针对 `sillytavern-transformers -> onnxruntime-web -> onnx-proto` 的 Protobuf 覆盖增加了 ONNX `ModelProto` 编解码契约测试，避免仅凭审计结果升级而破坏本地嵌入模型。`npm audit` 从 15 moderate、15 high、1 critical 降至 8 moderate、4 high、0 critical。

尚存报告没有在第一阶段路径中复现 P0/P1，但在上游提供兼容修复前按 P2/P3 跟踪：

| 等级 | 依赖链与影响 | 复现/当前结论 | 后续处理 |
|---|---|---|---|
| P2 | `chevrotain -> lodash-es` 报告 high | 审计可复现；问题位于编译器/生成器工具 API，当前单 NPC 解析路径未调用这些 API。自动修复要求 Chevrotain 12 和 Node 22，属于运行时基线及主版本迁移 | Node 22 兼容里程碑中升级 Chevrotain，重跑世界书、宏和聊天全量回归 |
| P2 | `sillytavern-transformers -> jimp/file-type` 报告 moderate | 只影响可选的本地 Transformers 图像处理链；Phase 1 对话、世界状态和 Memory Graph 不依赖该链。审计建议的 `2.17.2` 已被包作者标记为 broken，因此拒绝强制升级 | 等待可用上游版本；启用本地图像管线前进行隔离输入与专项回归 |
| P2 | `showdown` ReDoS 报告 moderate | 恶意超长 Markdown 可能造成本地界面可用性下降；未观察到数据损坏、密钥泄露或代码执行 | 跟踪上游修复，并在后续输入预算/渲染超时工作中加固 |
| P3 | `vectra -> uuid` 报告 moderate | 影响旧 UUID API 的内部缓冲行为；未在 Phase 1 的文件存储、SQLite、记忆召回中复现故障。自动修复要求 Vectra 主版本及 Node 22 | 与 Node 22/向量存储升级一起迁移，增加记忆索引兼容测试 |

因此自动门禁与真实模型 50 回合均未发现 P0/P1；以上 P2/P3 不阻断第一阶段单 NPC 路径验收。

### 13.5 真实模型 50 回合硬门结果

2026-07-20 使用用户授权的 DeepSeek OpenAI-compatible 测试连接执行 `tests/e2e/live/phase1-v4-real-50-turn.e2e.js`，耗时 8.7 分钟，结果 `1 passed`。API Key 仅作为进程环境变量临时注入，未写入连接文件、测试报告、文档或 Git。

硬门证据：

1. 固定 50 轮中文叙事全部生成并持久化，最终轮存在有效助手回复；
2. 完成 8 个世界状态事件，状态哈希与事件链保持一致；
3. 第 10、24 轮编辑，第 18、30、42 轮 Swipe，第 26 轮分支，第 32 轮服务器重启全部成功；
4. 第 33 轮非法原型/扩展命名空间写入被拒绝，拒绝前后状态哈希完全相同，且没有被语义纠错改写成其他合法变更；
5. 第 35、40、47 轮分别逐字召回第 2、7、14 轮保存的事实，跨度均不少于 30 个用户回合；
6. Memory Graph 最终存在 9 个节点，三个验收事实均能追溯到对应 `memory_anchor`；
7. Request Inspector 跨重启汇总 100 个去重相关请求，确认世界书提示层与非法操作探针进入真实供应商请求；
8. 脱敏检查确认请求证据、报告和工作区扫描均未发现 API Key；
9. 真实模型硬门之后再次执行 27/27 Jest 套件（160/160 项）、完整聊天 E2E（28/28）和真实卡/函数调用专项（2/2），全部通过。

至此第 12.1 至 12.6 项均已满足，未发现 P0/P1。取得用户确认后即可把顶端状态改为“第一阶段验收完成”；按约定，在确认前仍不编写第二阶段开发文档。
