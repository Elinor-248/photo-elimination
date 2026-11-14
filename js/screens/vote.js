// 投票與重投（SPEC 4.5）：點照片就是投票，角落放大鏡才是放大
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { castVote, serverNow } from '../firebase.js';
import { getQuota } from '../rules.js';
import { showToast } from '../components/toast.js';
import { createCountdown } from '../components/countdown.js';
import { candidateItems, createPhotoGrid } from '../components/photo-grid.js';
import { renderPromptCard } from '../components/prompt-card.js';

let ui = null;

// 這一階段的候選人、票和要淘汰的人數
function ballot(room) {
  const round = room.rounds?.[room.meta.round] ?? {};
  if (room.meta.phase === 'revote') {
    const revote = round.revote ?? {};
    return { isRevote: true, candidates: revote.candidates, votes: revote.votes ?? {}, quota: revote.quota ?? 1 };
  }
  const candidates = round.candidates ?? {};
  return { isRevote: false, candidates, votes: round.votes ?? {}, quota: getQuota(Object.keys(candidates).length) };
}

function mount(container, state) {
  const { room, uid, code } = state;
  const { isRevote, candidates, quota } = ballot(room);

  const countdown = createCountdown({ now: serverNow });
  countdown.set(room.meta.phaseEndsAt, room.meta.settings.voteSec * 1000);
  const progress = h('p', { class: 'vote-progress' });

  let selected = null;
  const grid = createPhotoGrid({
    items: candidateItems(room, candidates),
    mode: 'vote',
    onSelect: async (target) => {
      if (target === uid || target === selected) return;
      const previous = selected;
      selected = target;
      grid.setSelected(target);
      try {
        await castVote(code, room.meta.round, target, isRevote);
      } catch (error) {
        console.error(error);
        selected = previous;
        grid.setSelected(previous);
        showToast(t('errors.voteFailed'), { tone: 'error' });
      }
    },
  });
  grid.setDisabled(uid);

  container.replaceChildren(
    h(
      'section',
      { class: 'vote' },
      renderPromptCard(room),
      h('h2', { class: 'screen-title' }, t(isRevote ? 'vote.revoteTitle' : 'vote.title')),
      h('p', { class: 'screen-hint' }, t('vote.quota', { n: quota })),
      countdown.el,
      progress,
      grid.el,
    ),
  );
  ui = {
    countdown,
    progress,
    grid,
    setSelected(target) {
      selected = target;
      grid.setSelected(target);
    },
  };
}

export function render(container, state) {
  if (!ui) mount(container, state);
  const { room, uid } = state;
  const { votes } = ballot(room);
  if (votes[uid]) ui.setSelected(votes[uid]);

  // 提前結束看的是在線玩家（SPEC 5.1），所以分母用在線人數
  const voted = Object.keys(votes).length;
  const online = Object.values(room.players ?? {}).filter((p) => p.online).length;
  ui.progress.textContent = t('vote.progress', { done: voted, total: Math.max(voted, online) });
}

export function destroy() {
  ui?.countdown.destroy();
  ui = null;
}
