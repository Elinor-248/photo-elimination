# CLAUDE.md — 照片淘汰賽

這份是每次開工都要讀的工作守則。完整規格在 `docs/SPEC.md`，測試清單在 `docs/testing.md`，排錯紀錄在 `docs/troubleshooting.md`。

## 這是什麼專案

多人即時拍照派對遊戲，放在 GitHub Pages。系統出題（例如「黃色的東西」），玩家在時限內用網頁內建相機拍照，時間到一起揭曉，大家投票把最爛的人淘汰，直到剩下最後一人。

- 前端：純 HTML / CSS / JavaScript（ES modules），不需要建置流程
- 後端：Firebase Realtime Database + Anonymous Auth，只用免費的 Spark 方案
- 介面語言：繁體中文

## 每次工作的流程

1. **了解現況**：讀這份文件，執行 `git log --oneline -20` 看最近做了什麼。
2. **讀規格**：打開 `docs/SPEC.md` 中和這次任務有關的章節。規格是這個專案的唯一依據。
3. **先提計畫**：除了錯字、單行修正這類小改動之外，動手前先用條列跟使用者說要改哪些檔案、怎麼改，等使用者同意再開始。
4. **實作**：遵守下方的「技術限制」和「命名與放置」。
5. **驗證**：
   - 一定要跑 `node --test tests/`，全部通過才算完成。
   - 改到遊戲流程、多人同步或畫面時，照 `docs/testing.md` 跑對應的手動測試項目。
   - 跑不了的項目（例如需要實體手機），要在回報裡明講沒測。
6. **同步規格**：行為有改變，就在同一個 commit 裡更新 `docs/SPEC.md`。程式碼和規格不能互相矛盾。
7. **留下經驗**：這次如果有卡關後才解決的問題，照下方「排錯與經驗累積」記錄下來。
8. **提交**：開新分支、照下方格式寫 commit、開 PR。不要直接 push 到 `main`。

## 一定要先問使用者的事

- 改遊戲規則（淘汰人數、平手處理、超時、投票資格等，也就是 SPEC 第 3 章的任何內容）
- 改 Firebase 資料結構或 `firebase/database.rules.json`
- 新增外部服務、CDN 函式庫或任何依賴
- 刪除既有功能或畫面
- 規格沒寫到、要你自己判斷產品行為的地方
- 發現規格和程式碼互相矛盾時：先停下來回報，不要自己挑一邊

## 可以直接做的事

- 修 bug（行為照規格）
- 調整樣式、動畫、排版（不超出 SPEC 第 2 章的風格）
- 新增或修改內建題目（`data/prompts.json`）
- 修改介面文字（`i18n/zh-TW.js`）
- 補測試、重構但不改行為

## 技術限制（不能違反）

這些是已經決定好的事，不要提議改掉，除非使用者主動提起。

- **只用 Firebase 免費 Spark 方案。** 不能用 Cloud Functions、Cloud Storage、Cloud Scheduler，也不能用任何需要綁卡的服務。因此：
  - 遊戲推進（換階段、算票）由前端執行：任何在線的裝置都可以推進，用 transaction 確保只推進一次。詳見 SPEC 5.3。
  - 照片壓縮成 base64 JPEG，直接存在 Realtime Database。
  - 舊房間的清理，在有人建立新房間時順手執行，不靠排程。
- **不使用建置工具和框架。** 不要加 React、Vite、webpack、TypeScript、Tailwind。瀏覽器直接執行 `index.html` 和 ES modules。
- **執行時不用 npm 套件。** 外部函式庫只能透過 CDN 載入，而且必須固定版本號。開發用的工具（例如 firebase-tools）可以裝。
- **只有一個頁面。** 所有畫面都在 `index.html` 裡切換，大螢幕模式用 `?mode=screen`。
- **所有路徑都用相對路徑。** GitHub Pages 的網址會帶 repo 名稱（`/repo-name/`），寫成 `/js/main.js` 這種絕對路徑會壞掉。
- **遊戲規則只能寫在 `js/rules.js`。** 這個檔案只能有純函式，不能 import Firebase，也不能碰 DOM。其他檔案要用規則，一律呼叫它。
- **介面文字只能寫在 `i18n/zh-TW.js`。** 畫面程式碼裡不能直接寫中文字串。
- **時間一律用伺服器時間。** 倒數要用 `phaseEndsAt` 加上 `.info/serverTimeOffset` 計算，不能用 `setTimeout` 的累計時間當遊戲時間。
- **localStorage 只能存**：暱稱、靜音設定。遊戲狀態一律以 Firebase 為準。

## 排錯與經驗累積

### 遇到問題時的步驟

1. **先查紀錄**：看下方「已知問題」和 `docs/troubleshooting.md`，確認是不是以前遇過的問題。
2. **重現問題**：先找到能穩定重現的步驟。重現不了就不要開始改。
3. **找到原因再改**：用 console、Network、Firebase 模擬器的資料畫面確認原因。不要同時改好幾個地方碰運氣。
4. **一次只改一件事**：改完就重新驗證。
5. **補測試**：如果問題出在 `rules.js`，或能寫成自動測試，就把這個情境加進 `tests/`，以後才不會再壞。
6. **同一個方向試了 3 次都沒解決**：停下來回報使用者，說明試了什麼、看到什麼、你懷疑的原因，一起討論下一步。不要一直換方法硬試。
7. **不能為了讓問題消失，就繞過「技術限制」。** 例如不能改用 Cloud Functions，也不能把測試刪掉。

### 什麼時候要記錄

符合任何一項就要記：

- 試了不只一種方法才解決
- 原因不明顯，光看錯誤訊息猜不到
- 和特定瀏覽器、裝置或 Firebase 行為有關
- 以後改其他功能時很可能再遇到

### 怎麼記錄

- **在 `docs/troubleshooting.md` 新增一筆**，格式照該檔案開頭的範本：症狀、原因、解法、怎麼預防。這筆紀錄跟著修正一起放進同一個 PR。
- **在下方「已知問題」加一行摘要**，只寫最容易再犯的那幾件，最多 15 行。滿了就合併相近的項目，或把已經寫成測試、規則的項目移除。
- **經驗變成了固定規則**（例如「一定要這樣寫」）時：把它搬到「技術限制」或「命名與放置」，並在 PR 裡說明，等使用者審核。

### 已知問題

每行格式：一句話寫出要注意什麼，最後附上 `docs/troubleshooting.md` 的編號。

- iOS Safari 的 `<video>` 一定要加 `playsinline` 和 `muted`，相機才會顯示在網頁裡，不會跳成全螢幕。（T01）
- 只有在使用者點擊之後才能呼叫 `getUserMedia` 和播放音效，不能在頁面一載入就呼叫。（T02）
- 同一個瀏覽器的分頁會共用 Anonymous Auth 身分。測試多人時，要用不同的瀏覽器設定檔或無痕視窗。（T03）
- 手機要用 HTTPS 才能開相機，`http://` 加區網 IP 不行。（T04）

## 命名與放置

| 類型 | 放哪裡 | 命名 |
|---|---|---|
| 畫面 | `js/screens/` | kebab-case，一個畫面一個檔案，例如 `vote.js` |
| 共用元件 | `js/components/` | kebab-case，例如 `photo-grid.js` |
| 工具函式 | `js/utils/` | kebab-case |
| 樣式 | `css/base.css`（變數）、`css/components.css`、`css/screens.css` | class 用畫面名稱當前綴：`.lobby-title`、`.vote-grid` |
| 題目 | `data/prompts.json` | 格式見 SPEC 6.1 |
| 介面文字 | `i18n/zh-TW.js` | key 用 `畫面.用途`，例如 `lobby.startButton` |
| 音效 | `assets/sounds/` | kebab-case，例如 `countdown-tick.mp3` |
| 測試 | `tests/` | `<被測檔名>.test.js` |

JavaScript 命名：

- 函式和變數用 camelCase。
- 常數用 UPPER_SNAKE_CASE。
- Firebase 的 key 用 camelCase。

顏色、字體、間距都用 `css/base.css` 裡的 CSS 變數，不要在其他地方寫色碼。

### 新增一個畫面

1. 在 `js/screens/` 建檔，export `render(container, state)` 和 `destroy()`。
2. 在 `js/main.js` 的畫面對照表裡登記。
3. 文字加到 `i18n/zh-TW.js`，樣式加到 `css/screens.css`。
4. 在 SPEC 第 4 章補上這個畫面的說明，在 `docs/testing.md` 補測試項目。

## Commit 與分支

- 分支名稱：`類型/簡短描述`，例如 `feat/revote-screen`、`fix/timer-drift`。
- Commit 格式：

```
類型(範圍): 一句話說明做了什麼

為什麼要改、改了什麼行為（git log 就是這個專案的進度紀錄，請寫清楚原因）
```

- 類型：
  - `feat`：新功能
  - `fix`：修 bug
  - `style`：樣式
  - `refactor`：重構
  - `test`：測試
  - `docs`：文件
  - `content`：題目、文字
  - `chore`：其他
- 範圍：畫面或模組名稱，例如 `vote`、`rules`、`engine`、`lobby`。
- 一個 commit 只做一件事。

## 回報格式

做完後跟使用者回報：

- 改了什麼
- 測了什麼、沒測什麼
- PR 連結
- 這次有沒有新增排錯紀錄，有的話是哪一筆
- 有沒有需要使用者決定的事

不用重述每個步驟。

## 資料夾結構

```
/
├── index.html
├── CLAUDE.md
├── css/
│   ├── base.css              設計變數、reset、字體
│   ├── components.css        按鈕、卡片、倒數條、照片牆等共用元件
│   └── screens.css           各畫面專屬樣式
├── js/
│   ├── main.js               入口：登入、連線、依狀態切換畫面
│   ├── config.js             Firebase 設定、CDN 版本、各階段時間等常數
│   ├── firebase.js           Firebase 初始化與讀寫封裝
│   ├── rules.js              遊戲規則純函式
│   ├── engine.js             遊戲推進：判斷是否該換階段，用 transaction 寫入
│   ├── screens/              home, lobby, capture, reveal, vote, result, ending, bigscreen
│   ├── components/           camera, countdown, photo-grid, qr-code, toast
│   └── utils/                image（壓縮）, room-code, browser（偵測內建瀏覽器）
├── data/prompts.json         內建題庫
├── i18n/zh-TW.js             所有介面文字
├── assets/sounds/
├── firebase/database.rules.json
├── tests/rules.test.js
└── docs/
    ├── SPEC.md
    ├── testing.md
    └── troubleshooting.md    排錯紀錄
```

