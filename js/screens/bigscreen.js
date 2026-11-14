// 大螢幕模式（SPEC 4.9）：投影或電視用，不是玩家，不能投票，但會參與遊戲推進。
// 每個階段一個 view，換階段（或換輪、作廢重拍）時整個重畫，同一階段內只更新會變的部分。
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { serverNow } from '../firebase.js';
import { REVEAL_MS, RESULT_MS, WINNER_REVEAL_MS } from '../config.js';
import { MAX_PLAYERS, getQuota } from '../rules.js';
import { createCountdown } from '../components/countdown.js';
import { candidateItems, createPhotoGrid, revealItems, soleSurvivorName } from '../components/photo-grid.js';
import { renderPromptCard } from '../components/prompt-card.js';
import { createWorstCarousel } from '../components/worst-carousel.js';

let ui = null;

function sortedPlayers(room) {
  return Object.entries(room.players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
}

// 照片牆依人數排：4 張以內一排，再多就兩排，讓照片在 16:9 畫面上盡量大
function bigWall(items, { flip = false } = {}) {
  const grid = createPhotoGrid({ items, flip });
  const rows = items.length <= 4 ? 1 : 2;
  grid.el.classList.add('bigscreen-wall');
  grid.el.style.setProperty('--rows', rows);
  grid.el.style.setProperty('--cols', Math.max(1, Math.ceil(items.length / rows)));
  return grid.el;
}

function countdownFor(room, totalMs, options) {
  const countdown = createCountdown({ now: serverNow, ...options });
  countdown.set(room.meta.phaseEndsAt, totalMs);
  countdown.el.classList.add('bigscreen-countdown');
  return countdown;
}

// ---- 各階段 ----

function lobbyView(root, state) {
  const title = h('h2', { class: 'bigscreen-section-title' });
  const players = h('ul', { class: 'bigscreen-players' });
  const prompts = h('p', { class: 'bigscreen-note' });
  root.append(
    h(
      'div',
      { class: 'bigscreen-lobby' },
      h(
        'section',
        { class: 'bigscreen-lobby-code' },
        h('p', { class: 'bigscreen-label' }, t('lobby.roomCode')),
        h('p', { class: 'bigscreen-code' }, state.code),
        h('p', { class: 'bigscreen-note' }, t('bigscreen.joinHint')),
      ),
      h('section', { class: 'bigscreen-lobby-players' }, title, players, prompts, h('p', { class: 'wait-note' }, t('bigscreen.waitHost'))),
    ),
  );
  return {
    update({ room }) {
      const list = sortedPlayers(room);
      title.textContent = t('lobby.players', { count: list.length, max: MAX_PLAYERS });
      players.replaceChildren(
        ...list.map(([uid, p]) =>
          h(
            'li',
            { class: `bigscreen-player${p.online ? '' : ' bigscreen-player--offline'}` },
            p.name,
            uid === room.meta.hostId ? h('span', { class: 'badge' }, t('lobby.host')) : null,
          ),
        ),
      );
      prompts.textContent = t('lobby.promptCount', { custom: Object.keys(room.customPrompts ?? {}).length, builtin: state.builtinPrompts.length });
    },
  };
}

function captureView(root, { room }) {
  const countdown = countdownFor(room, room.meta.settings.captureSec * 1000);
  const progress = h('p', { class: 'bigscreen-progress' });
  const cards = h('ul', { class: 'bigscreen-players bigscreen-players--status' });
  root.append(renderPromptCard(room), countdown.el, progress, cards);
  return {
    update({ room }) {
      const photos = room.rounds?.[room.meta.round]?.photos ?? {};
      const alive = sortedPlayers(room).filter(([, p]) => p.alive);
      progress.textContent = t('capture.progress', { done: alive.filter(([uid]) => photos[uid]).length, total: alive.length });
      // 已送出的人亮起
      cards.replaceChildren(
        ...alive.map(([uid, p]) => h('li', { class: `bigscreen-player${photos[uid] ? ' bigscreen-player--done' : ''}` }, p.name, photos[uid] ? ' ✓' : '')),
      );
    },
    destroy: () => countdown.destroy(),
  };
}

function revealView(root, { room }) {
  const winner = soleSurvivorName(room);
  const countdown = countdownFor(room, winner ? WINNER_REVEAL_MS : REVEAL_MS, { showNumber: false });
  const round = room.rounds?.[room.meta.round] ?? {};
  const timedOut = Object.keys(round.timeouts ?? {}).map((uid) => room.players?.[uid]?.name ?? '');
  root.append(
    renderPromptCard(room),
    h('h2', { class: `bigscreen-title${winner ? ' bigscreen-title--winner' : ''}` }, winner ? t('reveal.winnerTitle', { name: winner }) : t('reveal.title')),
    countdown.el,
    bigWall(revealItems(room), { flip: true }),
    timedOut.length > 0 ? h('p', { class: 'bigscreen-note bigscreen-note--danger' }, t('reveal.timeouts', { names: timedOut.join('、') })) : null,
  );
  return { destroy: () => countdown.destroy() };
}

// 投票：只顯示照片牆和已投人數，不顯示即時票數（SPEC 4.9）
function voteView(root, { room }) {
  const isRevote = room.meta.phase === 'revote';
  const round = room.rounds?.[room.meta.round] ?? {};
  const candidates = isRevote ? round.revote?.candidates : round.candidates;
  const quota = isRevote ? round.revote?.quota ?? 1 : getQuota(Object.keys(candidates ?? {}).length);
  const countdown = countdownFor(room, room.meta.settings.voteSec * 1000);
  const progress = h('p', { class: 'bigscreen-progress' });
  root.append(
    renderPromptCard(room),
    h('h2', { class: 'bigscreen-title' }, t(isRevote ? 'vote.revoteTitle' : 'vote.title'), h('span', { class: 'bigscreen-subtitle' }, t('bigscreen.quota', { n: quota }))),
    countdown.el,
    progress,
    bigWall(candidateItems(room, candidates)),
  );
  return {
    update({ room }) {
      const current = room.rounds?.[room.meta.round] ?? {};
      const votes = (isRevote ? current.revote?.votes : current.votes) ?? {};
      const voted = Object.keys(votes).length;
      const online = Object.values(room.players ?? {}).filter((p) => p.online).length;
      progress.textContent = t('vote.progress', { done: voted, total: Math.max(voted, online) });
    },
    destroy: () => countdown.destroy(),
  };
}

// 結果：出局者照片放大，票數用長條動畫長出來
function resultView(root, { room }) {
  const round = room.rounds?.[room.meta.round] ?? {};
  const { tally = {}, eliminated = [] } = round.result ?? {};
  const nameOf = (uid) => room.players?.[uid]?.name ?? '';
  const max = Math.max(1, ...Object.values(tally));
  const countdown = countdownFor(room, RESULT_MS, { showNumber: false });

  const bars = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([uid, count]) => {
      const fill = h('span', { class: 'bigscreen-bar-fill' });
      // 下一個畫格才設寬度，transition 才會從 0 長出來
      requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${(count / max) * 100}%`)));
      return h(
        'li',
        { class: `bigscreen-bar${eliminated.includes(uid) ? ' bigscreen-bar--out' : ''}` },
        h('span', { class: 'bigscreen-bar-name' }, nameOf(uid)),
        h('span', { class: 'bigscreen-bar-track' }, fill),
        h('span', { class: 'bigscreen-bar-count' }, t('result.votes', { n: count })),
      );
    });

  root.append(
    h('p', { class: 'prompt-card-round' }, t('common.round', { n: room.meta.round })),
    h(
      'h1',
      { class: `bigscreen-title${eliminated.length > 0 ? ' bigscreen-title--out' : ''}` },
      eliminated.length > 0 ? t('result.eliminated', { names: eliminated.map(nameOf).join('、') }) : t('result.nobody'),
    ),
    countdown.el,
    h(
      'div',
      { class: 'bigscreen-result' },
      eliminated.length > 0
        ? h(
            'div',
            { class: 'bigscreen-out-photos' },
            eliminated.map((uid) =>
              round.photos?.[uid]
                ? h('figure', { class: 'bigscreen-out-photo' }, h('img', { src: round.photos[uid], alt: nameOf(uid) }), h('figcaption', {}, nameOf(uid)))
                : null,
            ),
          )
        : null,
      bars.length > 0 ? h('ul', { class: 'bigscreen-bars' }, bars) : null,
    ),
    h('p', { class: 'bigscreen-progress' }, t('result.alive', { n: Object.values(room.players ?? {}).filter((p) => p.alive).length })),
  );
  return { destroy: () => countdown.destroy() };
}

// 結束：冠軍頁按按鈕才到回顧頁（使用者選擇：大螢幕也用點的）。再來一局由房主在手機上按。
function endingView(root, { room }) {
  const winner = room.players?.[room.ending?.winnerId]?.name ?? '';
  const carousel = createWorstCarousel(room);
  const championPage = h(
    'section',
    { class: 'bigscreen-page' },
    h('div', { class: 'bigscreen-winner' }, h('p', { class: 'bigscreen-crown', 'aria-hidden': 'true' }, '👑'), h('p', { class: 'bigscreen-label' }, t('ending.champion')), h('h1', { class: 'bigscreen-winner-name' }, winner)),
    h('button', { class: 'button button--primary', type: 'button', onclick: () => showPage('review') }, t('ending.toReview')),
  );
  const reviewPage = h(
    'section',
    { class: 'bigscreen-page bigscreen-review', hidden: true },
    h('button', { class: 'button bigscreen-back', type: 'button', onclick: () => showPage('champion') }, t('ending.backToChampion')),
    h('h2', { class: 'bigscreen-title' }, t('ending.review')),
    carousel.count > 0 ? carousel.el : h('p', { class: 'bigscreen-note' }, t('ending.reviewEmpty')),
    h('p', { class: 'bigscreen-note' }, t('ending.waitHost')),
  );
  function showPage(page) {
    championPage.hidden = page !== 'champion';
    reviewPage.hidden = page !== 'review';
  }
  root.append(championPage, reviewPage);
  return { destroy: carousel.stop };
}

const VIEWS = {
  lobby: lobbyView,
  capture: captureView,
  reveal: revealView,
  vote: voteView,
  revote: voteView,
  result: resultView,
  ending: endingView,
};

// 同一個 key 內只更新，key 變了就重畫。作廢重拍時輪次不變，所以拍照要加上 phaseEndsAt。
function viewKey(meta) {
  if (meta.phase === 'lobby' || meta.phase === 'ending') return meta.phase;
  if (meta.phase === 'capture') return `capture:${meta.round}:${meta.phaseEndsAt}`;
  return `${meta.phase}:${meta.round}`;
}

export function render(container, state) {
  const key = viewKey(state.room.meta);
  if (ui?.key !== key) {
    destroy();
    const root = h('section', { class: `bigscreen bigscreen--${state.room.meta.phase}` });
    container.replaceChildren(root);
    const view = VIEWS[state.room.meta.phase](root, state);
    ui = { key, ...view };
  }
  ui.update?.(state);
}

export function destroy() {
  ui?.destroy?.();
  ui = null;
}
