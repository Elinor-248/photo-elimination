// 遊戲推進（SPEC 5.1、5.2）
//
// planTransition 是純函式：看房間資料和現在時間，決定這一步要寫什麼。
// 每一步都是一筆多路徑 update，裡面一定帶 meta/step + 1。安全規則只接受 step 剛好加 1，
// 所以多台裝置同時推進時只有一台成功，其他整筆被擋下，下一次檢查再看新的狀態。
//
// 這個檔案不 import Firebase，寫入由 startEngine 的呼叫端提供，所以可以在 Node 裡測試。

import {
  applyTimeouts,
  buildWorstPhotos,
  canStart,
  getQuota,
  getWinner,
  pickNextHost,
  pickPrompt,
  resolveRevote,
  resolveVotes,
} from './rules.js';
import {
  CAPTURE_GRACE_MS,
  ENGINE_TICK_MS,
  HOST_TIMEOUT_MS,
  RESULT_MS,
  REVEAL_MS,
  VOTE_GRACE_MS,
} from './config.js';

function keys(obj) {
  return Object.keys(obj ?? {}).filter((k) => obj[k] != null);
}

function toTrueMap(ids) {
  return Object.fromEntries(ids.map((id) => [id, true]));
}

function alivePlayerIds(players) {
  return keys(players).filter((uid) => players[uid].alive);
}

function onlinePlayerIds(players) {
  return keys(players).filter((uid) => players[uid].online);
}

// 每一步共用的 meta 欄位
function stepUpdates(room, now) {
  return { 'meta/step': room.meta.step + 1, 'meta/updatedAt': now };
}

function eliminationUpdates(uids, round, by) {
  const updates = {};
  for (const uid of uids) {
    updates[`players/${uid}/alive`] = false;
    updates[`players/${uid}/eliminatedRound`] = round;
    updates[`players/${uid}/eliminatedBy`] = by;
  }
  return updates;
}

// 進入拍照：抽題、設定倒數。作廢重來時 round 和現在一樣。
function enterCapture(room, round, now, builtinPrompts, random) {
  const custom = keys(room.customPrompts).map((id) => ({ id, ...room.customPrompts[id] }));
  const { prompt, fallback, reset } = pickPrompt({
    custom,
    builtin: builtinPrompts,
    usedIds: room.meta.usedPromptIds,
    customOnly: room.meta.settings.customOnly,
    random,
  });
  const updates = {
    ...stepUpdates(room, now),
    'meta/phase': 'capture',
    'meta/round': round,
    'meta/phaseEndsAt': now + room.meta.settings.captureSec * 1000,
    [`rounds/${round}/prompt`]: { ...prompt, fallback },
  };
  if (reset) {
    updates['meta/usedPromptIds'] = { [prompt.id]: true };
  } else {
    updates[`meta/usedPromptIds/${prompt.id}`] = true;
  }
  return updates;
}

function enterEnding(room, now, winnerId, extra = {}) {
  return {
    ...stepUpdates(room, now),
    ...extra,
    'meta/phase': 'ending',
    'meta/phaseEndsAt': null,
    ending: { winnerId, worstPhotos: buildWorstPhotos(room.rounds) },
  };
}

function isTimeUp(room, now, graceMs) {
  return now >= room.meta.phaseEndsAt + graceMs;
}

// 投票提前結束：所有在線玩家都投了。沒有玩家在線時只看時間。
function isVoteDone(room, now, votes) {
  const online = onlinePlayerIds(room.players);
  const allVoted = online.length > 0 && online.every((uid) => votes?.[uid] != null);
  return allVoted || isTimeUp(room, now, VOTE_GRACE_MS);
}

function finishRound(room, now, n, { tally, eliminated, reason }) {
  return {
    ...stepUpdates(room, now),
    ...eliminationUpdates(eliminated, n, 'vote'),
    [`rounds/${n}/result`]: { tally, eliminated, reason },
    'meta/phase': 'result',
    'meta/phaseEndsAt': now + RESULT_MS,
  };
}

function planCapture(room, now, builtinPrompts, random) {
  const n = room.meta.round;
  const photos = room.rounds?.[n]?.photos ?? {};
  const alive = alivePlayerIds(room.players);
  const allSubmitted = alive.every((uid) => photos[uid] != null);
  if (!allSubmitted && !isTimeUp(room, now, CAPTURE_GRACE_MS)) return null;

  const { outcome, timedOut, candidates, winnerId } = applyTimeouts(alive, keys(photos));
  if (outcome === 'void') return enterCapture(room, n, now, builtinPrompts, random);

  const roundUpdates = {
    ...eliminationUpdates(timedOut, n, 'timeout'),
    [`rounds/${n}/timeouts`]: timedOut.length > 0 ? toTrueMap(timedOut) : null,
    [`rounds/${n}/candidates`]: toTrueMap(candidates),
  };
  if (outcome === 'winner') return enterEnding(room, now, winnerId, roundUpdates);

  return {
    ...stepUpdates(room, now),
    ...roundUpdates,
    'meta/phase': 'reveal',
    'meta/phaseEndsAt': now + REVEAL_MS,
  };
}

function planReveal(room, now) {
  if (!isTimeUp(room, now, 0)) return null;
  return {
    ...stepUpdates(room, now),
    'meta/phase': 'vote',
    'meta/phaseEndsAt': now + room.meta.settings.voteSec * 1000,
  };
}

function planVote(room, now) {
  const n = room.meta.round;
  const round = room.rounds?.[n] ?? {};
  if (!isVoteDone(room, now, round.votes)) return null;

  const candidates = keys(round.candidates);
  const result = resolveVotes({ votes: round.votes, candidates, quota: getQuota(candidates.length) });
  if (!result.revote) return finishRound(room, now, n, result);

  const { candidates: tied, quota, preEliminated } = result.revote;
  return {
    ...stepUpdates(room, now),
    // 分開寫子路徑：revote/votes 只有投票者本人能寫，不能整個 revote 一起覆蓋
    [`rounds/${n}/revote/candidates`]: toTrueMap(tied),
    [`rounds/${n}/revote/quota`]: quota,
    [`rounds/${n}/revote/preEliminated`]: preEliminated,
    'meta/phase': 'revote',
    'meta/phaseEndsAt': now + room.meta.settings.voteSec * 1000,
  };
}

function planRevote(room, now) {
  const n = room.meta.round;
  const revote = room.rounds?.[n]?.revote ?? {};
  if (!isVoteDone(room, now, revote.votes)) return null;

  const result = resolveRevote({
    votes: revote.votes,
    candidates: revote.candidates,
    quota: revote.quota,
    preEliminated: revote.preEliminated ?? [],
  });
  return finishRound(room, now, n, result);
}

function planResult(room, now, builtinPrompts, random) {
  if (!isTimeUp(room, now, 0)) return null;
  const winnerId = getWinner(room.players);
  if (winnerId) return enterEnding(room, now, winnerId);
  return enterCapture(room, room.meta.round + 1, now, builtinPrompts, random);
}

// 房主離線超過 HOST_TIMEOUT_MS（或已經不在名單上），由在線玩家中最早加入的人接任
function planHostTransfer(room, now) {
  const host = room.players?.[room.meta.hostId];
  const hostGone = !host || (!host.online && now - (host.offlineAt ?? 0) >= HOST_TIMEOUT_MS);
  if (!hostGone) return null;
  const next = pickNextHost(room.players);
  if (!next || next === room.meta.hostId) return null;
  return { ...stepUpdates(room, now), 'meta/hostId': next };
}

const PHASE_PLANNERS = {
  capture: planCapture,
  reveal: planReveal,
  vote: planVote,
  revote: planRevote,
  result: planResult,
};

// room：rooms/{code} 的完整資料。回傳要寫入的多路徑 update（路徑相對於房間），或 null。
export function planTransition(room, now, builtinPrompts, random = Math.random) {
  if (!room?.meta) return null;
  const planner = PHASE_PLANNERS[room.meta.phase];
  const phaseUpdates = planner ? planner(room, now, builtinPrompts, random) : null;
  return phaseUpdates ?? planHostTransfer(room, now);
}

// ---- 房主按鈕觸發的轉換 ----

// 開始遊戲。人數不對時回傳 null。
export function planStart(room, now, builtinPrompts, random = Math.random) {
  if (room.meta.phase !== 'lobby' || !canStart(keys(room.players).length)) return null;
  return enterCapture(room, 1, now, builtinPrompts, random);
}

// 再來一局：回到等待室，保留暱稱和設定，清空本局資料和自訂題目（SPEC 3.8）
export function planPlayAgain(room, now) {
  if (room.meta.phase !== 'ending') return null;
  const updates = {
    ...stepUpdates(room, now),
    'meta/phase': 'lobby',
    'meta/round': 0,
    'meta/phaseEndsAt': null,
    'meta/usedPromptIds': null,
    rounds: null,
    ending: null,
    customPrompts: null,
  };
  for (const uid of keys(room.players)) {
    updates[`players/${uid}/alive`] = true;
    updates[`players/${uid}/eliminatedRound`] = null;
    updates[`players/${uid}/eliminatedBy`] = null;
  }
  return updates;
}

// ---- 執行 ----

// 同一步的隨機結果在每台裝置上都一樣（mulberry32）。
// 推進搶輸的裝置會先在本機套用自己算的結果、被擋下後才還原，
// 用同一個種子抽題，畫面上的題目就不會閃成別題再變回來。
export function seededRandom(room) {
  let a = 0;
  for (const ch of `${room.meta.createdAt}:${room.meta.step}`) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// getRoom：回傳目前的房間資料；now：伺服器時間；apply：寫入 update，失敗時 reject。
// 回傳停止函式。
export function startEngine({ getRoom, now, apply, builtinPrompts }) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    const room = getRoom();
    const updates = room?.meta ? planTransition(room, now(), builtinPrompts, seededRandom(room)) : null;
    if (!updates) return;
    busy = true;
    try {
      await apply(updates);
    } catch {
      // 被其他裝置搶先推進（step 不符）是正常情況，下一次檢查會看到新的狀態
    } finally {
      busy = false;
    }
  }, ENGINE_TICK_MS);
  return () => clearInterval(timer);
}
