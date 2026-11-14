import text from '../../i18n/zh-TW.js';

// t('lobby.players', { count: 3 }) → 「玩家 3 / 12」。找不到 key 時回傳 key 本身，方便發現漏掉的文字。
export function t(key, vars = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], text);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}
