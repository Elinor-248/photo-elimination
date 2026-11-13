// 暫時的畫面：拍照、揭曉、投票、結果、結束還沒做之前，先顯示目前的階段。
// 做完那些畫面後，把這個檔案和 main.js 裡的對照拿掉。
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';

let message = null;

export function render(container, state) {
  if (!message) {
    message = h('p', { class: 'playing-placeholder' });
    container.append(message);
  }
  const { round, phase } = state.room.meta;
  message.textContent = t('app.playingPlaceholder', { round, phase });
}

export function destroy() {
  message = null;
}
