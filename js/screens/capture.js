// 拍照（SPEC 4.3）
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { capturePhoto } from '../utils/image.js';
import { serverNow, submitPhoto } from '../firebase.js';
import { showToast } from '../components/toast.js';
import { createCountdown } from '../components/countdown.js';
import { renderPromptCard } from '../components/prompt-card.js';
import { attachVideo, createVideo, isCameraOpen, openCamera, switchCamera } from '../components/camera.js';

let ui = null;

function alivePlayers(room) {
  return Object.entries(room.players ?? {})
    .filter(([, p]) => p.alive)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt);
}

// 存活玩家還沒送出時的拍照區：打開相機 → 取景 → 預覽 → 送出
function createShooter(state) {
  const el = h('div', { class: 'capture-shooter' });
  let video = null;
  let busy = false;

  function showClosed(errorCode) {
    const open = h('button', { class: 'button button--primary button--block', type: 'button' }, t(errorCode ? 'capture.retry' : 'capture.openCamera'));
    open.addEventListener('click', async () => {
      open.disabled = true;
      const error = await openCamera();
      if (error) return showClosed(error);
      showLive();
    });
    el.replaceChildren(
      errorCode
        ? h('div', { class: 'card capture-help', role: 'alert' }, h('p', { class: 'card-title' }, t(`capture.${errorCode}`)), h('p', {}, t(`capture.${errorCode}Help`)))
        : h('p', { class: 'capture-hint' }, t('capture.openCameraHint')),
      open,
    );
  }

  function showLive() {
    video = createVideo();
    attachVideo(video);
    const shutter = h('button', { class: 'button button--primary capture-shutter', type: 'button' }, t('capture.shutter'));
    const flip = h('button', { class: 'button capture-flip', type: 'button', 'aria-label': t('capture.switchCamera') }, '🔄');
    shutter.addEventListener('click', () => {
      if (!video.videoWidth) return;
      const dataUrl = capturePhoto(video);
      if (!dataUrl) return showToast(t('errors.photoTooLarge'), { tone: 'error' });
      showPreview(dataUrl);
    });
    flip.addEventListener('click', async () => {
      flip.disabled = true;
      const error = await switchCamera();
      if (error) showToast(t(`capture.${error}`), { tone: 'error' });
      attachVideo(video);
      flip.disabled = false;
    });
    el.replaceChildren(h('div', { class: 'capture-frame' }, video), h('div', { class: 'capture-actions' }, flip, shutter));
  }

  function showPreview(dataUrl) {
    const retake = h('button', { class: 'button', type: 'button', onclick: showLive }, t('capture.retake'));
    const send = h('button', { class: 'button button--primary', type: 'button' }, t('capture.submit'));
    send.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      send.disabled = true;
      retake.disabled = true;
      try {
        await submitPhoto(state.code, state.room.meta.round, dataUrl);
        // 送出成功後，房間資料更新會換成「已送出」畫面
      } catch (error) {
        console.error(error);
        showToast(t('errors.submitFailed'), { tone: 'error' });
        send.disabled = false;
        retake.disabled = false;
      } finally {
        busy = false;
      }
    });
    el.replaceChildren(
      h('div', { class: 'capture-frame' }, h('img', { class: 'capture-preview', src: dataUrl, alt: t('capture.previewAlt') })),
      h('div', { class: 'capture-actions' }, retake, send),
    );
  }

  // 相機整局不關（使用者決定），第二輪起直接進取景
  if (isCameraOpen()) showLive();
  else showClosed(null);
  return el;
}

function renderSubmitted(photo) {
  return h(
    'div',
    { class: 'capture-done' },
    h('img', { class: 'capture-done-thumb', src: photo, alt: t('capture.previewAlt') }),
    h('p', { class: 'capture-done-text' }, t('capture.submitted')),
  );
}

// 觀眾：每位存活玩家是否已送出
function renderStatusList(room, photos) {
  return h(
    'ul',
    { class: 'capture-status-list' },
    alivePlayers(room).map(([uid, player]) =>
      h(
        'li',
        { class: `capture-status${photos[uid] ? ' capture-status--done' : ''}` },
        h('span', {}, player.name),
        h('span', { class: 'capture-status-label' }, t(photos[uid] ? 'capture.statusDone' : 'capture.statusShooting')),
      ),
    ),
  );
}

function mount(container, state, key) {
  const { room } = state;
  const countdown = createCountdown({ now: serverNow });
  countdown.set(room.meta.phaseEndsAt, room.meta.settings.captureSec * 1000);
  const progress = h('p', { class: 'capture-progress' });
  const body = h('div', { class: 'capture-body' });
  const root = h('section', { class: 'capture' }, renderPromptCard(room), countdown.el, progress, body);
  container.replaceChildren(root);
  ui = { key, countdown, progress, body, view: null };
}

function update(state) {
  const { room, uid } = state;
  const photos = room.rounds?.[room.meta.round]?.photos ?? {};
  const alive = alivePlayers(room);
  ui.progress.textContent = t('capture.progress', { done: alive.filter(([id]) => photos[id]).length, total: alive.length });

  const me = room.players[uid];
  const view = !me.alive ? 'observer' : photos[uid] ? 'submitted' : 'shooting';
  // 拍照區有相機畫面和預覽，只有換狀態時才重畫
  if (view === 'observer') {
    ui.body.replaceChildren(renderStatusList(room, photos));
  } else if (view !== ui.view) {
    ui.body.replaceChildren(view === 'submitted' ? renderSubmitted(photos[uid]) : createShooter(state));
  }
  ui.view = view;
}

export function render(container, state) {
  // 全部沒交時同一輪會換題重來，用 phaseEndsAt 分辨是不是新的一次
  const key = `${state.room.meta.round}:${state.room.meta.phaseEndsAt}`;
  if (ui?.key !== key) {
    destroy();
    mount(container, state, key);
  }
  update(state);
}

export function destroy() {
  ui?.countdown.destroy();
  ui = null;
}
