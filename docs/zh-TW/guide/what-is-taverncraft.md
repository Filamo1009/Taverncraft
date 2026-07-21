# Taverncraft 酒館工坊是什麼

Taverncraft 酒館工坊是基於 [Luker](https://github.com/funnycups/Luker) 深度開發的世界模擬與角色扮演平台；Luker 本身源自 [SillyTavern](https://github.com/SillyTavern/SillyTavern)。它保留 SillyTavern 成熟的角色卡生態與資料格式相容性，同時加入權威世界狀態、提示詞檢查、長期記憶和可擴充 Mod 架構。

Taverncraft 支援目前相容性測試涵蓋的標準 SillyTavern 資料路徑，包括 Character Card V1/V2/V3、世界書、Persona、預設與 JSONL 聊天。Taverncraft 專屬狀態以附加資料保存，其他客戶端可能忽略它。遷移或降級前必須備份，不要在未經驗證時假設任意第三方擴充都會保留全部欄位。

## 為什麼選擇 Taverncraft

SillyTavern 是一款優秀的角色扮演前端，擁有活躍的社群和豐富的角色卡生態。Taverncraft 在此基礎上，針對以下方向做了系統性改進：

### 更高效的資料傳輸

SillyTavern 的大部分儲存操作採用全量傳輸——每次編輯訊息、切換設定、修改世界書，都會將完整資料傳送到後端。對於雲端部署的使用者，這意味著顯著的流量消耗。

Taverncraft 引入了增量同步機制，統一使用遵循 [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) 標準的 patch 端點。以前開關一個外掛設定可能傳輸 3MB 資料，現在不到 200 位元組。儲存操作還支援延遲觸發和衝突偵測，從根本上避免了並行寫入導致的資料損壞。

### 更強的擴充能力

Taverncraft 為外掛開發者提供了更豐富的基礎設施：角色/預設狀態 API、託管正則提供者、統一的擴充注入設定、函式呼叫執行環境等。外掛可以方便地複用使用者已有的 API 預設和聊天補全預設，無需重複設定。

### 內建專業工具鏈

Taverncraft 內建了多個面向角色扮演場景的專業工具——記憶圖、多 Agent 編排、角色卡編輯助手、搜尋外掛等，開箱即用，無需額外安裝第三方擴充。

## 核心特性概覽

### 記憶圖（Memory Graph）

基於知識圖譜結構的角色記憶系統。將角色扮演中的事件、人物、地點、主線等資訊組織為圖結構，透過認知層處理、向量索引檢索和擴散式記憶傳播實現智慧記憶召回。召回模型可以在圖中多輪深挖，找出與當前劇情最相關的記憶節點注入創作上下文。

→ [記憶圖詳細文件](/zh-TW/features/memory-graph)

### 多 Agent 編排（Orchestrator）

在創作 LLM 生成回覆之前，可以先由 Agent 分析與編排劇情。目前提供五種執行模式：Spec、單 Agent、Agenda、Loop 與 Director。多數模式產生精簡 capsule 交給主模型，Director 則直接接管最終正文。角色卡綁定與檔案級匯入匯出能力因模式而異，以各模式專題為準。

→ [多 Agent 編排詳細文件](/zh-TW/features/orchestrator/)

### 角色卡編輯助手（CEA / CardApp Studio）

整合 CodeMirror 6 程式碼編輯器的 AI 輔助角色卡編輯工具。支援透過自然語言對話編輯角色卡和世界書，每批修改提供 diff 審批。當角色卡更新時，自動偵測世界書變更並提供智慧同步方案。普通角色卡用彈窗版編輯助手，含 CardApp 的角色卡進入功能更完整的 Studio。

→ [角色卡編輯助手概覽](/zh-TW/features/card-editor/)　·　[普通彈窗](/zh-TW/features/card-editor/popup)　·　[CardApp Studio](/zh-TW/features/card-editor/studio)

### 搜尋外掛（Search Tools）

為 AI 提供聯網搜尋能力，支援 DuckDuckGo、SearXNG、Brave Search 等搜尋引擎後端。提供兩種工作模式：作為創作 LLM 的可呼叫工具，或作為預請求 Agent 在生成前自動搜尋並將結果寫入世界書。

→ [搜尋外掛詳細文件](/zh-TW/features/search-tools)

### 預設解耦

SillyTavern 中 API 預設和聊天補全預設是連動切換的。Taverncraft 將兩者解耦，切換 API 連線不會連帶切換聊天補全預設，你可以自由搭配不同的 LLM 後端和提示詞預設。

### 增量同步

世界書、聊天記錄、使用者設定等內容的儲存統一使用遵循 RFC 6902 標準的 patch 端點，大幅減少資料傳輸量。搭配延遲觸發和衝突偵測（409 回應），確保多端場景下的資料一致性。

### 函式呼叫執行環境（Function Call Runtime）

統一的函式呼叫 / 工具呼叫執行環境，支援兩種模式：

- **原生工具呼叫**：相容 OpenAI、Claude、Gemini 等 API 的原生 tool call 格式
- **純文字函式呼叫**：透過文字協定實現工具呼叫，適用於不支援原生工具呼叫的模型

### CardApp

角色卡內嵌應用執行環境。允許角色卡攜帶自訂應用邏輯，提供上下文 API 和生命週期管理。

### 提示詞分組 & 預設分組

預設管理器和提示詞管理器支援可摺疊的分組系統，方便組織和管理大量預設與提示詞條目。

### 角色卡綁定預設與人設

角色卡可以綁定專屬的聊天補全預設和使用者人設（Persona）。綁定的預設和人設獨立於全域列表，不會污染使用者的全域設定，關閉角色卡聊天後自動消失，並可隨角色卡匯入匯出。角色卡開發者不必再要求使用者手動匯入專屬預設。

### 請求檢查器（Request Inspector）

每位使用者的生成請求診斷工具，可追蹤所有後端（包括圖像生成）的請求詳情，方便除錯和排查問題。

### 認證與配額

支援 GitHub / Discord OAuth 登入，管理員可為每位使用者設定空間大小配額。Discord 登入可額外要求使用者必須在指定伺服器中或擁有特定身分組。

::: tip 更多特性
Taverncraft 還包含許多其他改進：Undo Toast 復原系統、聊天人設鎖定（Chat Persona Lock）、動態模型列表、世界書啟用鏈路追蹤、預設關聯世界書、大量行動裝置 / Android 適配最佳化、啟動效能最佳化等。這些特性將在各自的專題頁面中詳細介紹。
:::

## 相容性

Taverncraft 對以下標準 SillyTavern 資料路徑保持經過測試的相容性：

| 資料類型 | 相容性 |
|---------|--------|
| 角色卡（PNG/JSON） | 已涵蓋 V1/V2/V3 匯入匯出與未知欄位往返 |
| 世界書 / Lorebook | 已涵蓋內嵌與獨立世界書路徑 |
| 聊天記錄 | 已涵蓋 JSONL 匯入匯出與常用聊天操作 |
| 聊天補全預設 / Persona | 支援；遷移後需核對綁定的 Taverncraft 擴充狀態 |
| 第三方擴充 | 使用相容載入介面，但不保證任意擴充直接可用 |
| 使用者設定 | 支援；應以 Taverncraft 預設設定為基礎逐項遷移 |

::: info 雙向遷移
世界引擎、記憶圖和編排設定等 Taverncraft 專屬資料保存在附加狀態或擴充中繼資料中；不理解它的客戶端可能忽略這些內容，不同客戶端保留未知欄位的能力也不同。雙向遷移都必須保留備份，並在完成後核對一張已知角色卡與聊天。
:::

## 下一步

準備好開始使用了嗎？

→ [快速開始](/zh-TW/guide/getting-started) — 安裝和部署 Taverncraft
