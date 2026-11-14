// 輪次、題目、出題者（SPEC 2.3：題目是畫面上最大的字；3.4：自訂題目顯示出題者）
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';

export function renderPromptCard(room) {
  const round = room.meta.round;
  const prompt = room.rounds?.[round]?.prompt;
  const author = prompt?.authorId ? room.players?.[prompt.authorId]?.name : null;
  return h(
    'section',
    { class: 'prompt-card' },
    h('p', { class: 'prompt-card-round' }, t('common.round', { n: round })),
    h('h1', { class: 'prompt-card-text' }, prompt?.text ?? ''),
    author ? h('p', { class: 'prompt-card-author' }, t('common.promptAuthor', { name: author })) : null,
    prompt?.fallback ? h('p', { class: 'prompt-card-notice' }, t('common.promptFallback')) : null,
  );
}
