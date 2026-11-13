// 結果（SPEC 4.6）：票數由高到低，出局者標紅，停留 6 秒
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { serverNow } from '../firebase.js';
import { RESULT_MS } from '../config.js';
import { createCountdown } from '../components/countdown.js';

let ui = null;

export function render(container, state) {
  if (ui) return;
  const { room } = state;
  const round = room.rounds?.[room.meta.round] ?? {};
  const result = round.result ?? {};
  const eliminated = result.eliminated ?? [];
  const nameOf = (uid) => room.players?.[uid]?.name ?? '';

  // 有重投時 tally 是重投的票數；重投前就出局的人只出現在出局名單（SPEC 4.6）
  const rows = Object.entries(result.tally ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([uid, count]) => {
      const out = eliminated.includes(uid);
      return h(
        'li',
        { class: `result-row${out ? ' result-row--out' : ''}` },
        round.photos?.[uid] ? h('img', { class: 'result-thumb', src: round.photos[uid], alt: '' }) : null,
        h('span', { class: 'result-name' }, nameOf(uid)),
        out ? h('span', { class: 'badge result-out-badge' }, t('result.out')) : null,
        h('span', { class: 'result-votes' }, t('result.votes', { n: count })),
      );
    });

  const alive = Object.values(room.players ?? {}).filter((p) => p.alive).length;
  const countdown = createCountdown({ now: serverNow, showNumber: false });
  countdown.set(room.meta.phaseEndsAt, RESULT_MS);

  container.replaceChildren(
    h(
      'section',
      { class: 'result' },
      h('p', { class: 'prompt-card-round' }, t('common.round', { n: room.meta.round })),
      h(
        'h1',
        { class: `result-headline${eliminated.length > 0 ? ' result-headline--out' : ''}` },
        eliminated.length > 0 ? t('result.eliminated', { names: eliminated.map(nameOf).join('、') }) : t('result.nobody'),
      ),
      countdown.el,
      rows.length > 0 ? h('ul', { class: 'card result-list' }, rows) : null,
      h('p', { class: 'result-alive' }, t('result.alive', { n: alive })),
    ),
  );
  ui = { countdown };
}

export function destroy() {
  ui?.countdown.destroy();
  ui = null;
}
