// Firebase 設定、CDN 版本、各階段時間等常數（SPEC 5.1、5.5、5.7、5.8）
// 遊戲規則相關的數字（人數、題數、設定選項）在 rules.js。

export const FIREBASE_SDK_VERSION = '13.1.0';
export const FIREBASE_SDK_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

// 正式環境的 Firebase 專案設定。這些值會出現在網頁原始碼裡，本來就是公開的；
// 資料安全靠 firebase/database.rules.json 的安全規則。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBxWFNaOFfdGMayX7Zsf7ivdyGxpYOS8oM',
  authDomain: 'photo-elimination.firebaseapp.com',
  databaseURL: 'https://photo-elimination-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'photo-elimination',
  appId: '1:512720357155:web:5c580c9077ba6c73852e96',
};

// 連到 localhost 時改連模擬器（SPEC 5.8）
export const DEMO_PROJECT_ID = 'demo-photo-elimination';
export const EMULATOR_HOST = '127.0.0.1';
export const AUTH_EMULATOR_PORT = 9099;
export const DATABASE_EMULATOR_PORT = 9000;
export const USE_EMULATOR =
  typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);

export const EMULATOR_CONFIG = {
  apiKey: 'demo-api-key',
  projectId: DEMO_PROJECT_ID,
  databaseURL: `https://${DEMO_PROJECT_ID}-default-rtdb.firebaseio.com`,
};

// 各階段的固定時間
export const REVEAL_MS = 8000;
export const RESULT_MS = 6000;
// 超時後只剩 1 人時，揭曉停留比較短，接著進結束畫面
export const WINNER_REVEAL_MS = 5000;

// 時間到之後再等一下才結算，這段時間內寫入的照片和票都算（安全規則用同樣的數字）
export const CAPTURE_GRACE_MS = 2000;
export const VOTE_GRACE_MS = 1000;

export const ENGINE_TICK_MS = 500;
export const HOST_TIMEOUT_MS = 10000;

export const MAX_PHOTO_CHARS = 400000;
export const PHOTO_PREFIX = 'data:image/jpeg;base64,';
