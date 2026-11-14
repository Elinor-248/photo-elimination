import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInAppBrowser } from '../js/utils/browser.js';

test('LINE、Instagram、Facebook 的內建瀏覽器要提示', () => {
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0'), true);
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0'), true);
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0]'), true);
});

test('Safari、Chrome 不提示', () => {
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), false);
  assert.equal(isInAppBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'), false);
});
