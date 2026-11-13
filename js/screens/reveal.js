// 揭曉（SPEC 4.4）：照片逐張翻開，停留 8 秒後自動進入投票
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { serverNow } from '../firebase.js';
import { REVEAL_MS, WINNER_REVEAL_MS } from '../config.js';
import { createCountdown } from '../components/countdown.js';
import { candidateItems, createPhotoGrid } from '../components/photo-grid.js';
import { renderPromptCard } from '../components/prompt-card.js';

let ui = null;

export function render(container, state) {
  if (ui) return;
  const { room } = state;
  const round = room.rounds?.[room.meta.round] ?? {};
  const nameOf = (uid) => room.players?.[uid]?.name ?? '';
  const timeoutIds = Object.keys(round.timeouts ?? {});
  // 超時的人也放進照片牆，用叉叉標示沒拍到
  const items = [...candidateItems(room, round.candidates), ...timeoutIds.map((uid) => ({ uid, name: nameOf(uid), missing: true }))].sort(
    (a, b) => (room.players?.[a.uid]?.joinedAt ?? 0) - (room.players?.[b.uid]?.joinedAt ?? 0),
  );
  // 超時後只剩 1 人：揭曉完直接進結束畫面（SPEC 3.5）
  const alive = Object.entries(room.players ?? {}).filter(([, p]) => p.alive);
  const winner = alive.length === 1 ? alive[0][1].name : null;

  const countdown = createCountdown({ now: serverNow, showNumber: false });
  countdown.set(room.meta.phaseEndsAt, winner ? WINNER_REVEAL_MS : REVEAL_MS);
  const grid = createPhotoGrid({ items, flip: true });

  container.replaceChildren(
    h(
      'section',
      { class: 'reveal' },
      renderPromptCard(room),
      h('h2', { class: `screen-title${winner ? ' reveal-winner-title' : ''}` }, winner ? t('reveal.winnerTitle', { name: winner }) : t('reveal.title')),
      countdown.el,
      grid.el,
      timeoutIds.length > 0
        ? h('p', { class: 'card reveal-timeouts' }, t('reveal.timeouts', { names: timeoutIds.map(nameOf).join('、') }))
        : null,
      h('p', { class: 'screen-hint' }, t(winner ? 'reveal.winnerHint' : 'reveal.hint')),
    ),
  );
  ui = { countdown };
}

export function destroy() {
  ui?.countdown.destroy();
  ui = null;
}
