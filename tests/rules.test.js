import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canStart,
  checkJoin,
  checkAddPrompt,
  pickPrompt,
  applyTimeouts,
  getQuota,
  tallyVotes,
  resolveVotes,
  resolveRevote,
  getWinner,
  buildWorstPhotos,
  pickNextHost,
} from '../js/rules.js';

// 依 tally 產生投票：每個 voter 投給指定的人
function makeVotes(counts) {
  const votes = {};
  let i = 0;
  for (const [target, n] of Object.entries(counts)) {
    for (let k = 0; k < n; k++) votes[`voter${i++}`] = target;
  }
  return votes;
}

const FIVE = ['A', 'B', 'C', 'D', 'E'];
const SEVEN = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

describe('docs/testing.md 第 1 節', () => {
  test('R1 5 名候選人，A 3 票、B 1 票、C 1 票：A 出局', () => {
    const r = resolveVotes({ votes: makeVotes({ A: 3, B: 1, C: 1 }), candidates: FIVE, quota: 1 });
    assert.deepEqual(r.eliminated, ['A']);
    assert.equal(r.reason, 'vote');
    assert.equal(r.revote, null);
  });

  test('R2 5 名候選人，A 2 票、B 2 票：A、B 重投，淘汰 1 人', () => {
    const r = resolveVotes({ votes: makeVotes({ A: 2, B: 2 }), candidates: FIVE, quota: 1 });
    assert.deepEqual(r.eliminated, []);
    assert.deepEqual(r.revote, { candidates: ['A', 'B'], quota: 1, preEliminated: [] });
  });

  test('R3 重投 A 2 票、B 2 票：沒人出局，原因 tie', () => {
    const r = resolveRevote({ votes: makeVotes({ A: 2, B: 2 }), candidates: ['A', 'B'], quota: 1 });
    assert.deepEqual(r.eliminated, []);
    assert.equal(r.reason, 'tie');
  });

  test('R4 全部棄權：沒人出局，原因 noVotes', () => {
    const r = resolveVotes({ votes: {}, candidates: FIVE, quota: 1 });
    assert.deepEqual(r.eliminated, []);
    assert.equal(r.reason, 'noVotes');
    assert.equal(r.revote, null);
  });

  test('R5 7 名候選人，A 4 票、B 3 票：A、B 出局', () => {
    const r = resolveVotes({ votes: makeVotes({ A: 4, B: 3 }), candidates: SEVEN, quota: 2 });
    assert.deepEqual(r.eliminated, ['A', 'B']);
    assert.equal(r.reason, 'vote');
  });

  test('R6 7 名候選人，只有 A 有得票：只有 A 出局', () => {
    const r = resolveVotes({ votes: makeVotes({ A: 5 }), candidates: SEVEN, quota: 2 });
    assert.deepEqual(r.eliminated, ['A']);
    assert.equal(r.revote, null);
  });

  test('R7 7 名候選人，A 3 票、B 3 票：A、B 出局，不用重投', () => {
    const r = resolveVotes({ votes: makeVotes({ A: 3, B: 3 }), candidates: SEVEN, quota: 2 });
    assert.deepEqual(r.eliminated, ['A', 'B']);
    assert.equal(r.revote, null);
  });

  test('R8 7 名候選人，A、B、C 各 2 票：三人重投，淘汰 2 人', () => {
    const r = resolveVotes({ votes: makeVotes({ A: 2, B: 2, C: 2 }), candidates: SEVEN, quota: 2 });
    assert.deepEqual(r.eliminated, []);
    assert.deepEqual(r.revote, { candidates: ['A', 'B', 'C'], quota: 2, preEliminated: [] });
  });

  test('R9 7 名候選人，A 4 票、B 2 票、C 2 票：A 出局，B、C 重投，淘汰 1 人', () => {
    const r = resolveVotes({ votes: makeVotes({ A: 4, B: 2, C: 2 }), candidates: SEVEN, quota: 2 });
    assert.deepEqual(r.eliminated, ['A']);
    assert.deepEqual(r.revote, { candidates: ['B', 'C'], quota: 1, preEliminated: ['A'] });
  });

  test('R10 重投要淘汰 2 人，A 3 票、B 1 票、C 1 票：A 出局，其餘不淘汰', () => {
    const r = resolveRevote({ votes: makeVotes({ A: 3, B: 1, C: 1 }), candidates: ['A', 'B', 'C'], quota: 2 });
    assert.deepEqual(r.eliminated, ['A']);
    assert.equal(r.reason, 'vote');
  });

  test('R11 4 名存活，2 人超時：2 人出局，剩 2 名候選人，quota = 1', () => {
    const r = applyTimeouts(['A', 'B', 'C', 'D'], ['A', 'B']);
    assert.equal(r.outcome, 'continue');
    assert.deepEqual(r.timedOut, ['C', 'D']);
    assert.deepEqual(r.candidates, ['A', 'B']);
    assert.equal(r.quota, 1);
  });

  test('R12 3 名存活，全部超時：本輪作廢，沒人出局', () => {
    const r = applyTimeouts(['A', 'B', 'C'], []);
    assert.equal(r.outcome, 'void');
    assert.deepEqual(r.timedOut, []);
  });

  test('R13 3 名存活，2 人超時：剩下的 1 人獲勝', () => {
    const r = applyTimeouts(['A', 'B', 'C'], ['B']);
    assert.equal(r.outcome, 'winner');
    assert.equal(r.winnerId, 'B');
    assert.deepEqual(r.timedOut, ['A', 'C']);
  });

  test('R14 8 名存活，2 人超時：剩 6 名候選人，quota = 1', () => {
    const alive = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const r = applyTimeouts(alive, alive.slice(0, 6));
    assert.equal(r.candidates.length, 6);
    assert.equal(r.quota, 1);
  });

  test('R15 投給自己、投給非候選人：該票無效，不計入', () => {
    const tally = tallyVotes({ A: 'A', B: 'Z', C: 'A', D: 'B' }, ['A', 'B']);
    assert.deepEqual(tally, { A: 1, B: 1 });
  });

  test('R16 只用自訂題目：自訂題目 2 題、已用 1 題，抽到剩下那題', () => {
    const custom = [
      { id: 'c1', text: '題目一', authorId: 'u1' },
      { id: 'c2', text: '題目二', authorId: 'u2' },
    ];
    const builtin = [{ id: 'color-red', text: '紅色的東西' }];
    for (const random of [() => 0, () => 0.99]) {
      const r = pickPrompt({ custom, builtin, usedIds: { c1: true }, customOnly: true, random });
      assert.deepEqual(r.prompt, { id: 'c2', text: '題目二', authorId: 'u2' });
      assert.equal(r.fallback, false);
    }
  });

  test('R17 只用自訂題目：自訂題目用完，改從內建題庫抽，不重複', () => {
    const custom = [{ id: 'c1', text: '題目一', authorId: 'u1' }];
    const builtin = [
      { id: 'color-red', text: '紅色的東西' },
      { id: 'color-blue', text: '藍色的東西' },
    ];
    for (const random of [() => 0, () => 0.99]) {
      const r = pickPrompt({ custom, builtin, usedIds: ['c1', 'color-red'], customOnly: true, random });
      assert.deepEqual(r.prompt, { id: 'color-blue', text: '藍色的東西', authorId: null });
      assert.equal(r.fallback, true);
    }
  });
});

describe('出題與抽題', () => {
  const custom = [{ id: 'c1', text: '題目一', authorId: 'u1' }];
  const builtin = [{ id: 'color-red', text: '紅色的東西' }];

  test('R18 關閉只用自訂題目：自訂和內建混在一起抽，不顯示提示', () => {
    const first = pickPrompt({ custom, builtin, usedIds: {}, customOnly: false, random: () => 0 });
    const last = pickPrompt({ custom, builtin, usedIds: {}, customOnly: false, random: () => 0.99 });
    assert.equal(first.prompt.id, 'c1');
    assert.equal(last.prompt.id, 'color-red');
    assert.equal(first.fallback, false);
    assert.equal(last.fallback, false);
  });

  test('關閉只用自訂題目：不會抽到用過的題目', () => {
    const r = pickPrompt({ custom, builtin, usedIds: { c1: true }, customOnly: false, random: () => 0 });
    assert.equal(r.prompt.id, 'color-red');
  });

  test('R19 全部題目都用完：重新開放所有題目，reset 為 true', () => {
    const used = { c1: true, 'color-red': true };
    const mixed = pickPrompt({ custom, builtin, usedIds: used, customOnly: false, random: () => 0.99 });
    assert.equal(mixed.prompt.id, 'color-red');
    assert.equal(mixed.reset, true);
    // 只用自訂題目開啟時，重新開放後也是先抽自訂題目
    const customFirst = pickPrompt({ custom, builtin, usedIds: used, customOnly: true, random: () => 0.99 });
    assert.equal(customFirst.prompt.id, 'c1');
    assert.equal(customFirst.fallback, false);
    assert.equal(customFirst.reset, true);
  });

  test('還有題目沒用過時 reset 為 false', () => {
    assert.equal(pickPrompt({ custom, builtin, usedIds: {}, customOnly: false }).reset, false);
  });

  test('完全沒有題目：prompt 為 null', () => {
    assert.equal(pickPrompt({ custom: [], builtin: [], usedIds: {}, customOnly: false }).prompt, null);
  });

  test('每人最多 3 題，每題 1～20 字', () => {
    const prompts = [
      { authorId: 'u1', text: 'a' },
      { authorId: 'u1', text: 'b' },
      { authorId: 'u2', text: 'c' },
    ];
    assert.equal(checkAddPrompt({ prompts, authorId: 'u1', text: '藍色的東西' }), null);
    prompts.push({ authorId: 'u1', text: 'd' });
    assert.equal(checkAddPrompt({ prompts, authorId: 'u1', text: '藍色的東西' }), 'promptLimit');
    assert.equal(checkAddPrompt({ prompts, authorId: 'u2', text: '   ' }), 'promptEmpty');
    assert.equal(checkAddPrompt({ prompts, authorId: 'u2', text: '一'.repeat(20) }), null);
    assert.equal(checkAddPrompt({ prompts, authorId: 'u2', text: '一'.repeat(21) }), 'promptTooLong');
  });
});

describe('開局與加入', () => {
  test('至少 3 人、最多 12 人才能開始', () => {
    assert.equal(canStart(2), false);
    assert.equal(canStart(3), true);
    assert.equal(canStart(12), true);
    assert.equal(canStart(13), false);
  });

  test('加入檢查：遊戲已開始、房間已滿、暱稱重複或長度不對', () => {
    const names = ['小明', '小華'];
    assert.equal(checkJoin({ phase: 'lobby', playerNames: names, name: '阿貓' }), null);
    assert.equal(checkJoin({ phase: 'capture', playerNames: names, name: '阿貓' }), 'started');
    assert.equal(checkJoin({ phase: 'lobby', playerNames: Array(12).fill('x'), name: '阿貓' }), 'full');
    assert.equal(checkJoin({ phase: 'lobby', playerNames: names, name: ' 小明 ' }), 'nameTaken');
    assert.equal(checkJoin({ phase: 'lobby', playerNames: names, name: '' }), 'nameEmpty');
    assert.equal(checkJoin({ phase: 'lobby', playerNames: names, name: '一二三四五六七八九' }), 'nameTooLong');
  });
});

describe('淘汰名額與計票邊界', () => {
  test('候選人 6 人 quota = 1，7 人 quota = 2', () => {
    assert.equal(getQuota(2), 1);
    assert.equal(getQuota(6), 1);
    assert.equal(getQuota(7), 2);
    assert.equal(getQuota(12), 2);
  });

  test('候選人可以用 Firebase 的 { uid: true } 格式傳入', () => {
    const r = resolveVotes({ votes: { x: 'A', y: 'A', z: 'B' }, candidates: { A: true, B: true, C: true }, quota: 1 });
    assert.deepEqual(r.eliminated, ['A']);
  });

  test('2 人決賽：候選人互投平手，觀眾的票決定結果', () => {
    const tie = resolveVotes({ votes: { A: 'B', B: 'A' }, candidates: ['A', 'B'], quota: 1 });
    assert.deepEqual(tie.revote.candidates, ['A', 'B']);
    const decided = resolveVotes({ votes: { A: 'B', B: 'A', C: 'A' }, candidates: ['A', 'B'], quota: 1 });
    assert.deepEqual(decided.eliminated, ['A']);
  });

  test('quota 2，第一名一人、第二名一人：兩人都出局', () => {
    const r = resolveVotes({ votes: makeVotes({ A: 4, B: 2, C: 1 }), candidates: SEVEN, quota: 2 });
    assert.deepEqual(r.eliminated, ['A', 'B']);
    assert.equal(r.revote, null);
  });

  test('重投結果包含重投前已出局的人', () => {
    const r = resolveRevote({ votes: makeVotes({ C: 3, B: 1 }), candidates: ['B', 'C'], quota: 1, preEliminated: ['A'] });
    assert.deepEqual(r.eliminated, ['A', 'C']);
    assert.equal(r.reason, 'vote');
  });

  test('重投再平手但有重投前已出局的人：只有他出局', () => {
    const r = resolveRevote({ votes: makeVotes({ B: 2, C: 2 }), candidates: ['B', 'C'], quota: 1, preEliminated: ['A'] });
    assert.deepEqual(r.eliminated, ['A']);
  });

  test('重投全部棄權：沒人出局，原因 noVotes', () => {
    const r = resolveRevote({ votes: {}, candidates: ['A', 'B'], quota: 1 });
    assert.deepEqual(r.eliminated, []);
    assert.equal(r.reason, 'noVotes');
  });

  test('重投要淘汰 2 人，三人都同票：沒人出局，原因 tie', () => {
    const r = resolveRevote({ votes: makeVotes({ A: 2, B: 2, C: 2 }), candidates: ['A', 'B', 'C'], quota: 2 });
    assert.deepEqual(r.eliminated, []);
    assert.equal(r.reason, 'tie');
  });
});

describe('結束與房主轉移', () => {
  test('存活剩 1 人時是冠軍，否則 null', () => {
    assert.equal(getWinner({ A: { alive: true }, B: { alive: false } }), 'A');
    assert.equal(getWinner({ A: { alive: true }, B: { alive: true } }), null);
  });

  test('最爛照片回顧：依輪次排序，跳過沒人因投票出局的輪次', () => {
    // Firebase 會把數字 key 轉成陣列，index 0 是 null
    const rounds = [
      null,
      { result: { eliminated: ['A'] } },
      { result: { eliminated: [] } },
      { result: { eliminated: ['B', 'C'] } },
    ];
    assert.deepEqual(buildWorstPhotos(rounds), [
      { round: 1, uid: 'A' },
      { round: 3, uid: 'B' },
      { round: 3, uid: 'C' },
    ]);
    assert.deepEqual(buildWorstPhotos({ 10: { result: { eliminated: ['X'] } }, 2: { result: { eliminated: ['Y'] } } }), [
      { round: 2, uid: 'Y' },
      { round: 10, uid: 'X' },
    ]);
  });

  test('房主轉移：在線玩家中最早加入的人接任', () => {
    const players = {
      host: { online: false, joinedAt: 1 },
      late: { online: true, joinedAt: 30 },
      early: { online: true, joinedAt: 20 },
    };
    assert.equal(pickNextHost(players), 'early');
    assert.equal(pickNextHost({ host: { online: false, joinedAt: 1 } }), null);
  });
});
