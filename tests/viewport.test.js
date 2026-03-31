import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, computeViewport, clampInWorld } from '../src/utils/viewport.js';

const DEVICES = [
  { name: 'iPhone 13 landscape', w: 844, h: 390 },
  { name: 'iPhone 8 landscape', w: 667, h: 375 },
  { name: 'iPad 11 landscape', w: 1194, h: 834 },
  { name: 'Android 1080x2400 portrait', w: 1080, h: 2400 },
  { name: 'Android 720x1600 portrait', w: 720, h: 1600 }
];

test('computeViewport uses min scale and never exceeds device bounds', () => {
  for (const d of DEVICES) {
    const vp = computeViewport(d.w, d.h);
    assert.ok(vp.scale > 0, d.name);
    assert.ok(vp.viewWidth <= d.w + 1e-6, d.name);
    assert.ok(vp.viewHeight <= d.h + 1e-6, d.name);
    assert.ok(vp.offsetX >= -1e-6, d.name);
    assert.ok(vp.offsetY >= -1e-6, d.name);
  }
});

test('world bounds clamp keeps objects inside 844x390 logical frame', () => {
  const p1 = clampInWorld(-100, -100, 20, 30);
  assert.equal(p1.x, 20);
  assert.equal(p1.y, 30);

  const p2 = clampInWorld(LOGICAL_WIDTH + 100, LOGICAL_HEIGHT + 100, 20, 30);
  assert.equal(p2.x, LOGICAL_WIDTH - 20);
  assert.equal(p2.y, LOGICAL_HEIGHT - 30);
});

test('all devices can display full logical frame without cropping', () => {
  for (const d of DEVICES) {
    const vp = computeViewport(d.w, d.h);
    const left = vp.offsetX;
    const top = vp.offsetY;
    const right = vp.offsetX + vp.viewWidth;
    const bottom = vp.offsetY + vp.viewHeight;
    assert.ok(left >= -1e-6, d.name);
    assert.ok(top >= -1e-6, d.name);
    assert.ok(right <= d.w + 1e-6, d.name);
    assert.ok(bottom <= d.h + 1e-6, d.name);
  }
});
