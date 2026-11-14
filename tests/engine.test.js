import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planTransition, planStart, planPlayAgain, seededRandom } from '../js/engine.js';
import { CAPTURE_GRACE_MS, VOTE_GRACE_MS, REVEAL_MS, RESULT_MS, HOST_TIMEOUT_MS, WINNER_REVEAL_MS } from '../js/config.js';

const BUILTIN = [
  { id: 'color-red', text: '紅色的東西' },
  { id: 'color-blue', text: '藍色的東西' },
];
const NOW = 1_000_000;
const ENDS = NOW - 100_000;

function makeRoom({ phase = 'lobby', round = 0, players = ['A', 'B', 'C'], dead = [], offline = [], rounds = {}, phaseEndsAt = ENDS, extraMeta = {} } = {}) {
  return {
    meta: {
      hostId: 'A',
      phase,
      round,
      step: 5,
      phaseEndsAt,
      settings: { captureSec: 60, voteSec: 30, customOnly: false },
      usedPromptIds: {},
      createdAt: 0,
      updatedAt: 0,
      ...extraMeta,
    },
    players: Object.fromEntries(
      players.map((uid, i) => [uid, { name: uid, joinedAt: i, online: !offline.includes(uid), alive: !dead.includes(uid) }]),
    ),
    rounds,
  };
}

function photosOf(uids) {
  return Object.fromEntries(uids.map((uid) => [uid, 'data:image/jpeg;base64,xx']));
}

function votesOf(map) {
  return { ...map };
}

describe('每一步都帶 step + 1', () => {
  test('有轉換時 step 加 1、更新 updatedAt', () => {
    const room = makeRoom({ phase: 'reveal', round: 1 });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/step'], 6);
    assert.equal(u['meta/updatedAt'], NOW);
  });

  test('條件還沒滿足時不寫入', () => {
    const room = makeRoom({ phase: 'reveal', round: 1, phaseEndsAt: NOW + 1000 });
    assert.equal(planTransition(room, NOW, BUILTIN), null);
  });
});

describe('開始與拍照', () => {
  test('2 人不能開始，3 人可以開始並進入第 1 輪拍照', () => {
    assert.equal(planStart(makeRoom({ players: ['A', 'B'] }), NOW, BUILTIN), null);
    const u = planStart(makeRoom(), NOW, BUILTIN, () => 0);
    assert.equal(u['meta/phase'], 'capture');
    assert.equal(u['meta/round'], 1);
    assert.equal(u['meta/phaseEndsAt'], NOW + 60_000);
    assert.deepEqual(u['rounds/1/prompt'], { id: 'color-red', text: '紅色的東西', authorId: null, fallback: false });
    assert.equal(u['meta/usedPromptIds/color-red'], true);
  });

  test('拍照時間到但還在緩衝期內：不結算', () => {
    const room = makeRoom({ phase: 'capture', round: 1, phaseEndsAt: NOW - CAPTURE_GRACE_MS + 1 });
    assert.equal(planTransition(room, NOW, BUILTIN), null);
  });

  test('所有存活玩家都送出：提前進入揭曉', () => {
    const room = makeRoom({ phase: 'capture', round: 1, phaseEndsAt: NOW + 30_000, rounds: { 1: { photos: photosOf(['A', 'B', 'C']) } } });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'reveal');
    assert.equal(u['meta/phaseEndsAt'], NOW + REVEAL_MS);
    assert.deepEqual(u['rounds/1/candidates'], { A: true, B: true, C: true });
    assert.equal(u['rounds/1/timeouts'], null);
  });

  test('已出局的觀眾不用送出照片', () => {
    const room = makeRoom({ phase: 'capture', round: 2, phaseEndsAt: NOW + 30_000, players: ['A', 'B', 'C', 'D'], dead: ['D'], rounds: { 2: { photos: photosOf(['A', 'B', 'C']) } } });
    assert.equal(planTransition(room, NOW, BUILTIN)['meta/phase'], 'reveal');
  });

  test('有人超時：標記出局（timeout），列進超時名單', () => {
    const room = makeRoom({ phase: 'capture', round: 1, players: ['A', 'B', 'C', 'D'], rounds: { 1: { photos: photosOf(['A', 'B', 'C']) } } });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'reveal');
    assert.deepEqual(u['rounds/1/timeouts'], { D: true });
    assert.equal(u['players/D/alive'], false);
    assert.equal(u['players/D/eliminatedRound'], 1);
    assert.equal(u['players/D/eliminatedBy'], 'timeout');
  });

  test('全部沒交：同一輪換新題目重來，沒人出局', () => {
    const room = makeRoom({ phase: 'capture', round: 3, extraMeta: { usedPromptIds: { 'color-red': true } }, rounds: { 3: { prompt: { id: 'color-red' } } } });
    const u = planTransition(room, NOW, BUILTIN, () => 0);
    assert.equal(u['meta/phase'], 'capture');
    assert.equal(u['meta/round'], 3);
    assert.equal(u['meta/phaseEndsAt'], NOW + 60_000);
    assert.equal(u['rounds/3/prompt'].id, 'color-blue');
    assert.equal(Object.keys(u).some((k) => k.startsWith('players/')), false);
  });

  test('超時後只剩 1 人：先揭曉 5 秒，超時的人標記出局', () => {
    const room = makeRoom({ phase: 'capture', round: 1, rounds: { 1: { photos: photosOf(['B']) } } });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'reveal');
    assert.equal(u['meta/phaseEndsAt'], NOW + WINNER_REVEAL_MS);
    assert.deepEqual(u['rounds/1/timeouts'], { A: true, C: true });
    assert.deepEqual(u['rounds/1/candidates'], { B: true });
    assert.equal(u['players/A/alive'], false);
    assert.equal(u['players/C/alive'], false);
    assert.equal(u.ending, undefined);
  });

  test('只剩 1 人的揭曉結束：進入結束畫面，他是冠軍', () => {
    const room = makeRoom({ phase: 'reveal', round: 1, dead: ['A', 'C'] });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'ending');
    assert.equal(u.ending.winnerId, 'B');
  });

  test('只剩 1 人的揭曉還沒到時間：不推進', () => {
    const room = makeRoom({ phase: 'reveal', round: 1, dead: ['A', 'C'], phaseEndsAt: NOW + 1000 });
    assert.equal(planTransition(room, NOW, BUILTIN), null);
  });

  test('題目全部用完：重新開放，已用紀錄整個換掉', () => {
    const room = makeRoom({ phase: 'result', round: 2, extraMeta: { usedPromptIds: { 'color-red': true, 'color-blue': true } } });
    const u = planTransition(room, NOW, BUILTIN, () => 0);
    assert.deepEqual(u['meta/usedPromptIds'], { 'color-red': true });
  });

  test('只用自訂題目、自訂用完：題目標記 fallback', () => {
    const room = makeRoom({ phase: 'result', round: 1, extraMeta: { settings: { captureSec: 30, voteSec: 30, customOnly: true } } });
    const u = planTransition(room, NOW, BUILTIN, () => 0);
    assert.equal(u['rounds/2/prompt'].fallback, true);
    assert.equal(u['meta/phaseEndsAt'], NOW + 30_000);
  });

  test('自訂題目帶出題者', () => {
    const room = { ...makeRoom({ phase: 'result', round: 1 }), customPrompts: { p1: { text: '題目一', authorId: 'B' } } };
    const u = planTransition(room, NOW, [], () => 0);
    assert.deepEqual(u['rounds/2/prompt'], { id: 'p1', text: '題目一', authorId: 'B', fallback: false });
  });
});

describe('揭曉與投票', () => {
  test('揭曉時間到：進入投票', () => {
    const u = planTransition(makeRoom({ phase: 'reveal', round: 1 }), NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'vote');
    assert.equal(u['meta/phaseEndsAt'], NOW + 30_000);
  });

  const candidates = { A: true, B: true, C: true };

  test('所有在線玩家都投了：提前結算，離線的人不用等', () => {
    const room = makeRoom({
      phase: 'vote', round: 1, phaseEndsAt: NOW + 20_000, players: ['A', 'B', 'C', 'D'], offline: ['D'],
      rounds: { 1: { candidates, votes: votesOf({ A: 'B', B: 'A', C: 'A' }) } },
    });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'result');
    assert.equal(u['meta/phaseEndsAt'], NOW + RESULT_MS);
    assert.deepEqual(u['rounds/1/result'], { tally: { A: 2, B: 1, C: 0 }, eliminated: ['A'], reason: 'vote' });
    assert.equal(u['players/A/alive'], false);
    assert.equal(u['players/A/eliminatedBy'], 'vote');
  });

  test('觀眾也要投完才提前結算', () => {
    const room = makeRoom({
      phase: 'vote', round: 2, phaseEndsAt: NOW + 20_000, players: ['A', 'B', 'C', 'D'], dead: ['D'],
      rounds: { 2: { candidates, votes: votesOf({ A: 'B', B: 'A', C: 'A' }) } },
    });
    assert.equal(planTransition(room, NOW, BUILTIN), null);
  });

  test('所有玩家都離線（只剩大螢幕）：照時間推進，不會一開始就結算', () => {
    const room = makeRoom({ phase: 'vote', round: 1, phaseEndsAt: NOW + 20_000, offline: ['A', 'B', 'C'], rounds: { 1: { candidates } } });
    assert.equal(planTransition(room, NOW, BUILTIN), null);
  });

  test('投票時間到但還在緩衝期內：不結算', () => {
    const room = makeRoom({ phase: 'vote', round: 1, phaseEndsAt: NOW - VOTE_GRACE_MS + 1, rounds: { 1: { candidates } } });
    assert.equal(planTransition(room, NOW, BUILTIN), null);
  });

  test('全部棄權：進入結果，沒人出局', () => {
    const room = makeRoom({ phase: 'vote', round: 1, rounds: { 1: { candidates } } });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['rounds/1/result'].reason, 'noVotes');
    assert.deepEqual(u['rounds/1/result'].eliminated, []);
  });

  test('第一名平手：進入重投，只放平手的人', () => {
    const room = makeRoom({ phase: 'vote', round: 1, rounds: { 1: { candidates, votes: votesOf({ A: 'B', B: 'A' }) } } });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'revote');
    assert.equal(u['meta/phaseEndsAt'], NOW + 30_000);
    assert.deepEqual(u['rounds/1/revote/candidates'], { A: true, B: true });
    assert.equal(u['rounds/1/revote/quota'], 1);
    assert.deepEqual(u['rounds/1/revote/preEliminated'], []);
  });

  test('7 人以上、第一名一人、第二名平手：重投帶 preEliminated，結果包含他', () => {
    const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const room = makeRoom({
      phase: 'vote', round: 1, players: seven,
      rounds: { 1: { candidates: Object.fromEntries(seven.map((u) => [u, true])), votes: votesOf({ B: 'A', C: 'A', D: 'A', E: 'B', F: 'C' }) } },
    });
    const u = planTransition(room, NOW, BUILTIN);
    assert.deepEqual(u['rounds/1/revote/candidates'], { B: true, C: true });
    assert.deepEqual(u['rounds/1/revote/preEliminated'], ['A']);
    assert.equal(u['players/A/alive'], undefined);

    const afterRevote = makeRoom({
      phase: 'revote', round: 1, players: seven,
      rounds: { 1: { revote: { candidates: { B: true, C: true }, quota: 1, preEliminated: ['A'], votes: votesOf({ A: 'C', D: 'C', E: 'B' }) } } },
    });
    const r = planTransition(afterRevote, NOW, BUILTIN);
    assert.deepEqual(r['rounds/1/result'], { tally: { B: 1, C: 2 }, eliminated: ['A', 'C'], reason: 'vote' });
    assert.equal(r['players/A/alive'], false);
    assert.equal(r['players/C/alive'], false);
  });

  test('重投再平手：沒人出局，原因 tie', () => {
    const room = makeRoom({ phase: 'revote', round: 1, rounds: { 1: { revote: { candidates: { A: true, B: true }, quota: 1, votes: votesOf({ A: 'B', B: 'A' }) } } } });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'result');
    assert.equal(u['rounds/1/result'].reason, 'tie');
  });

  test('重投時已投完的判斷看重投的票，不看第一次的票', () => {
    const room = makeRoom({
      phase: 'revote', round: 1, phaseEndsAt: NOW + 20_000,
      rounds: { 1: { votes: votesOf({ A: 'B', B: 'A', C: 'A' }), revote: { candidates: { A: true, B: true }, quota: 1, votes: votesOf({ C: 'A' }) } } },
    });
    assert.equal(planTransition(room, NOW, BUILTIN), null);
  });
});

describe('結果與結束', () => {
  test('結果時間到、還有多人存活：進入下一輪拍照', () => {
    const u = planTransition(makeRoom({ phase: 'result', round: 1, players: ['A', 'B', 'C', 'D'], dead: ['D'] }), NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'capture');
    assert.equal(u['meta/round'], 2);
  });

  test('結果時間到、只剩 1 人：進入結束，附上最爛照片回顧', () => {
    const room = makeRoom({
      phase: 'result', round: 2, dead: ['B', 'C'],
      rounds: { 1: { result: { eliminated: ['B'] } }, 2: { result: { eliminated: ['C'] } } },
    });
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/phase'], 'ending');
    assert.equal(u['meta/phaseEndsAt'], null);
    assert.deepEqual(u.ending, { winnerId: 'A', worstPhotos: [{ round: 1, uid: 'B' }, { round: 2, uid: 'C' }] });
  });

  test('結束畫面不會自動推進', () => {
    assert.equal(planTransition(makeRoom({ phase: 'ending', round: 2 }), NOW, BUILTIN), null);
  });

  test('再來一局：回到等待室，所有人復活，清空本局資料和自訂題目', () => {
    const room = makeRoom({ phase: 'ending', round: 3, dead: ['B', 'C'] });
    const u = planPlayAgain(room, NOW);
    assert.equal(u['meta/phase'], 'lobby');
    assert.equal(u['meta/round'], 0);
    assert.equal(u['meta/step'], 6);
    assert.equal(u.rounds, null);
    assert.equal(u.customPrompts, null);
    assert.equal(u.ending, null);
    assert.equal(u['meta/usedPromptIds'], null);
    assert.equal(u['players/B/alive'], true);
    assert.equal(u['players/B/eliminatedBy'], null);
    assert.equal(u['meta/settings'], undefined);
    assert.equal(planPlayAgain(makeRoom({ phase: 'vote' }), NOW), null);
  });
});

describe('房主轉移', () => {
  test('房主離線不到 10 秒：不轉移', () => {
    const room = makeRoom({ offline: ['A'] });
    room.players.A.offlineAt = NOW - HOST_TIMEOUT_MS + 1;
    assert.equal(planTransition(room, NOW, BUILTIN), null);
  });

  test('房主離線超過 10 秒：由在線玩家中最早加入的人接任', () => {
    const room = makeRoom({ offline: ['A'] });
    room.players.A.offlineAt = NOW - HOST_TIMEOUT_MS;
    const u = planTransition(room, NOW, BUILTIN);
    assert.equal(u['meta/hostId'], 'B');
    assert.equal(u['meta/step'], 6);
  });

  test('房主已經不在名單上：直接轉移', () => {
    const room = makeRoom();
    room.meta.hostId = 'X';
    assert.equal(planTransition(room, NOW, BUILTIN)['meta/hostId'], 'A');
  });

  test('同時有階段要推進時，先推進階段', () => {
    const room = makeRoom({ phase: 'reveal', round: 1, offline: ['A'] });
    room.players.A.offlineAt = 0;
    assert.equal(planTransition(room, NOW, BUILTIN)['meta/phase'], 'vote');
  });
});

describe('Firebase 把輪次轉成陣列時也能讀', () => {
  test('rounds 是陣列（index 0 為 null）', () => {
    const room = makeRoom({ phase: 'vote', round: 1 });
    room.rounds = [null, { candidates: { A: true, B: true, C: true }, votes: { A: 'B', B: 'C', C: 'B' } }];
    assert.deepEqual(planTransition(room, NOW, BUILTIN)['rounds/1/result'].eliminated, ['B']);
  });
});

describe('同一步的隨機結果一致', () => {
  test('同一個房間、同一步：每台裝置抽到同一題', () => {
    const room = makeRoom({ phase: 'result', round: 1 });
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, text: `題目${i}` }));
    const a = planTransition(room, NOW, many, seededRandom(room))['rounds/2/prompt'].id;
    const b = planTransition(room, NOW + 50, many, seededRandom(room))['rounds/2/prompt'].id;
    assert.equal(a, b);
  });

  test('step 不同時抽到的結果會變', () => {
    const room = makeRoom();
    const values = new Set();
    for (let step = 0; step < 20; step++) values.add(seededRandom({ meta: { ...room.meta, step } })());
    assert.equal(values.size, 20);
    for (const v of values) assert.ok(v >= 0 && v < 1);
  });
});
