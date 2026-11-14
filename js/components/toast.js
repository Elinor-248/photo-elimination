import { h } from '../utils/dom.js';

const TOAST_MS = 3000;
// 和 css 的 toast-out 動畫時間一致。不靠 animationend，因為減少動態效果時動畫可能不會跑。
const LEAVE_MS = 200;

export function showToast(message, { tone = 'info' } = {}) {
  const root = document.getElementById('toast-root');
  const toast = h('div', { class: `toast toast--${tone}`, role: 'status' }, message);
  root.append(toast);
  setTimeout(() => {
    toast.classList.add('toast--leaving');
    setTimeout(() => toast.remove(), LEAVE_MS);
  }, TOAST_MS);
}
