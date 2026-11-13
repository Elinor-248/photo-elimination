// 照片牆（SPEC 4.4、4.5）：手機兩欄，每張附名字。
// mode 'view'：點照片放大。mode 'vote'：點照片投票，角落的放大鏡才是放大。
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';

const FLIP_STAGGER_MS = 80;

// 本輪候選人的照片，依加入順序排列
export function candidateItems(room, candidateIds) {
  const round = room.rounds?.[room.meta.round] ?? {};
  return Object.keys(candidateIds ?? {})
    .filter((uid) => round.photos?.[uid])
    .sort((a, b) => (room.players?.[a]?.joinedAt ?? 0) - (room.players?.[b]?.joinedAt ?? 0))
    .map((uid) => ({ uid, name: room.players?.[uid]?.name ?? '', src: round.photos[uid] }));
}

export function openLightbox(src, caption) {
  const onKey = (event) => event.key === 'Escape' && close();
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  // 點任何地方都關閉，包括照片本身
  const overlay = h(
    'div',
    { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': caption, onclick: close },
    h('img', { class: 'lightbox-image', src, alt: caption }),
    h('p', { class: 'lightbox-caption' }, caption),
    h('button', { class: 'button lightbox-close', type: 'button' }, t('common.close')),
  );
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  overlay.querySelector('button').focus();
}

// 沒拍到照片的人（超時）：灰底加大叉叉，不能點
function missingPhoto(name) {
  return h(
    'div',
    { class: 'photo-grid-photo photo-grid-photo--missing', role: 'img', 'aria-label': t('common.noPhotoOf', { name }) },
    h('span', { class: 'photo-grid-cross', 'aria-hidden': 'true' }, '✕'),
    h('span', { class: 'photo-grid-missing-label' }, t('common.noPhoto')),
  );
}

// items：[{ uid, name, src, missing }]。回傳 { el, setSelected(uid), setDisabled(uid) }。
export function createPhotoGrid({ items, mode = 'view', onSelect, flip = false }) {
  const cells = new Map();

  const el = h(
    'ul',
    { class: 'photo-grid' },
    items.map((item, index) => {
      const image = item.missing ? null : h('img', { class: 'photo-grid-image', src: item.src, alt: item.name });
      const photo = item.missing
        ? missingPhoto(item.name)
        : mode === 'vote'
          ? h(
              'button',
              { class: 'photo-grid-photo', type: 'button', 'aria-label': t('vote.voteFor', { name: item.name }), onclick: () => onSelect(item.uid) },
              image,
              h('span', { class: 'photo-grid-check', 'aria-hidden': 'true' }, '✓'),
            )
          : h(
              'button',
              { class: 'photo-grid-photo', type: 'button', 'aria-label': t('common.zoom', { name: item.name }), onclick: () => openLightbox(item.src, item.name) },
              image,
            );
      const cell = h(
        'li',
        {
          class: `photo-grid-item${flip ? ' photo-grid-item--flip' : ''}`,
          style: flip ? `animation-delay: ${index * FLIP_STAGGER_MS}ms` : null,
        },
        photo,
        h(
          'div',
          { class: 'photo-grid-caption' },
          h('span', { class: 'photo-grid-name' }, item.name),
          mode === 'vote'
            ? h(
                'button',
                {
                  class: 'button button--icon photo-grid-zoom',
                  type: 'button',
                  'aria-label': t('common.zoom', { name: item.name }),
                  onclick: () => openLightbox(item.src, item.name),
                },
                '🔍',
              )
            : null,
        ),
      );
      cells.set(item.uid, { cell, photo });
      return cell;
    }),
  );

  return {
    el,
    setSelected(uid) {
      for (const [id, { cell, photo }] of cells) {
        cell.classList.toggle('photo-grid-item--selected', id === uid);
        photo.setAttribute('aria-pressed', String(id === uid));
      }
    },
    setDisabled(uid) {
      const target = cells.get(uid);
      if (!target) return;
      target.cell.classList.add('photo-grid-item--disabled');
      target.photo.disabled = true;
    },
  };
}
