// 等待室（SPEC 4.2）
import { h } from '../utils/dom.js';
import { t } from '../utils/i18n.js';
import { addPrompt, kickPlayer, removePrompt, updateSettings } from '../firebase.js';
import { showToast } from '../components/toast.js';
import {
  CAPTURE_SEC_OPTIONS,
  MAX_PLAYERS,
  MAX_PROMPTS_PER_PLAYER,
  PROMPT_MAX_LENGTH,
  VOTE_SEC_OPTIONS,
} from '../rules.js';

function showError(code) {
  showToast(t(`errors.${code}`), { tone: 'error' });
}

// 寫入失敗多半是網路問題；錯誤代碼由呼叫端自己顯示
async function attempt(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    showError('network');
  }
}

// 已經出現過的玩家，只有新加入的人才播進場動畫（名單每次更新都會重畫）
let seenPlayers = new Set();

function sortedPlayers(players) {
  return Object.entries(players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
}

function renderPlayers(state, isHost) {
  const { room, uid, code } = state;
  return sortedPlayers(room.players).map(([id, player]) => {
    const isNew = !seenPlayers.has(id);
    seenPlayers.add(id);
    const classes = ['lobby-player', isNew && 'lobby-player--new', !player.online && 'lobby-player--offline'];
    return h(
      'li',
      { class: classes.filter(Boolean).join(' ') },
      h('span', { class: 'lobby-player-name' }, player.name),
      id === room.meta.hostId ? h('span', { class: 'badge' }, t('lobby.host')) : null,
      id === uid ? h('span', { class: 'badge badge--plain' }, t('lobby.you')) : null,
      player.online ? null : h('span', { class: 'lobby-player-status' }, t('lobby.offline')),
      isHost && id !== uid
        ? h(
            'button',
            {
              class: 'button button--icon lobby-kick',
              type: 'button',
              'aria-label': t('lobby.kick', { name: player.name }),
              onclick: () => {
                if (confirm(t('lobby.kickConfirm', { name: player.name }))) attempt(() => kickPlayer(code, id));
              },
            },
            '×',
          )
        : null,
    );
  });
}

// 一般玩家只看得到自己的題目；房主看得到全部，也可以刪（SPEC 3.4）
function renderPrompts(state, isHost) {
  const { room, uid, code } = state;
  const entries = Object.entries(room.customPrompts ?? {}).filter(([, p]) => isHost || p.authorId === uid);
  if (entries.length === 0) return [h('li', { class: 'lobby-prompt-empty' }, t('lobby.noPrompts'))];
  return entries.map(([id, prompt]) => {
    const author = room.players?.[prompt.authorId]?.name;
    return h(
      'li',
      { class: 'lobby-prompt' },
      h(
        'div',
        { class: 'lobby-prompt-body' },
        h('span', { class: 'lobby-prompt-text' }, prompt.text),
        isHost && prompt.authorId !== uid && author ? h('span', { class: 'lobby-prompt-author' }, t('lobby.promptAuthor', { name: author })) : null,
      ),
      h(
        'button',
        {
          class: 'button button--icon',
          type: 'button',
          'aria-label': t('lobby.deletePrompt'),
          onclick: () => attempt(() => removePrompt(code, id)),
        },
        '×',
      ),
    );
  });
}

function settingRow(label, hint, options, current, format, onPick, editable) {
  const control = editable
    ? h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': label },
        options.map((value) =>
          h(
            'button',
            {
              class: 'segmented-option',
              type: 'button',
              'aria-pressed': String(value === current),
              onclick: () => value !== current && onPick(value),
            },
            format(value),
          ),
        ),
      )
    : h('span', { class: 'lobby-setting-value' }, format(current));
  return h(
    'div',
    { class: 'lobby-setting' },
    h('div', {}, h('p', { class: 'field-label' }, label), hint ? h('p', { class: 'card-hint' }, hint) : null),
    control,
  );
}

function renderSettings(state, isHost) {
  const { settings } = state.room.meta;
  const save = (changes) => attempt(() => updateSettings(state.code, changes));
  const seconds = (n) => t('lobby.seconds', { n });
  return [
    settingRow(t('lobby.captureSec'), null, CAPTURE_SEC_OPTIONS, settings.captureSec, seconds, (captureSec) => save({ captureSec }), isHost),
    settingRow(t('lobby.voteSec'), null, VOTE_SEC_OPTIONS, settings.voteSec, seconds, (voteSec) => save({ voteSec }), isHost),
    settingRow(
      t('lobby.customOnly'),
      t('lobby.customOnlyHint'),
      [true, false],
      settings.customOnly,
      (on) => t(on ? 'lobby.on' : 'lobby.off'),
      (customOnly) => save({ customOnly }),
      isHost,
    ),
  ];
}

function mount(container, state) {
  const promptInput = h('input', {
    class: 'input',
    maxlength: PROMPT_MAX_LENGTH,
    enterkeyhint: 'done',
    placeholder: t('lobby.promptPlaceholder'),
    'aria-label': t('lobby.prompts'),
  });
  const addButton = h('button', { class: 'button', type: 'submit' }, t('lobby.addPrompt'));
  let adding = false;

  async function onAddPrompt(event) {
    event.preventDefault();
    if (adding) return;
    adding = true;
    await attempt(async () => {
      const error = await addPrompt(state.code, promptInput.value, state.room.customPrompts);
      if (error) return showError(error);
      promptInput.value = '';
    });
    adding = false;
  }

  const refs = {
    playersTitle: h('h2', { class: 'card-title' }),
    playerList: h('ul', { class: 'lobby-player-list' }),
    promptsHint: h('p', { class: 'card-hint' }),
    promptList: h('ul', { class: 'lobby-prompt-list' }),
    promptCount: h('p', { class: 'lobby-prompt-count' }),
    settingsHint: h('p', { class: 'card-hint' }),
    settingsBody: h('div', { class: 'lobby-settings-body' }),
    footer: h('footer', { class: 'lobby-footer' }),
    promptInput,
    addButton,
  };

  const root = h(
    'section',
    { class: 'lobby' },
    h(
      'header',
      { class: 'lobby-header' },
      h('p', { class: 'lobby-code-label' }, t('lobby.roomCode')),
      h('p', { class: 'lobby-code' }, state.code),
      h('p', { class: 'lobby-share-hint' }, t('lobby.shareHint')),
    ),
    h('section', { class: 'card lobby-section' }, refs.playersTitle, refs.playerList),
    h(
      'section',
      { class: 'card lobby-section' },
      h('h2', { class: 'card-title' }, t('lobby.prompts')),
      refs.promptsHint,
      h('form', { class: 'input-row', onsubmit: onAddPrompt }, promptInput, addButton),
      refs.promptList,
      refs.promptCount,
    ),
    h('section', { class: 'card lobby-section' }, h('h2', { class: 'card-title' }, t('lobby.settings')), refs.settingsHint, refs.settingsBody),
    refs.footer,
  );
  container.append(root);
  return refs;
}

function update(refs, state) {
  const { room, uid } = state;
  const isHost = room.meta.hostId === uid;
  const playerCount = Object.keys(room.players ?? {}).length;
  const myPromptCount = Object.values(room.customPrompts ?? {}).filter((p) => p.authorId === uid).length;

  refs.playersTitle.textContent = t('lobby.players', { count: playerCount, max: MAX_PLAYERS });
  refs.playerList.replaceChildren(...renderPlayers(state, isHost));

  refs.promptsHint.textContent = t(isHost ? 'lobby.promptsHintHost' : 'lobby.promptsHint');
  refs.promptList.replaceChildren(...renderPrompts(state, isHost));
  refs.promptCount.textContent = t('lobby.promptCount', {
    custom: Object.keys(room.customPrompts ?? {}).length,
    builtin: state.builtinPrompts.length,
  });
  const full = myPromptCount >= MAX_PROMPTS_PER_PLAYER;
  refs.promptInput.disabled = full;
  refs.addButton.disabled = full;
  refs.promptInput.placeholder = full ? t('errors.promptLimit') : t('lobby.promptPlaceholder');

  refs.settingsHint.hidden = isHost;
  refs.settingsHint.textContent = t('lobby.settingsHintGuest');
  refs.settingsBody.replaceChildren(...renderSettings(state, isHost));

  refs.footer.replaceChildren(
    isHost
      ? h(
          'button',
          {
            class: 'button button--primary button--block',
            type: 'button',
            onclick: (e) => {
              const button = e.currentTarget;
              button.disabled = true;
              attempt(async () => {
                const error = await state.actions.startGame();
                if (error) showError(error);
              }).finally(() => (button.disabled = false));
            },
          },
          t('lobby.start'),
        )
      : h('p', { class: 'lobby-wait' }, t('lobby.waitHost')),
  );
}

let refs = null;

export function render(container, state) {
  if (!refs) refs = mount(container, state);
  update(refs, state);
}

export function destroy() {
  refs = null;
  seenPlayers = new Set();
}
