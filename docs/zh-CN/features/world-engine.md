# 世界引擎（第一阶段）

世界引擎是在 Taverncraft 现有 SillyTavern 兼容角色卡、世界书、Persona、预设和聊天流程上增加的本地优先、单 NPC 剧情引擎。它加入受约束、可审计、可回滚的权威世界状态，但不替换原有角色卡或聊天格式。

第一阶段明确不运行多 NPC 自主模拟、远距离 NPC 补算、地图寻路、多人联机或不可信 MOD 代码。Taverncraft 原有多 Agent 组件仍保留，但在这一产品路径中默认关闭。

## 环境与启动

- Node.js 20.18.1 或以上；
- Taverncraft 本地数据目录具备正常读写权限；
- 真实对话需要在 Taverncraft 连接管理器中配置 OpenAI-compatible 连接。不要把 API Key 写入角色卡、世界书、聊天导出、状态备份、测试文件或 Git。

在仓库根目录运行：

```bash
npm ci
npm start
```

打开 Taverncraft 输出的本地地址，导入角色卡并创建聊天，然后在扩展抽屉中确认 **World Engine** 已启用；需要时可以关闭。Memory Graph 是独立的明确启用项，不会随世界引擎自动开启。

## SillyTavern 兼容范围

支持 Character Card V1/V2/V3 JSON/PNG、内嵌 Character Book、独立 World Info、Persona、预设和 JSONL 聊天。当 PNG 同时具有 `chara` 与 `ccv3` 时，以 `ccv3` 为真值。导入、编辑、导出时保留未知的卡片字段、扩展字段和世界书条目字段。

世界引擎不会改写角色卡原生 System Prompt 或 `post_history_instructions`。World Engine Post-History 是额外的透明提示层，具备全局、模型预设、角色卡和聊天四级作用域。Request Inspector 会显示生效来源、拼装顺序、Token 估算和截断情况。

## 世界状态与模型操作

状态检查器显示当前时间、地点、玩家、活动 NPC、物品、关系、任务、标记和扩展命名空间。模型不能直接替换状态，只能通过原生 Tool Call 提出经过校验的 `WorldOperationV1`；模型不支持工具时才使用严格标签包裹的 JSON 回退。

每次合法操作都会记录预期哈希、结果哈希、来源消息、Swipe 和 Floor。编辑、删除、重生成、切换 Swipe 或创建分支时，世界状态和 Memory Graph 视图会恢复到对应历史。普通叙事中即使出现类似 JSON 的文本，也不能改变状态。

## 备份、恢复与重启

建议同时使用两种备份：

1. 使用 Taverncraft 的完整数据备份保存角色、聊天、Persona、预设、Secret、扩展设置和辅助状态；
2. 在 World Engine 中选择 **导出状态备份**，保存当前权威世界状态的可移植快照。

状态文件采用 `world-engine-state-backup-v1`，只包含规范化状态、来源聊天/角色标签、导出时间和 SHA-256 状态哈希，不包含连接设置或 API Key。

恢复时先打开目标角色聊天，再选择 **校验并导入备份**。超过 5 MB、JSON 错误、危险对象键、不支持的 Schema 或哈希不一致的文件，会在修改当前状态之前被拒绝。合法导入会在当前聊天 Floor 新建一次提交，因此之后的历史回滚语义保持不变。

应用重启后，重新打开同一角色和聊天，并在继续前核对：当前 Swipe、可见历史、世界状态哈希、Memory Graph 启用状态、Persona 锁定和模型预设。API Secret 只保存在 Taverncraft 本地 Secret/连接配置中，不会进入可移植导出文件。

## 迁移与退出

导入原有 SillyTavern 数据无需先重写格式。先备份来源数据，再使用 Taverncraft 原有迁移/导入流程。世界引擎使用独立 Floor State 命名空间，只添加扩展元数据，不删除原卡片或聊天字段。

更换存储后端或同步上游 Taverncraft 之前：

1. 创建 Taverncraft 完整备份，并导出重要的世界状态；
2. 记录当前分支与提交，运行第一阶段回归门禁；
3. 执行上游更新或存储迁移；
4. 重新打开已知聊天，比较状态哈希、当前 Swipe、记忆来源、世界书激活追踪和 Request Inspector 层级。

若要退出世界引擎，关闭扩展，并按正常 SillyTavern 兼容格式导出聊天和角色卡。额外扩展字段会被保留；不理解它们的客户端会忽略这些字段。迁移到尚未验证未知字段保留能力的客户端时，必须保留原始数据备份。

## 隐私与安全

- 除非已为预期用户配置 Taverncraft 鉴权和网络限制，否则只在本机运行服务；
- Request Inspector 元数据在保存前经过白名单与长度限制，并在请求服务商前从请求体删除；
- 状态和 Post-History 导出不包含 API Key、Cookie、Authorization 或连接配置；
- 不要在未检查的情况下导入不可信状态或 MOD 数据。第一阶段只校验声明式状态，不执行 MOD 代码；
- 模型输出属于不可信输入。非法、冲突、旧哈希或无权限操作会被拒绝，且不会修改当前状态。

## 已知限制

- 第一阶段最终验收仍需要用户选择真实模型并完成 50 回合剧情；离线 Dry Run 和 200 回合合成测试不能证明服务商的叙事质量；
- 第一阶段只验收一个活动 NPC，远距离 NPC 调度和补算属于后续工作；
- Memory Graph 启用后可能产生额外模型请求与费用，因此保持明确选择启用；
- 本地显示的 Token 数是估算值，以服务商实际分词和限制为准；
- 严格标签操作回退的可靠性低于原生 Tool Call；
- MySQL/PostgreSQL 依赖外部服务，不属于第一阶段本地文件/SQLite 验收路径；
- 不保证任意第三方 ST 前端扩展或可执行 MOD 直接兼容。

## 许可证与验收状态

本下游开发保留 Taverncraft 的 AGPL-3.0 许可证、版权声明与源码结构。发布、分发或网络托管前需要单独审查 AGPL 源码提供义务。

[第一阶段开发与验收计划](/development/phase1-single-npc-world-engine)是实现和验收的权威清单。仅本地自动测试通过不代表第一阶段已经验收；仍需通过真实模型门禁并取得用户确认。
