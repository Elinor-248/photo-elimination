// 最爛照片回顧輪播（SPEC 4.7、4.9）：一次一張，可以左右滑，每 4 秒自動切換
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';

const AUTO_ADVANCE_MS = 4000;

function slides(room) {
  return (room.ending?.worstPhotos ?? [])
    .map(({ round, uid }) => {
      const data = room.rounds?.[round];
      const photo = data?.photos?.[uid];
      if (!photo) return null;
      const votes = data.result?.tally?.[uid];
      return h(
        'figure',
        { class: 'carousel-slide' },
        h('img', { class: 'carousel-slide-image', src: photo, alt: room.players?.[uid]?.name ?? '' }),
        h(
          'figcaption',
          { class: 'carousel-slide-caption' },
          h('span', { class: 'carousel-slide-prompt' }, t('ending.slidePrompt', { n: round, prompt: data.prompt?.text ?? '' })),
          h('span', { class: 'carousel-slide-name' }, room.players?.[uid]?.name ?? ''),
          votes != null ? h('span', { class: 'carousel-slide-votes' }, t('result.votes', { n: votes })) : null,
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
    // 回顧頁隱藏時寬度是 0，不捲
    if (!track.clientWidth) return;
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

// 回傳 { el, count, stop }。沒有照片時 count 是 0，呼叫端顯示說明文字。
export function createWorstCarousel(room) {
  const items = slides(room);
  const el = h('div', { class: 'carousel' }, items);
  return { el, count: items.length, stop: startCarousel(el, items.length) };
}
