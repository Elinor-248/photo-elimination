import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../js/utils/i18n.js';

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? jsFiles(join(dir, entry.name)) : entry.name.endsWith('.js') ? [join(dir, entry.name)] : [],
  );
}

test('佔位符會被替換，沒給的保留原樣', () => {
  assert.equal(t('lobby.players', { count: 3, max: 12 }), '玩家 3 / 12');
  assert.equal(t('lobby.players', { count: 3 }), '玩家 3 / {max}');
});

test('找不到的 key 回傳 key 本身', () => {
  assert.equal(t('nope.missing'), 'nope.missing');
});

test('程式碼裡用到的 t() key 都有對應的文字', () => {
  const missing = [];
  for (const file of jsFiles('js')) {
    for (const [, key] of readFileSync(file, 'utf8').matchAll(/\bt\('([\w.]+)'/g)) {
      if (t(key) === key) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('rules.js 和 firebase.js 回傳的錯誤代碼都有對應的提示', () => {
  const codes = ['notFound', 'full', 'started', 'nameTaken', 'nameEmpty', 'nameTooLong', 'createFailed', 'promptEmpty', 'promptTooLong', 'promptLimit', 'notEnoughPlayers'];
  for (const code of codes) assert.notEqual(t(`errors.${code}`), `errors.${code}`, code);
});
