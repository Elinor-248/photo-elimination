# 排錯紀錄

開發時卡關、後來解決的問題都記在這裡，讓之後的開發不用重頭排查。什麼時候要記錄，請見 CLAUDE.md 的「排錯與經驗累積」。

## 寫法

- 編號依序遞增（T01、T02…），新增之後不要改號。
- 最新的寫在最下面。
- 寫具體的錯誤訊息和檔案名稱，方便之後搜尋。
- 解法失效、或被更好的做法取代時，不要刪除，在該筆最後加上「更新：日期、改成什麼」。

### 範本

```
## Txx 一句話描述問題

- 日期：YYYY-MM-DD
- 相關檔案：js/...
- 症狀：看到什麼現象、錯誤訊息原文、在哪個瀏覽器或裝置
- 原因：真正的原因是什麼
- 試過沒用的方法：（可省略）避免下次再試一次
- 解法：最後怎麼改，相關的 commit
- 怎麼預防：補了什麼測試、寫進了什麼規則，或之後改哪些地方要注意
```

---

以下 T01～T04 是開發前就已經知道的問題，先記下來，避免一開始就踩到。

## T01 iOS 上相機畫面跳成全螢幕或一片黑

- 日期：2026-11-13（預先記錄）
- 相關檔案：js/components/camera.js
- 症狀：iPhone Safari 上相機預覽變成全螢幕播放器，或者畫面一片黑。
- 原因：iOS 的 `<video>` 預設會用全螢幕播放，而且需要靜音才能自動播放。
- 解法：`<video autoplay playsinline muted>`，三個屬性都要加。
- 怎麼預防：testing.md 第 3 節的 iPhone 實機測試。

## T02 相機或音效在頁面一打開時呼叫失敗

- 日期：2026-11-13（預先記錄）
- 相關檔案：js/components/camera.js、音效相關程式
- 症狀：`NotAllowedError`，或者音效沒有聲音，尤其是在 iOS 上。
- 原因：瀏覽器要求這類功能必須由使用者的點擊觸發。
- 解法：在「加入」、「建立房間」或「開始拍照」的點擊事件裡初始化相機和音效，之後再重複使用。
- 怎麼預防：不要在模組載入時或 `setTimeout` 裡第一次呼叫。

## T03 開好幾個分頁測試，卻都變成同一位玩家

- 日期：2026-11-13（預先記錄）
- 相關檔案：js/firebase.js
- 症狀：第二個分頁加入後，名單沒有變多，或者兩個分頁互相蓋掉資料。
- 原因：Anonymous Auth 的身分存在瀏覽器裡，同一個設定檔的分頁會共用同一個 uid。
- 解法：用不同的 Chrome 設定檔、無痕視窗，或者不同瀏覽器來模擬不同玩家。
- 怎麼預防：已寫在 testing.md 第 2 節的準備步驟。

## T04 手機連到電腦的開發伺服器打不開相機

- 日期：2026-11-13（預先記錄）
- 症狀：用 `http://192.168.x.x:8000` 開啟時，`navigator.mediaDevices` 是 `undefined`。
- 原因：相機只能在安全來源（HTTPS 或 localhost）使用。
- 解法：部署到 GitHub Pages 的測試分支，或使用 HTTPS 通道再用手機測試。
- 怎麼預防：已寫在 SPEC 5.8。

## T05 `node --test tests/` 失敗：Cannot find module

- 日期：2026-11-13
- 相關檔案：tests/rules.test.js、CLAUDE.md、docs/testing.md
- 症狀：Node v24 執行 `node --test tests/`，只回報 1 個失敗的測試，名稱是 `tests`，錯誤訊息是 `Error: Cannot find module '.../tests'`。測試檔本身沒有被執行。
- 原因：新版 Node（實測 v24）的 `--test` 參數只接受檔案或 glob，不再展開資料夾，所以 `tests/` 被當成一個要執行的模組。
- 解法：改用 `node --test`，不加參數。Node 會自動找出 `**/*.test.js`（排除 `node_modules`）。
- 怎麼預防：CLAUDE.md 和 testing.md 的指令都改成 `node --test`。之後如果要指定範圍，用加引號的 glob，例如 `node --test "tests/**/*.test.js"`。

## T06 用 REST 對 Auth 模擬器註冊，拿到的 token 寫資料都是 Permission denied

- 日期：2026-11-13
- 相關檔案：tests/database-rules.test.js
- 症狀：`POST .../accounts:signUp` 有回傳 `idToken` 和 `localId`，但拿這個 token 對 Database 模擬器寫入，連規則明明允許的寫入都回 `{"error":"Permission denied"}`。
- 原因：請求沒有帶 `Content-Type: application/json`，body 裡的 `returnSecureToken: true` 沒被讀到，拿到的 token 不能當成登入身分使用。錯誤訊息完全沒提到 header。
- 試過沒用的方法：一開始以為是規則寫錯；用另一支帶了 header 的腳本測同一筆寫入是成功的，才發現差在請求本身。
- 解法：`signUp` 的 fetch 加上 `headers: { 'Content-Type': 'application/json' }`。
- 怎麼預防：之後寫任何打模擬器 REST API 的測試，都要帶 `Content-Type`。遇到「全部允許的寫入都被擋」時，先懷疑身分，再懷疑規則。

## T07 GitHub 警告 js/config.js 裡有 Google API Key 外洩

- 日期：2026-11-14
- 相關檔案：js/config.js
- 症狀：推到公開 repo 後，GitHub 寄信「Action needed: Secrets detected」，secret scanning 標記 `js/config.js` 的 `apiKey: 'AIzaSy…'` 是 Google API Key。
- 原因：Firebase 網頁版的 `apiKey` 格式和一般 Google API Key 一樣，所以被掃到。但它不是祕密：網站上線後任何人都能在網頁原始碼看到，它只用來識別專案，不能拿來讀寫資料。資料安全靠 `firebase/database.rules.json`。
- 試過沒用的方法：（沒有試，但要避免）換新 key 或清掉 git 歷史都沒有用，新 key 一樣會出現在網頁裡。
- 解法：
  1. 在 Google Cloud Console →「API 和服務 → 憑證」編輯「Browser key (auto created by Firebase)」：應用程式限制選「網站」，只允許 `https://elinor-248.github.io/*`；API 限制只勾 Identity Toolkit API、Token Service API。
  2. 驗證：從網站來源呼叫匿名登入回 200；沒有來源、其他網站回 403（`Requests from referer <empty> are blocked`）。
  3. 在 GitHub 把警示標成 won't fix，附上說明。
- 怎麼預防：
  - 換網址（例如自訂網域、改 repo 名稱）時，要記得到 Google Cloud 把新網址加進 API Key 的網站限制，不然線上版會登入失敗。
  - 本機開發連的是模擬器，用的是假的 `demo-api-key`，不受這個限制影響。
  - 之後再看到同樣的警示，不用換 key，確認限制還在、關閉警示即可。

