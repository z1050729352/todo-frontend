import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrientationFromViewport, getOrientationLabel } from '../src/utils/orientation.js';

test('getOrientationFromViewport detects portrait/landscape', () => {
  assert.equal(getOrientationFromViewport(100, 200), 'portrait');
  assert.equal(getOrientationFromViewport(200, 100), 'landscape');
  assert.equal(getOrientationFromViewport(100, 100), 'square');
});

test('getOrientationLabel returns readable text', () => {
  assert.equal(getOrientationLabel('portrait'), '竖屏');
  assert.equal(getOrientationLabel('landscape'), '横屏');
  assert.equal(getOrientationLabel('unknown'), '未知');
});

