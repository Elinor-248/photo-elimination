// 首頁（SPEC 4.1）
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { isInAppBrowser, loadNickname, saveNickname } from '../utils/browser.js';
import { isRoomCode } from '../utils/room-code.js';
import { createRoom, joinRoom } from '../firebase.js';
import { showToast } from '../components/toast.js';
import { NAME_MAX_LENGTH } from '../rules.js';

let view = null;

function showError(code) {
  showToast(t(`errors.${code}`), { tone: 'error' });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    showToast(t('home.copied'));
  } catch {
    showError('copyFailed');
  }
}

function inAppWarning() {
  return h(
    'section',
    { class: 'card home-warning', role: 'alert' },
    h('p', { class: 'home-warning-title' }, t('home.inAppBrowser')),
    h('p', { class: 'card-hint' }, t('home.inAppBrowserHint')),
    h('button', { class: 'button', type: 'button', onclick: copyLink }, t('home.copyLink')),
  );
}

export function render(container, state) {
  if (view) return;
  const buttons = [];
  let busy = false;

  // 送出期間鎖住所有按鈕，避免連點建出兩個房間
  async function submit(action) {
    if (busy) return;
    busy = true;
    buttons.forEach((b) => (b.disabled = true));
    try {
      await action();
    } catch (error) {
      console.error(error);
      showError('network');
    } finally {
      busy = false;
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  const nameInput = h('input', {
    class: 'input',
    id: 'home-name',
    maxlength: NAME_MAX_LENGTH,
    autocomplete: 'nickname',
    enterkeyhint: 'done',
    placeholder: t('home.namePlaceholder'),
    value: loadNickname(),
  });

  const roomInput = h('input', {
    class: 'input home-room-input',
    id: 'home-room',
    inputmode: 'numeric',
    maxlength: 4,
    autocomplete: 'off',
    placeholder: t('home.roomPlaceholder'),
  });

  function readName() {
    const name = nameInput.value.trim();
    saveNickname(name);
    return name;
  }

  function onCreate() {
    submit(async () => {
      const { code, error } = await createRoom(readName());
      if (error) return showError(error);
      await state.actions.enterRoom(code);
    });
  }

  function onJoin(code) {
    submit(async () => {
      if (!isRoomCode(code)) return showError('roomCodeInvalid');
      const error = await joinRoom(code, readName());
      if (error) return showError(error);
      await state.actions.enterRoom(code);
    });
  }

  const nameField = h(
    'div',
    { class: 'field' },
    h('label', { class: 'field-label', for: 'home-name' }, t('home.nameLabel')),
    nameInput,
  );

  function onConnectScreen(code) {
    submit(async () => {
      if (!isRoomCode(code)) return showError('roomCodeInvalid');
      const error = await state.actions.connectScreen(code);
      if (error) showError(error);
    });
  }

  let actions;
  let footer = null;
  if (state.screenMode) {
    // 大螢幕模式：不用暱稱，只要房號（SPEC 4.9）
    const connect = h('button', { class: 'button button--primary button--block', type: 'submit' }, t('home.connectScreen'));
    const back = h('button', { class: 'home-link', type: 'button', onclick: () => state.actions.setScreenMode(false) }, t('home.backToPlayer'));
    buttons.push(connect, back);
    if (state.prefillRoom) roomInput.value = state.prefillRoom;
    actions = h(
      'form',
      { class: 'card home-card', onsubmit: (e) => (e.preventDefault(), onConnectScreen(roomInput.value.trim())) },
      h('h2', { class: 'card-title' }, t('home.screenTitle')),
      h('p', { class: 'card-hint' }, t('home.screenHint')),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'home-room' }, t('home.roomLabel')), roomInput),
      connect,
      back,
    );
  } else if (state.prefillRoom) {
    // 從別人分享的連結進來：只留暱稱和加入
    const join = h('button', { class: 'button button--primary button--block', type: 'submit' }, t('home.joinRoomNumber', { code: state.prefillRoom }));
    const other = h('button', { class: 'home-link', type: 'button', onclick: () => state.actions.clearPrefill() }, t('home.otherRoom'));
    buttons.push(join, other);
    actions = h(
      'form',
      { class: 'card home-card', onsubmit: (e) => (e.preventDefault(), onJoin(state.prefillRoom)) },
      nameField,
      join,
      other,
    );
  } else {
    const create = h('button', { class: 'button button--primary button--block', type: 'button', onclick: onCreate }, t('home.createRoom'));
    const join = h('button', { class: 'button', type: 'submit' }, t('home.joinRoom'));
    buttons.push(create, join);
    actions = h(
      'div',
      { class: 'card home-card' },
      nameField,
      create,
      h('p', { class: 'home-divider' }, t('home.or')),
      h(
        'form',
        { class: 'field', onsubmit: (e) => (e.preventDefault(), onJoin(roomInput.value.trim())) },
        h('label', { class: 'field-label', for: 'home-room' }, t('home.roomLabel')),
        h('div', { class: 'input-row' }, roomInput, join),
      ),
    );
    const screen = h('button', { class: 'home-link', type: 'button', onclick: () => state.actions.setScreenMode(true) }, t('home.screenMode'));
    buttons.push(screen);
    footer = screen;
  }

  view = h(
    'section',
    { class: 'home' },
    h('header', { class: 'home-header' }, h('h1', { class: 'home-title' }, t('app.title')), h('p', { class: 'home-tagline' }, t('app.tagline'))),
    isInAppBrowser() ? inAppWarning() : null,
    actions,
    footer,
  );
  container.append(view);
}

export function destroy() {
  view = null;
}
