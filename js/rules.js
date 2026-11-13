// 遊戲規則（SPEC 第 3 章）。只放純函式：不 import Firebase、不碰 DOM。
// 傳入的 id 集合可以是陣列，也可以是 Firebase 的 { [id]: true } 物件。

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const NAME_MAX_LENGTH = 8;
export const MAX_PROMPTS_PER_PLAYER = 3;
export const PROMPT_MAX_LENGTH = 20;
export const QUOTA_TWO_MIN_CANDIDATES = 7;

function toIdList(ids) {
  if (!ids) return [];
  if (Array.isArray(ids)) return ids.filter((id) => id != null);
  return Object.keys(ids).filter((id) => ids[id]);
}

// 用 code point 計算長度，emoji 算 1 個字
function textLength(text) {
  return [...text].length;
}

function pickRandom(list, random) {
  return list[Math.floor(random() * list.length)];
}

// ---- 開局（3.2）----

export function canStart(playerCount) {
  return playerCount >= MIN_PLAYERS && playerCount <= MAX_PLAYERS;
}

// 回傳 null 代表可以加入，否則回傳錯誤代碼
export function checkJoin({ phase, playerNames, name }) {
  const trimmed = (name ?? '').trim();
  if (phase !== 'lobby') return 'started';
  if (playerNames.length >= MAX_PLAYERS) return 'full';
  if (trimmed === '') return 'nameEmpty';
  if (textLength(trimmed) > NAME_MAX_LENGTH) return 'nameTooLong';
  if (playerNames.some((n) => n.trim() === trimmed)) return 'nameTaken';
  return null;
}

// ---- 出題（3.4）----

// 回傳 null 代表可以新增，否則回傳錯誤代碼
export function checkAddPrompt({ prompts, authorId, text }) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return 'promptEmpty';
  if (textLength(trimmed) > PROMPT_MAX_LENGTH) return 'promptTooLong';
  const mine = prompts.filter((p) => p.authorId === authorId).length;
  if (mine >= MAX_PROMPTS_PER_PLAYER) return 'promptLimit';
  return null;
}

// customOnly 開：先抽完自訂題目，再改用內建題庫，此時 fallback 為 true（畫面要顯示提示）。
// customOnly 關：自訂和內建混在一起隨機抽。
// 同一局不重複；全部用完時 prompt 為 null。
export function pickPrompt({ custom, builtin, usedIds, customOnly, random = Math.random }) {
  const used = new Set(toIdList(usedIds));
  const unusedCustom = custom
    .filter((p) => !used.has(p.id))
    .map((p) => ({ id: p.id, text: p.text, authorId: p.authorId }));
  const unusedBuiltin = builtin
    .filter((p) => !used.has(p.id))
    .map((p) => ({ id: p.id, text: p.text, authorId: null }));

  if (customOnly) {
    if (unusedCustom.length > 0) {
      return { prompt: pickRandom(unusedCustom, random), fallback: false };
    }
    if (unusedBuiltin.length > 0) {
      return { prompt: pickRandom(unusedBuiltin, random), fallback: true };
    }
    return { prompt: null, fallback: true };
  }

  const pool = [...unusedCustom, ...unusedBuiltin];
  return { prompt: pool.length > 0 ? pickRandom(pool, random) : null, fallback: false };
}

// ---- 超時處理（3.5 第 2 點）----

// outcome:
//   'void'     所有存活玩家都沒交，本輪作廢，沒人出局
//   'winner'   超時處理後只剩 1 人，他獲勝
//   'continue' 進入揭曉，quota 為本輪淘汰名額
export function applyTimeouts(aliveIds, submittedIds) {
  const alive = toIdList(aliveIds);
  const submitted = new Set(toIdList(submittedIds));
  const candidates = alive.filter((id) => submitted.has(id));
  const timedOut = alive.filter((id) => !submitted.has(id));

  if (candidates.length === 0) {
    return { outcome: 'void', timedOut: [], candidates: [], winnerId: null, quota: 0 };
  }
  if (candidates.length === 1) {
    return { outcome: 'winner', timedOut, candidates, winnerId: candidates[0], quota: 0 };
  }
  return { outcome: 'continue', timedOut, candidates, winnerId: null, quota: getQuota(candidates.length) };
}

// ---- 投票與淘汰（3.5 第 4 點、3.6、3.7）----

export function getQuota(candidateCount) {
  return candidateCount >= QUOTA_TWO_MIN_CANDIDATES ? 2 : 1;
}

// votes: { [voterUid]: targetUid }。投給自己或非候選人的票不算。
// 回傳每位候選人的得票數（沒得票的是 0）。
export function tallyVotes(votes, candidateIds) {
  const candidates = toIdList(candidateIds);
  const valid = new Set(candidates);
  const tally = Object.fromEntries(candidates.map((id) => [id, 0]));
  for (const [voter, target] of Object.entries(votes ?? {})) {
    if (target === voter || !valid.has(target)) continue;
    tally[target] += 1;
  }
  return tally;
}

// 把有得票的候選人依票數分組，由高到低。組內保留候選人原本的順序。
function rankGroups(tally, candidates) {
  const groups = new Map();
  for (const id of candidates) {
    const count = tally[id];
    if (count === 0) continue;
    if (!groups.has(count)) groups.set(count, []);
    groups.get(count).push(id);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, ids]) => ids);
}

// 由高票往下填名額：整組放得進剩下的名額就整組淘汰；
// 第一個放不進的組就是無法判定的平手，回傳給呼叫端決定要重投或放棄。
function fillQuota(tally, candidates, quota) {
  const eliminated = [];
  for (const group of rankGroups(tally, candidates)) {
    const remaining = quota - eliminated.length;
    if (remaining === 0) break;
    if (group.length <= remaining) {
      eliminated.push(...group);
    } else {
      return { eliminated, tied: group, tiedQuota: remaining };
    }
  }
  return { eliminated, tied: [], tiedQuota: 0 };
}

function getReason(eliminated, tally) {
  if (eliminated.length > 0) return 'vote';
  const total = Object.values(tally).reduce((sum, n) => sum + n, 0);
  return total === 0 ? 'noVotes' : 'tie';
}

// 第一次投票。
// 需要重投時 revote 不是 null：{ candidates, quota, preEliminated }，
// preEliminated 是重投前就確定出局的人（quota 2、第一名一人、第二名平手的情況）。
// 不需要重投時 revote 為 null，eliminated 和 reason 就是本輪結果。
export function resolveVotes({ votes, candidates: candidateIds, quota }) {
  const candidates = toIdList(candidateIds);
  const tally = tallyVotes(votes, candidates);
  const { eliminated, tied, tiedQuota } = fillQuota(tally, candidates, quota);

  if (tied.length > 0) {
    return {
      tally,
      eliminated,
      reason: null,
      revote: { candidates: tied, quota: tiedQuota, preEliminated: eliminated },
    };
  }
  return { tally, eliminated, reason: getReason(eliminated, tally), revote: null };
}

// 重投。無法判定的名額就不淘汰，不會有第二次重投。
// 回傳的 eliminated 已包含 preEliminated；tally 是重投的票數。
export function resolveRevote({ votes, candidates: candidateIds, quota, preEliminated = [] }) {
  const candidates = toIdList(candidateIds);
  const tally = tallyVotes(votes, candidates);
  const { eliminated: revoteEliminated } = fillQuota(tally, candidates, quota);
  const eliminated = [...preEliminated, ...revoteEliminated];
  return { tally, eliminated, reason: getReason(eliminated, tally) };
}

// ---- 結束（3.8）與房主轉移（SPEC 5.3）----

// players: { [uid]: { alive, ... } }。存活剩 1 人時回傳他的 uid，否則 null。
export function getWinner(players) {
  const alive = Object.entries(players ?? {}).filter(([, p]) => p && p.alive);
  return alive.length === 1 ? alive[0][0] : null;
}

// rounds 可以是 { [n]: round } 或 Firebase 轉出的陣列（index 0 是 null）。
// 依輪次順序列出因投票出局的人；沒人因投票出局的輪次跳過。
export function buildWorstPhotos(rounds) {
  return Object.entries(rounds ?? {})
    .filter(([, round]) => round)
    .map(([n, round]) => [Number(n), round])
    .sort((a, b) => a[0] - b[0])
    .flatMap(([n, round]) => (round.result?.eliminated ?? []).map((uid) => ({ round: n, uid })));
}

// 在線玩家中最早加入的人。沒有人在線時回傳 null。
export function pickNextHost(players) {
  const online = Object.entries(players ?? {})
    .filter(([, p]) => p && p.online)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt || (a[0] < b[0] ? -1 : 1));
  return online.length > 0 ? online[0][0] : null;
}
