import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSoloWorldSize } from '../src/utils/soloCanvas.js';

function ratio(w, h) {
  return Number(h) / Number(w);
}

test('solo world size matches device aspect ratio (iPhone-like)', () => {
  const dw = 390;
  const dh = 844;
  const { worldWidth, worldHeight } = computeSoloWorldSize(dw, dh);
  assert.equal(worldWidth, 390);
  const r1 = ratio(dw, dh);
  const r2 = ratio(worldWidth, worldHeight);
  assert.ok(Math.abs(r1 - r2) < 0.02);
});

test('solo world size matches device aspect ratio (Android-like)', () => {
  const dw = 360;
  const dh = 800;
  const { worldWidth, worldHeight } = computeSoloWorldSize(dw, dh);
  assert.equal(worldWidth, 390);
  const r1 = ratio(dw, dh);
  const r2 = ratio(worldWidth, worldHeight);
  assert.ok(Math.abs(r1 - r2) < 0.02);
});

test('solo world size matches device aspect ratio (large Android portrait)', () => {
  const dw = 412;
  const dh = 915;
  const { worldWidth, worldHeight } = computeSoloWorldSize(dw, dh);
  assert.equal(worldWidth, 390);
  const r1 = ratio(dw, dh);
  const r2 = ratio(worldWidth, worldHeight);
  assert.ok(Math.abs(r1 - r2) < 0.02);
});

