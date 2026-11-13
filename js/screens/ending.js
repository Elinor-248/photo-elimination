// 結束（SPEC 4.7）：冠軍 → 最爛照片回顧（可以滑，每 4 秒自動切換）→ 再來一局
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { showToast } from '../components/toast.js';

const AUTO_ADVANCE_MS = 4000;

let ui = null;

function slides(room) {
  return (room.ending?.worstPhotos ?? [])
    .map(({ round, uid }) => {
      const data = room.rounds?.[round];
      const photo = data?.photos?.[uid];
      if (!photo) return null;
      const votes = data.result?.tally?.[uid];
      return h(
        'figure',
        { class: 'ending-slide' },
        h('img', { class: 'ending-slide-image', src: photo, alt: room.players?.[uid]?.name ?? '' }),
        h(
          'figcaption',
          { class: 'ending-slide-caption' },
          h('span', { class: 'ending-slide-prompt' }, t('ending.slidePrompt', { n: round, prompt: data.prompt?.text ?? '' })),
          h('span', { class: 'ending-slide-name' }, room.players?.[uid]?.name ?? ''),
          votes != null ? h('span', { class: 'ending-slide-votes' }, t('result.votes', { n: votes })) : null,
        ),
      );
    })
    .filter(Boolean);
}

// 每 4 秒捲到下一張；使用者自己滑的時候重新計時
function startCarousel(track, count) {
  if (count < 2) return () => {};
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const next = () => {
    const index = Math.round(track.scrollLeft / track.clientWidth);
    const target = (index + 1) % count;
    track.scrollTo({ left: target * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  let timer = setInterval(next, AUTO_ADVANCE_MS);
  const restart = () => {
    clearInterval(timer);
    timer = setInterval(next, AUTO_ADVANCE_MS);
  };
  track.addEventListener('pointerdown', restart);
  track.addEventListener('touchstart', restart, { passive: true });
  return () => clearInterval(timer);
}

function mount(container, state) {
  const { room } = state;
  const winner = room.players?.[room.ending?.winnerId]?.name ?? '';
  const items = slides(room);
  const track = h('div', { class: 'ending-carousel' }, items);
  const footer = h('footer', { class: 'ending-footer' });

  container.replaceChildren(
    h(
      'section',
      { class: 'ending' },
      h('header', { class: 'ending-winner' }, h('p', { class: 'ending-crown', 'aria-hidden': 'true' }, '👑'), h('p', { class: 'ending-label' }, t('ending.champion')), h('h1', { class: 'ending-name' }, winner)),
      h(
        'section',
        { class: 'ending-review' },
        h('h2', { class: 'screen-title' }, t('ending.review')),
        items.length > 0 ? [h('p', { class: 'screen-hint' }, t('ending.reviewHint')), track] : h('p', { class: 'screen-hint' }, t('ending.reviewEmpty')),
      ),
      footer,
    ),
  );
  ui = { footer, stopCarousel: startCarousel(track, items.length) };
}

export function render(container, state) {
  if (!ui) mount(container, state);
  // 房主可能在結束畫面時轉移，按鈕每次更新都重畫
  const isHost = state.room.meta.hostId === state.uid;
  ui.footer.replaceChildren(
    isHost
      ? h(
          'button',
          {
            class: 'button button--primary button--block',
            type: 'button',
            onclick: async (event) => {
              const button = event.currentTarget;
              button.disabled = true;
              try {
                await state.actions.playAgain();
              } catch (error) {
                console.error(error);
                showToast(t('errors.network'), { tone: 'error' });
                button.disabled = false;
              }
            },
          },
          t('ending.playAgain'),
        )
      : h('p', { class: 'wait-note' }, t('ending.waitHost')),
  );
}

export function destroy() {
  ui?.stopCarousel();
  ui = null;
}
