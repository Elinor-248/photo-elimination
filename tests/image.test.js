import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPRESS_STEPS, compress, cropRect, outputSize } from '../js/utils/image.js';
import { MAX_PHOTO_CHARS } from '../js/config.js';

test('橫式畫面：裁掉左右，保留中間 3:4', () => {
  assert.deepEqual(cropRect(1920, 1080), { sx: 555, sy: 0, sw: 810, sh: 1080 });
});

test('比 3:4 更長的直式畫面：裁掉上下', () => {
  assert.deepEqual(cropRect(1080, 1920), { sx: 0, sy: 240, sw: 1080, sh: 1440 });
});

test('剛好 3:4：不用裁', () => {
  assert.deepEqual(cropRect(600, 800), { sx: 0, sy: 0, sw: 600, sh: 800 });
});

test('輸出尺寸：長邊 800 → 600 × 800', () => {
  assert.deepEqual(outputSize(800), { width: 600, height: 800 });
  assert.deepEqual(outputSize(600), { width: 450, height: 600 });
});

test('第一次就在上限內：直接用，不重試', () => {
  const tried = [];
  const result = compress((step) => (tried.push(step), 'x'.repeat(100)));
  assert.equal(result.length, 100);
  assert.equal(tried.length, 1);
  assert.deepEqual(tried[0], { longEdge: 800, quality: 0.7 });
});

test('太大時依序降品質、再縮小尺寸', () => {
  const tried = [];
  const sizes = [MAX_PHOTO_CHARS + 1, MAX_PHOTO_CHARS + 1, MAX_PHOTO_CHARS + 1, MAX_PHOTO_CHARS];
  const result = compress((step) => 'x'.repeat(sizes[tried.push(step) - 1]));
  assert.equal(result.length, MAX_PHOTO_CHARS);
  assert.deepEqual(tried, COMPRESS_STEPS);
});

test('全部都太大：回傳 null', () => {
  assert.equal(compress(() => 'x'.repeat(MAX_PHOTO_CHARS + 1)), null);
});
