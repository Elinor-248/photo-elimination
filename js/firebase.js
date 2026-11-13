// Firebase 初始化與讀寫封裝（SPEC 5.3、5.4）
// 遊戲推進要寫什麼由 engine.js 決定，這裡只負責送出。

import {
  AUTH_EMULATOR_PORT,
  DATABASE_EMULATOR_PORT,
  EMULATOR_CONFIG,
  EMULATOR_HOST,
  FIREBASE_CONFIG,
  FIREBASE_SDK_URL,
  ROOM_TTL_MS,
  USE_EMULATOR,
} from './config.js';
import { DEFAULT_SETTINGS, checkAddPrompt, checkJoin } from './rules.js';
import { generateRoomCode } from './utils/room-code.js';

const { initializeApp } = await import(`${FIREBASE_SDK_URL}/firebase-app.js`);
const { getAuth, connectAuthEmulator, signInAnonymously } = await import(`${FIREBASE_SDK_URL}/firebase-auth.js`);
const {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  onDisconnect,
  serverTimestamp,
  query,
  orderByChild,
  endAt,
  limitToFirst,
} = await import(`${FIREBASE_SDK_URL}/firebase-database.js`);

const CREATE_ROOM_ATTEMPTS = 10;
// 清理查詢的截止時間再往前推一點，避免本機和伺服器的時間差讓查詢被安全規則擋下
const CLEANUP_MARGIN_MS = 60 * 1000;
const CLEANUP_BATCH = 5;

let database = null;
let uid = null;
let serverOffset = 0;

// appName 只有在同一個程式裡模擬多位玩家時才需要（例如整合測試）
export async function init(appName) {
  const app = initializeApp(USE_EMULATOR ? EMULATOR_CONFIG : FIREBASE_CONFIG, appName);
  const auth = getAuth(app);
  database = getDatabase(app);
  if (USE_EMULATOR) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });
    connectDatabaseEmulator(database, EMULATOR_HOST, DATABASE_EMULATOR_PORT);
  }
  onValue(ref(database, '.info/serverTimeOffset'), (snap) => {
    serverOffset = snap.val() ?? 0;
  });
  // 重新整理後沿用原本的匿名身分，第一次才建立新身分
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  uid = auth.currentUser.uid;
  return uid;
}

export function getUid() {
  return uid;
}

// 伺服器時間（SPEC 5.2）。倒數和所有時間判斷都用這個。
export function serverNow() {
  return Date.now() + serverOffset;
}

function roomRef(code, path = '') {
  return ref(database, path ? `rooms/${code}/${path}` : `rooms/${code}`);
}

// ---- 監聽 ----

export function watchConnection(callback) {
  return onValue(ref(database, '.info/connected'), (snap) => callback(snap.val() === true));
}

// onError：失去讀取權限時呼叫（例如被踢出房間）
export function watchRoom(code, callback, onError) {
  return onValue(roomRef(code), (snap) => callback(snap.val()), onError);
}

// 維護 players/{uid}/online 和 offlineAt。每次重新連線都重新登記 onDisconnect。
export function startPresence(code) {
  const me = roomRef(code, `players/${uid}`);
  return onValue(ref(database, '.info/connected'), async (snap) => {
    if (snap.val() !== true) return;
    try {
      await onDisconnect(me).update({ online: false, offlineAt: serverTimestamp() });
      await update(me, { online: true });
    } catch {
      // 已經不在房間裡（被踢出），不用維護
    }
  });
}

// ---- 建房與加入 ----

function newPlayer(name) {
  return { name, joinedAt: serverTimestamp(), online: true, alive: true };
}

// 刪除超過 ROOM_TTL_MS 沒更新的房間（SPEC 5.5）。失敗不影響建房。
async function cleanupExpiredRooms() {
  try {
    const cutoff = serverNow() - ROOM_TTL_MS - CLEANUP_MARGIN_MS;
    const expired = query(ref(database, 'rooms'), orderByChild('meta/updatedAt'), endAt(cutoff), limitToFirst(CLEANUP_BATCH));
    const snap = await get(expired);
    const removals = [];
    snap.forEach((child) => {
      removals.push(remove(child.ref));
    });
    await Promise.allSettled(removals);
  } catch {
    // 清理是順手做的，失敗就等下次有人建房
  }
}

// 回傳 { code } 或 { error }
export async function createRoom(name) {
  const trimmed = name.trim();
  const error = checkJoin({ phase: 'lobby', playerNames: [], name: trimmed });
  if (error) return { error };

  await cleanupExpiredRooms();
  for (let i = 0; i < CREATE_ROOM_ATTEMPTS; i++) {
    const code = generateRoomCode();
    if ((await get(roomRef(code, 'meta'))).exists()) continue;
    try {
      await update(roomRef(code), {
        meta: {
          hostId: uid,
          phase: 'lobby',
          round: 0,
          step: 0,
          settings: DEFAULT_SETTINGS,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        [`players/${uid}`]: newPlayer(trimmed),
      });
      return { code };
    } catch {
      // 檢查和寫入之間被別人搶走這個房號，換一個再試
    }
  }
  return { error: 'createFailed' };
}

// 回傳錯誤代碼，成功時回傳 null。已經在房間裡（重新整理）直接算成功。
export async function joinRoom(code, name) {
  const metaSnap = await get(roomRef(code, 'meta'));
  if (!metaSnap.exists()) return 'notFound';
  const players = (await get(roomRef(code, 'players'))).val() ?? {};
  if (players[uid]) return null;

  const trimmed = name.trim();
  const error = checkJoin({
    phase: metaSnap.val().phase,
    playerNames: Object.values(players).map((p) => p.name),
    name: trimmed,
  });
  if (error) return error;
  try {
    await set(roomRef(code, `players/${uid}`), newPlayer(trimmed));
    await update(roomRef(code, 'meta'), { updatedAt: serverTimestamp() });
    return null;
  } catch {
    // 檢查之後遊戲剛好開始
    return 'started';
  }
}

// ---- 等待室 ----

export function kickPlayer(code, targetUid) {
  return remove(roomRef(code, `players/${targetUid}`));
}

export function updateSettings(code, changes) {
  return update(roomRef(code, 'meta/settings'), changes);
}

// customPrompts：房間目前的 customPrompts 資料。回傳錯誤代碼，成功時回傳 null。
export async function addPrompt(code, text, customPrompts) {
  const error = checkAddPrompt({ prompts: Object.values(customPrompts ?? {}), authorId: uid, text });
  if (error) return error;
  await set(push(roomRef(code, 'customPrompts')), { text: text.trim(), authorId: uid });
  return null;
}

export function removePrompt(code, promptId) {
  return remove(roomRef(code, `customPrompts/${promptId}`));
}

// ---- 遊戲中 ----

export function submitPhoto(code, round, dataUrl) {
  return set(roomRef(code, `rounds/${round}/photos/${uid}`), dataUrl);
}

export function castVote(code, round, targetUid, isRevote) {
  const path = isRevote ? `rounds/${round}/revote/votes/${uid}` : `rounds/${round}/votes/${uid}`;
  return set(roomRef(code, path), targetUid);
}

// engine.js 算出來的多路徑 update。step 不符時會被安全規則擋下（reject）。
export function applyRoomUpdates(code, updates) {
  return update(roomRef(code), updates);
}
