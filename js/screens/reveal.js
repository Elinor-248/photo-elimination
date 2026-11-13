// 揭曉（SPEC 4.4）：照片逐張翻開，停留 8 秒後自動進入投票
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { serverNow } from '../firebase.js';
import { REVEAL_MS } from '../config.js';
import { createCountdown } from '../components/countdown.js';
import { candidateItems, createPhotoGrid } from '../components/photo-grid.js';
import { renderPromptCard } from '../components/prompt-card.js';

let ui = null;

export function render(container, state) {
  if (ui) return;
  const { room } = state;
  const round = room.rounds?.[room.meta.round] ?? {};
  const timedOut = Object.keys(round.timeouts ?? {}).map((uid) => room.players?.[uid]?.name ?? '');

  const countdown = createCountdown({ now: serverNow, showNumber: false });
  countdown.set(room.meta.phaseEndsAt, REVEAL_MS);
  const grid = createPhotoGrid({ items: candidateItems(room, round.candidates), flip: true });

  container.replaceChildren(
    h(
      'section',
      { class: 'reveal' },
      renderPromptCard(room),
      h('h2', { class: 'screen-title' }, t('reveal.title')),
      countdown.el,
      grid.el,
      timedOut.length > 0
        ? h('p', { class: 'card reveal-timeouts' }, t('reveal.timeouts', { names: timedOut.join('、') }))
        : null,
      h('p', { class: 'screen-hint' }, t('reveal.hint')),
    ),
  );
  ui = { countdown };
}

export function destroy() {
  ui?.countdown.destroy();
  ui = null;
}
