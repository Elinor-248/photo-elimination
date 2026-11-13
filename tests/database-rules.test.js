// 安全規則測試（SPEC 5.6）：直接對 Firebase 模擬器發 REST 請求。
// 模擬器沒開時整組跳過：firebase emulators:start --only auth,database
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_EMULATOR_PORT,
  DATABASE_EMULATOR_PORT,
  DEMO_PROJECT_ID,
  EMULATOR_CONFIG,
  EMULATOR_HOST,
  PHOTO_PREFIX,
  MAX_PHOTO_CHARS,
} from '../js/config.js';

const DB = `http://${EMULATOR_HOST}:${DATABASE_EMULATOR_PORT}`;
const NS = `ns=${DEMO_PROJECT_ID}-default-rtdb`;

const emulatorUp = await fetch(`${DB}/.json?${NS}`, { signal: AbortSignal.timeout(1000) })
  .then(() => true)
  .catch(() => false);

async function signUp() {
  const url = `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${EMULATOR_CONFIG.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const { idToken, localId } = await res.json();
  return { token: idToken, uid: localId };
}

// user 為 null 時用管理員身分（不經過安全規則），用來準備測試資料
async function request(user, method, path, body, query = '') {
  const auth = user ? `&auth=${user.token}` : '';
  const headers = user ? {} : { Authorization: 'Bearer owner' };
  const res = await fetch(`${DB}/${path}.json?${NS}${auth}${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

const read = (user, path, query) => request(user, 'GET', path, undefined, query);
const patch = (user, path, body) => request(user, 'PATCH', path, body);
const put = (user, path, body) => request(user, 'PUT', path, body);
const remove = (user, path) => request(user, 'DELETE', path);

function meta(hostId, overrides = {}) {
  const now = Date.now();
  return {
    hostId,
    phase: 'lobby',
    round: 0,
    step: 0,
    settings: { captureSec: 60, voteSec: 30, customOnly: false },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function player(name, overrides = {}) {
  return { name, joinedAt: Date.now(), online: true, alive: true, ...overrides };
}

let codeSeq = 9000;
function nextCode() {
  return String(codeSeq++);
}

// 建好一個房間：host 是房主，members 都已加入。meta 和 rounds 可以覆蓋。
async function setupRoom({ host, members = [], metaOverrides = {}, rounds, deadIds = [] }) {
  const code = nextCode();
  const players = { [host.uid]: player('host') };
  members.forEach((m, i) => (players[m.uid] = player(`p${i}`)));
  for (const uid of deadIds) players[uid].alive = false;
  await put(null, `rooms/${code}`, { meta: meta(host.uid, metaOverrides), players, rounds: rounds ?? null });
  return code;
}

describe('安全規則', { skip: !emulatorUp && '模擬器沒開' }, () => {
  let host, a, b, outsider;

  before(async () => {
    await remove(null, 'rooms');
    [host, a, b, outsider] = await Promise.all([signUp(), signUp(), signUp(), signUp()]);
  });

  describe('建房與加入', () => {
    test('建立新房間：meta 和自己的玩家資料一起寫入', async () => {
      const code = nextCode();
      const r = await patch(host, `rooms/${code}`, { meta: meta(host.uid), [`players/${host.uid}`]: player('host') });
      assert.equal(r.ok, true, JSON.stringify(r.data));
    });

    test('房號已經有人用：外人不能覆蓋 meta', async () => {
      const code = await setupRoom({ host });
      const r = await patch(outsider, `rooms/${code}`, { meta: meta(outsider.uid) });
      assert.equal(r.ok, false);
    });

    test('等待室時可以加入，只能寫自己的玩家資料', async () => {
      const code = await setupRoom({ host });
      assert.equal((await put(a, `rooms/${code}/players/${a.uid}`, player('a'))).ok, true);
      assert.equal((await put(a, `rooms/${code}/players/${b.uid}`, player('b'))).ok, false);
    });

    test('遊戲開始後不能加入', async () => {
      const code = await setupRoom({ host, metaOverrides: { phase: 'capture', round: 1, phaseEndsAt: Date.now() + 60000 } });
      assert.equal((await put(a, `rooms/${code}/players/${a.uid}`, player('a'))).ok, false);
    });

    test('暱稱太長被擋下', async () => {
      const code = await setupRoom({ host });
      assert.equal((await put(a, `rooms/${code}/players/${a.uid}`, player('一'.repeat(17)))).ok, false);
    });

    test('外人可以讀 meta 和玩家名單（加入前要檢查），不能讀其他資料', async () => {
      const code = await setupRoom({ host, rounds: { 1: { prompt: { id: 'x', text: 'x', fallback: false } } } });
      assert.equal((await read(outsider, `rooms/${code}/meta`)).ok, true);
      assert.equal((await read(outsider, `rooms/${code}/players`)).ok, true);
      assert.equal((await read(outsider, `rooms/${code}/rounds`)).ok, false);
      assert.equal((await read(outsider, `rooms/${code}`)).ok, false);
      assert.equal((await read(host, `rooms/${code}`)).ok, true);
    });

    test('被踢出（玩家資料已刪除）後，斷線時的 online 更新不會留下殘缺的玩家資料', async () => {
      const code = await setupRoom({ host });
      const r = await patch(a, `rooms/${code}/players/${a.uid}`, { online: false, offlineAt: Date.now() });
      assert.equal(r.ok, false);
    });
  });

  describe('推進：step 只能剛好加 1', () => {
    test('帶 step + 1 可以換階段；同樣的寫入第二次被擋下', async () => {
      const code = await setupRoom({ host, members: [a] });
      const updates = { 'meta/phase': 'capture', 'meta/round': 1, 'meta/step': 1, 'meta/phaseEndsAt': Date.now() + 60000 };
      assert.equal((await patch(a, `rooms/${code}`, updates)).ok, true);
      assert.equal((await patch(host, `rooms/${code}`, updates)).ok, false);
    });

    test('不帶 step 不能換階段', async () => {
      const code = await setupRoom({ host });
      assert.equal((await patch(host, `rooms/${code}/meta`, { phase: 'capture' })).ok, false);
    });

    test('step 跳號被擋下', async () => {
      const code = await setupRoom({ host });
      assert.equal((await patch(host, `rooms/${code}/meta`, { phase: 'capture', step: 2 })).ok, false);
    });

    test('不合法的階段名稱被擋下', async () => {
      const code = await setupRoom({ host });
      assert.equal((await patch(host, `rooms/${code}/meta`, { phase: 'party', step: 1 })).ok, false);
    });

    test('外人不能推進', async () => {
      const code = await setupRoom({ host });
      assert.equal((await patch(outsider, `rooms/${code}/meta`, { phase: 'capture', step: 1 })).ok, false);
    });

    test('改設定不用帶 step，但只能用規格裡的選項', async () => {
      const code = await setupRoom({ host });
      assert.equal((await patch(host, `rooms/${code}/meta/settings`, { captureSec: 90 })).ok, true);
      assert.equal((await patch(host, `rooms/${code}/meta/settings`, { captureSec: 61 })).ok, false);
    });

    test('成員可以在遊戲中標記別人出局，等待室時不行', async () => {
      const lobby = await setupRoom({ host, members: [a] });
      assert.equal((await patch(a, `rooms/${lobby}/players/${host.uid}`, { alive: false })).ok, false);
      const playing = await setupRoom({ host, members: [a], metaOverrides: { phase: 'result', round: 1, phaseEndsAt: Date.now() } });
      const r = await patch(a, `rooms/${playing}/players/${host.uid}`, { alive: false, eliminatedRound: 1, eliminatedBy: 'vote' });
      assert.equal(r.ok, true, JSON.stringify(r.data));
    });

    test('成員不能改別人的暱稱或在線狀態', async () => {
      const code = await setupRoom({ host, members: [a] });
      assert.equal((await patch(a, `rooms/${code}/players/${host.uid}`, { name: 'x' })).ok, false);
      assert.equal((await patch(a, `rooms/${code}/players/${host.uid}`, { online: false })).ok, false);
    });
  });

  describe('照片', () => {
    const photo = PHOTO_PREFIX + 'abc';
    const capture = (endsIn) => ({ phase: 'capture', round: 1, phaseEndsAt: Date.now() + endsIn });

    test('拍照時間內可以送出自己的照片，只能送一次', async () => {
      const code = await setupRoom({ host, members: [a], metaOverrides: capture(60000) });
      assert.equal((await put(a, `rooms/${code}/rounds/1/photos/${a.uid}`, photo)).ok, true);
      assert.equal((await put(a, `rooms/${code}/rounds/1/photos/${a.uid}`, photo + 'x')).ok, false);
    });

    test('不能替別人送照片', async () => {
      const code = await setupRoom({ host, members: [a], metaOverrides: capture(60000) });
      assert.equal((await put(a, `rooms/${code}/rounds/1/photos/${host.uid}`, photo)).ok, false);
    });

    test('時間到後的 2 秒緩衝內還可以送，超過就不行', async () => {
      const inGrace = await setupRoom({ host, members: [a], metaOverrides: capture(-1000) });
      assert.equal((await put(a, `rooms/${inGrace}/rounds/1/photos/${a.uid}`, photo)).ok, true);
      const late = await setupRoom({ host, members: [a], metaOverrides: capture(-3000) });
      assert.equal((await put(a, `rooms/${late}/rounds/1/photos/${a.uid}`, photo)).ok, false);
    });

    test('輪次不對、不是拍照階段、已出局：不能送', async () => {
      const code = await setupRoom({ host, members: [a], metaOverrides: capture(60000) });
      assert.equal((await put(a, `rooms/${code}/rounds/2/photos/${a.uid}`, photo)).ok, false);
      const voting = await setupRoom({ host, members: [a], metaOverrides: { ...capture(60000), phase: 'vote' } });
      assert.equal((await put(a, `rooms/${voting}/rounds/1/photos/${a.uid}`, photo)).ok, false);
      const dead = await setupRoom({ host, members: [a], deadIds: [a.uid], metaOverrides: capture(60000) });
      assert.equal((await put(a, `rooms/${dead}/rounds/1/photos/${a.uid}`, photo)).ok, false);
    });

    test('格式不對或超過 MAX_PHOTO_CHARS 被擋下，剛好等於上限可以', async () => {
      const code = await setupRoom({ host, members: [a, b], metaOverrides: capture(60000) });
      assert.equal((await put(a, `rooms/${code}/rounds/1/photos/${a.uid}`, 'data:image/png;base64,abc')).ok, false);
      const max = PHOTO_PREFIX + 'a'.repeat(MAX_PHOTO_CHARS - PHOTO_PREFIX.length);
      assert.equal((await put(a, `rooms/${code}/rounds/1/photos/${a.uid}`, max + 'a')).ok, false);
      assert.equal((await put(b, `rooms/${code}/rounds/1/photos/${b.uid}`, max)).ok, true);
    });
  });

  describe('投票', () => {
    const voteMeta = (phase = 'vote', endsIn = 30000) => ({ phase, round: 1, phaseEndsAt: Date.now() + endsIn });

    async function voteRoom(phase, endsIn) {
      return setupRoom({
        host,
        members: [a, b],
        metaOverrides: voteMeta(phase, endsIn),
        rounds: { 1: { candidates: { [host.uid]: true, [a.uid]: true }, revote: { candidates: { [host.uid]: true, [a.uid]: true }, quota: 1 } } },
      });
    }

    test('可以投候選人，也可以改票', async () => {
      const code = await voteRoom();
      assert.equal((await put(b, `rooms/${code}/rounds/1/votes/${b.uid}`, host.uid)).ok, true);
      assert.equal((await put(b, `rooms/${code}/rounds/1/votes/${b.uid}`, a.uid)).ok, true);
    });

    test('不能投自己、不能投非候選人、不能替別人投', async () => {
      const code = await voteRoom();
      assert.equal((await put(a, `rooms/${code}/rounds/1/votes/${a.uid}`, a.uid)).ok, false);
      assert.equal((await put(a, `rooms/${code}/rounds/1/votes/${a.uid}`, b.uid)).ok, false);
      assert.equal((await put(a, `rooms/${code}/rounds/1/votes/${b.uid}`, host.uid)).ok, false);
    });

    test('不是投票階段、超過 1 秒緩衝：不能投', async () => {
      const reveal = await voteRoom('reveal');
      assert.equal((await put(b, `rooms/${reveal}/rounds/1/votes/${b.uid}`, a.uid)).ok, false);
      const late = await voteRoom('vote', -2000);
      assert.equal((await put(b, `rooms/${late}/rounds/1/votes/${b.uid}`, a.uid)).ok, false);
    });

    test('重投：只能在重投階段投，寫在 revote/votes', async () => {
      const code = await voteRoom('revote');
      assert.equal((await put(b, `rooms/${code}/rounds/1/revote/votes/${b.uid}`, a.uid)).ok, true);
      assert.equal((await put(b, `rooms/${code}/rounds/1/votes/${b.uid}`, a.uid)).ok, false);
      assert.equal((await put(a, `rooms/${code}/rounds/1/revote/votes/${b.uid}`, host.uid)).ok, false);
    });

    test('外人不能投票', async () => {
      const code = await voteRoom();
      assert.equal((await put(outsider, `rooms/${code}/rounds/1/votes/${outsider.uid}`, a.uid)).ok, false);
    });
  });

  describe('等待室', () => {
    test('踢人：只有房主可以，而且只能在等待室', async () => {
      const code = await setupRoom({ host, members: [a, b] });
      assert.equal((await remove(a, `rooms/${code}/players/${b.uid}`)).ok, false);
      assert.equal((await remove(host, `rooms/${code}/players/${b.uid}`)).ok, true);
      const playing = await setupRoom({ host, members: [a], metaOverrides: { phase: 'vote', round: 1, phaseEndsAt: Date.now() } });
      assert.equal((await remove(host, `rooms/${playing}/players/${a.uid}`)).ok, false);
    });

    test('出題：只能用自己的名義；刪題：本人或房主', async () => {
      const code = await setupRoom({ host, members: [a, b] });
      assert.equal((await put(a, `rooms/${code}/customPrompts/p1`, { text: '題目', authorId: a.uid })).ok, true);
      assert.equal((await put(a, `rooms/${code}/customPrompts/p2`, { text: '題目', authorId: b.uid })).ok, false);
      assert.equal((await remove(b, `rooms/${code}/customPrompts/p1`)).ok, false);
      assert.equal((await remove(host, `rooms/${code}/customPrompts/p1`)).ok, true);
    });

    test('再來一局：結束畫面時可以清空輪次和題目，遊戲中不行', async () => {
      const ending = await setupRoom({ host, members: [a], metaOverrides: { phase: 'ending', round: 2 }, rounds: { 1: { candidates: { x: true } } } });
      assert.equal((await patch(a, `rooms/${ending}`, { rounds: null, customPrompts: null })).ok, true);
      const playing = await setupRoom({ host, members: [a], metaOverrides: { phase: 'vote', round: 1, phaseEndsAt: Date.now() }, rounds: { 1: { candidates: { x: true } } } });
      assert.equal((await remove(a, `rooms/${playing}/rounds`)).ok, false);
    });
  });

  describe('舊房間（由管理者手動到後台刪除）', () => {
    test('一般使用者不能刪除整個房間，房主也不行', async () => {
      const code = await setupRoom({ host });
      assert.equal((await remove(outsider, `rooms/${code}`)).ok, false);
      assert.equal((await remove(host, `rooms/${code}`)).ok, false);
    });

    test('不能列出所有房間', async () => {
      assert.equal((await read(outsider, 'rooms')).ok, false);
    });
  });
});
