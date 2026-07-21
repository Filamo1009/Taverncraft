# 快速開始

本指南將幫助你在幾分鐘內啟動並執行 Taverncraft。

## 前置條件

| 依賴 | 要求 |
| --- | --- |
| **Node.js** | >= 20.18.1（僅 Git Clone 方式需要；以 `package.json` 宣告為準） |
| **Git** | 任意版本（僅 Git Clone 方式需要） |
| **Docker** | 任意現代版本（僅 Docker 方式需要） |

你還需要準備一個可用的 LLM API（OpenAI、Claude、Google Gemini、本機模型等）。

## 安裝方式一：Git Clone

適合希望自行管理和更新的使用者。

### 1. 複製儲存庫

```bash
git clone https://github.com/Filamo1009/Taverncraft.git
cd Taverncraft
```

### 2. 安裝依賴

```bash
npm ci
```

### 3. 啟動服務

```bash
node server.js
```

你也可以使用儲存庫提供的啟動腳本，它會自動安裝依賴並啟動：

```bash
bash start.sh
```

::: tip 其他執行環境
Taverncraft 也支援透過 Deno 或 Bun 啟動：
```bash
# Deno
npm run start:deno

# Bun
npm run start:bun
```
:::

### 4. 更新

```bash
git pull
npm ci
```

## 安裝方式二：Docker

適合伺服器部署或希望開箱即用的使用者。Taverncraft 提供了預建置的 Docker 映像檔。

### 1. 建立 `docker-compose.yml`

在你希望存放資料的目錄下建立 `docker-compose.yml`：

```yaml
services:
  taverncraft:
    image: ghcr.io/filamo1009/taverncraft:latest
    container_name: taverncraft
    ports:
      - 127.0.0.1:8000:8000
    volumes:
      - ./plugins:/home/node/app/plugins
      - ./config:/home/node/app/config
      - ./data:/home/node/app/data
      - ./extensions:/home/node/app/public/scripts/extensions/third-party
    restart: unless-stopped
```

### 2. 啟動容器

```bash
docker compose up -d
```

::: warning 連接埠綁定與安全防護
預設設定將連接埠綁定到 `127.0.0.1:8000`，僅允許本機存取。如需遠端存取，請將 `127.0.0.1:8000:8000` 改為 `0.0.0.0:8000:8000`，並確保做好以下安全防護：

- **反向代理 + HTTPS**：透過 Nginx 等反向代理提供 HTTPS 加密
- **啟用登入機制**：開啟 Basic Auth（`basicAuthMode: true`）或多使用者登入（`enableUserAccounts: true`），防止未授權存取。詳見 [基礎設定](/zh-TW/guide/configuration#認證與多使用者)
:::

### 3. 更新映像檔

```bash
docker compose pull
docker compose up -d
```

## 安裝方式三：Android APK

Taverncraft 提供 Android APP，你可以直接在手機上執行 Taverncraft，無需依賴雲端伺服器或 Termux。

前往 GitHub Release 頁面下載最新版 APK：

👉 [https://github.com/Filamo1009/Taverncraft/releases/latest](https://github.com/Filamo1009/Taverncraft/releases/latest)

下載並安裝 APK 後，開啟應用即可直接使用。

## 首次設定

### 存取 Taverncraft

啟動成功後，在瀏覽器中存取：

```
http://localhost:8000
```

::: tip Android 使用者
APK 版本是一個獨立的 App，開啟後直接顯示完整介面，不需要另外使用瀏覽器存取地址。
:::

### 設定 API 連線

首次進入 Taverncraft 後，你需要設定至少一個 LLM API 才能開始對話：

1. 點擊頂部的 **API 連線** 圖示
2. 選擇你的 API 類型（如 OpenAI、Claude 等）
3. 填入 API 地址和金鑰
4. 測試連線是否成功

詳細說明請參閱 [API 連線設定](/zh-TW/basics/connections)。

### 選擇或匯入角色卡

設定好 API 後，你可以：

- 從角色卡列表中選擇一個角色開始對話
- 點擊 **匯入** 按鈕，匯入 `.png` 或 `.json` 格式的角色卡檔案

了解更多請參閱 [角色卡基礎](/zh-TW/basics/character-cards)。

## 從 SillyTavern 遷移

Taverncraft 支援目前相容性測試涵蓋的標準 SillyTavern 角色卡、世界書、Persona、預設與 JSONL 聊天格式。遷移前請備份來源資料，依照遷移指南操作，並在完成後開啟一段已知聊天核對。Taverncraft 專屬狀態保存在擴充資料中，不理解它的客戶端可能忽略這些內容；任意第三方擴充不保證可以直接遷移。

::: warning 備份提醒
遷移或降級前必須備份。除非相應路徑已經驗證，不要假設其他客戶端一定會保留未知擴充欄位。
:::

詳細遷移指南請參閱 [從 SillyTavern 遷移](/zh-TW/guide/migration)。

## 下一步

- [設定 API 連線](/zh-TW/basics/connections) — 連接你的 LLM 服務
- [了解角色卡](/zh-TW/basics/character-cards) — 開始你的第一次角色扮演
- [從 SillyTavern 遷移](/zh-TW/guide/migration) — 如果你是 SillyTavern 使用者
