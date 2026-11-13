// 入口：登入、連線、依狀態切換畫面（SPEC 4、5.3）
import {
  applyRoomUpdates,
  init,
  isInRoom,
  serverNow,
  startPresence,
  watchConnection,
  watchRoom,
} from './firebase.js';
import { planPlayAgain, planStart, seededRandom, startEngine } from './engine.js';
import { canStart } from './rules.js';
import { isRoomCode } from './utils/room-code.js';
import { h } from './utils/dom.js';
import { t } from './utils/i18n.js';
import { showToast } from './components/toast.js';
import { stopCamera } from './components/camera.js';
import * as home from './screens/home.js';
import * as lobby from './screens/lobby.js';
import * as capture from './screens/capture.js';
import * as reveal from './screens/reveal.js';
import * as vote from './screens/vote.js';
import * as result from './screens/result.js';
import * as ending from './screens/ending.js';

// 畫面名稱就是 meta.phase；投票和重投共用 vote.js，但切換時要重畫，所以分成兩個名稱
const SCREENS = { home, lobby, capture, reveal, vote, revote: vote, result, ending };
// 觀眾頂部常駐提示的階段（SPEC 4.8）
const OBSERVER_PHASES = ['capture', 'reveal', 'vote', 'revote', 'result'];

const container = document.getElementById('app');
const banner = document.getElementById('banner');
const roleBanner = document.getElementById('role-banner');

const state = {
  uid: null,
  code: null,
  room: null,
  builtinPrompts: [],
  // 從別人分享的 ?room= 連結進來、還沒加入時的房號
  prefillRoom: null,
  actions: { enterRoom, startGame, playAgain, clearPrefill },
};

let currentScreen = null;
let stopRoom = [];

function screenName() {
  if (!state.code || !state.room) return 'home';
  return state.room.meta.phase;
}

function me() {
  return state.room?.players?.[state.uid];
}

// 相機整局不關（使用者決定），只有出局、結束、回到等待室或首頁時關掉
function updateCamera(name) {
  const shooting = ['capture', 'reveal', 'vote', 'revote', 'result'].includes(name) && me()?.alive;
  if (!shooting) stopCamera();
}

function show() {
  const name = screenName();
  updateCamera(name);
  roleBanner.hidden = !(OBSERVER_PHASES.includes(name) && me() && !me().alive);
  if (name !== currentScreen) {
    SCREENS[currentScreen]?.destroy();
    container.replaceChildren();
    currentScreen = name;
  }
  SCREENS[name].render(container, state);
}

function setUrlRoom(code) {
  history.replaceState(null, '', code ? `?room=${code}` : location.pathname);
}

async function enterRoom(code) {
  state.code = code;
  state.prefillRoom = null;
  setUrlRoom(code);

  let left = false;
  const leaveOnce = (messageKey) => {
    if (left) return;
    left = true;
    leaveToHome(messageKey);
  };

  // 畫面等第一筆房間資料到了才切換
  const stopWatch = watchRoom(
    code,
    (room) => {
      if (!room?.meta) return leaveOnce('app.roomGone');
      if (!room.players?.[state.uid]) return leaveOnce('app.kicked');
      state.room = room;
      show();
    },
    // 被移出房間後就沒有讀取權限，監聽會被取消
    () => leaveOnce('app.kicked'),
  );
  const stopPresence = startPresence(code);
  const stopEngine = startEngine({
    getRoom: () => state.room,
    now: serverNow,
    apply: (updates) => applyRoomUpdates(code, updates),
    builtinPrompts: state.builtinPrompts,
  });
  stopRoom = [stopWatch, stopPresence, stopEngine];
}

function leaveToHome(messageKey) {
  stopRoom.forEach((stop) => stop());
  stopRoom = [];
  state.code = null;
  state.room = null;
  setUrlRoom(null);
  show();
  if (messageKey) showToast(t(messageKey), { tone: 'error' });
}

function clearPrefill() {
  state.prefillRoom = null;
  setUrlRoom(null);
  // 首頁要整個重畫成一般模式
  currentScreen = null;
  home.destroy();
  show();
}

// 房主按開始。回傳錯誤代碼，成功時回傳 null。
async function startGame() {
  const { room } = state;
  if (!canStart(Object.keys(room.players ?? {}).length)) return 'notEnoughPlayers';
  await applyRoomUpdates(state.code, planStart(room, serverNow(), state.builtinPrompts, seededRandom(room)));
  return null;
}

async function playAgain() {
  await applyRoomUpdates(state.code, planPlayAgain(state.room, serverNow()));
}

function watchBanner() {
  // 一開始還沒連上不算斷線，連上過一次之後才顯示
  let everConnected = false;
  watchConnection((connected) => {
    everConnected ||= connected;
    banner.hidden = connected || !everConnected;
  });
}

async function boot() {
  document.title = t('app.title');
  banner.textContent = t('app.offline');
  roleBanner.textContent = t('app.observer');
  container.replaceChildren(h('p', { class: 'app-loading' }, t('app.loading')));

  try {
    state.uid = await init();
    state.builtinPrompts = await fetch('data/prompts.json').then((res) => res.json());
  } catch (error) {
    console.error(error);
    container.replaceChildren(h('p', { class: 'app-loading' }, t('errors.network')));
    return;
  }
  watchBanner();

  const code = new URLSearchParams(location.search).get('room');
  if (code && isRoomCode(code)) {
    // 重新整理：已經在房間名單裡就直接回去
    if (await isInRoom(code)) return enterRoom(code);
    state.prefillRoom = code;
  }
  show();
}

boot();
