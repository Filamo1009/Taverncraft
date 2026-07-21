# 從 SillyTavern 遷移

Taverncraft 是 Luker 與 SillyTavern 的下游專案，保留目前相容性測試涵蓋的標準資料路徑。角色卡、世界書、Persona、預設與 JSONL 聊天通常可以直接遷移，但必須保留備份，並分別驗證第三方擴充和 Taverncraft 專屬狀態。

::: tip 在 Android 上從 Termux 遷移？
本指南適用於 PC / Linux / Docker → Taverncraft，以及 **Termux(SillyTavern) → Termux(Taverncraft)**，兩端共用檔案系統，按下面步驟複製 `data/` 即可。

只有 **Termux → Taverncraft APK** 因為 Android 沙盒隔離需要走 `/sdcard` 中轉，請參考 [從 Termux 遷移到 Taverncraft APK](/zh-TW/guide/migration-from-termux)。
:::

## 遷移步驟

### 1. 備份現有資料

在遷移之前，建議備份 SillyTavern 的 `data/` 目錄：

```bash
cp -r SillyTavern/data/ SillyTavern-data-backup/
```

### 2. 安裝 Taverncraft

按照 [快速開始](/zh-TW/guide/getting-started) 中的步驟安裝 Taverncraft。

### 3. 複製資料目錄

將 SillyTavern 的 `data/` 目錄複製到 Taverncraft 的資料根目錄下（預設為 `./data`）：

```bash
cp -r SillyTavern/data/* Taverncraft/data/
```

如果你在 `config.yaml` 中自訂了 `dataRoot`，請複製到對應路徑。

### 4. 遷移設定檔

將 SillyTavern 的 `config.yaml` 中你自訂過的設定項遷移到 Taverncraft 的 `config.yaml` 中。建議以 Taverncraft 的預設設定檔為基礎，逐項遷移你的自訂值，而不是直接覆蓋整個檔案。

### 5. 遷移第三方擴充

如果你安裝了第三方擴充，將 SillyTavern 的全域擴充目錄複製到 Taverncraft：

```bash
cp -r SillyTavern/public/scripts/extensions/third-party/* Taverncraft/public/scripts/extensions/third-party/
```

### 6. 複製使用者設定（多使用者模式）

如果你啟用了多使用者模式（`enableUserAccounts: true`），使用者資料儲存在 `data/<使用者名稱>/` 子目錄中，目錄結構與 SillyTavern 一致，直接複製即可。

### 7. 啟動 Taverncraft

```bash
node server.js
```

首次啟動時，Taverncraft 會自動識別已有資料並正常載入。

## 資料相容性

目前相容性測試涵蓋以下標準資料路徑：

| 資料類型 | 相容性 | 說明 |
| --- | --- | --- |
| 角色卡（PNG/JSON） | 已測試 | V1/V2/V3、內嵌世界書與未知欄位往返 |
| 聊天記錄（.jsonl） | 已測試 | 匯入匯出與常用編輯、Swipe、分支路徑 |
| 世界書（World Info） | 已測試 | 內嵌與獨立世界書路徑 |
| 預設 / Persona | 支援 | 遷移後核對綁定的 Taverncraft 擴充狀態 |
| 擴充設定 | 需逐項驗證 | 載入介面相容，但不保證任意擴充直接可用 |
| 群聊 | 繼承路徑 | 遷移後核對部署中重要的群組聊天 |
| API 金鑰（secrets） | 敏感資料 | 只在可信本機安裝間遷移，禁止提交或公開檔案 |

## Taverncraft 新增的狀態檔案

Taverncraft 在執行過程中會在資料目錄中產生一些額外的**狀態檔案**，用於儲存 Taverncraft 獨有功能的資料：

- `.luker-state.<chat_id>.json` — 聊天狀態檔案，儲存增量同步的完整性校驗值等
- 角色卡狀態檔案 — 儲存角色綁定預設、記憶圖資料、編輯助手工作階段等
- 預設狀態檔案 — 儲存預設關聯的世界書等擴充狀態

這些檔案**不會影響 SillyTavern 的原始資料**。如果你需要將資料遷回 SillyTavern，只需忽略這些狀態檔案即可。SillyTavern 不會讀取它們，也不會因為它們的存在而出錯。

## 注意事項

1. **Node.js 版本**：Taverncraft 要求 Node.js >= 20.18.1。遷移前請以目前 `package.json` 為準。

2. **第三方擴充**：Taverncraft 使用相容的擴充載入介面，擴充目錄位於 `public/scripts/extensions/third-party/`。重要擴充必須逐一測試，不保證任意前端擴充直接可用。

3. **設定檔**：SillyTavern 的 `config.yaml` 與 Taverncraft 的格式相容，但 Taverncraft 新增了一些設定段（如 `sso`、`hostWhitelist` 等）。`requestProxy` 等設定項是 SillyTavern 已有的，無需額外處理。建議以 Taverncraft 的預設 `config.yaml` 為基礎，將你的自訂設定遷移過來。詳見 [基礎設定](/zh-TW/guide/configuration)。

4. **預設解耦**：Taverncraft 將 API 連線參數與預設分離。遷移後，你的預設仍然正常運作，Taverncraft 會在載入時自動處理欄位分類。

5. **遷回其他客戶端**：標準匯出可由相容客戶端讀取，但世界引擎、記憶圖和編排器狀態可能被忽略。必須保留原始備份，並驗證目標客戶端會保留未知欄位，才能把遷回路徑視為無損。

6. **Docker 部署**：如果你使用 Docker 部署，請參考 Taverncraft 提供的 `docker-compose.yml` 參考設定，將資料目錄掛載為卷。
