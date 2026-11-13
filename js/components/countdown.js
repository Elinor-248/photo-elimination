// 倒數：數字加進度條，剩 10 秒變紅並跳動（SPEC 2.3）。
// 時間一律用 phaseEndsAt 和伺服器時間計算，setInterval 只負責重畫。
import { h } from '../utils/dom.js';

const REDRAW_MS = 200;
const DANGER_MS = 10000;

// now：伺服器時間；showNumber 為 false 時只顯示進度條（揭曉、結果用）
export function createCountdown({ now, showNumber = true }) {
  const number = h('span', { class: 'countdown-number', 'aria-hidden': 'true' });
  const fill = h('span', { class: 'countdown-fill' });
  const el = h(
    'div',
    { class: 'countdown', role: 'timer' },
    showNumber ? number : null,
    h('span', { class: 'countdown-bar' }, fill),
  );

  let endsAt = 0;
  let totalMs = 1;

  function draw() {
    const remaining = Math.max(0, endsAt - now());
    const seconds = Math.ceil(remaining / 1000);
    number.textContent = String(seconds);
    el.setAttribute('aria-label', String(seconds));
    fill.style.transform = `scaleX(${Math.min(1, remaining / totalMs)})`;
    el.classList.toggle('countdown--danger', showNumber && remaining > 0 && remaining <= DANGER_MS);
  }

  const timer = setInterval(draw, REDRAW_MS);

  return {
    el,
    set(nextEndsAt, nextTotalMs) {
      endsAt = nextEndsAt;
      totalMs = nextTotalMs;
      draw();
    },
    destroy() {
      clearInterval(timer);
    },
  };
}
