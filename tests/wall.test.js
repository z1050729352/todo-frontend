import test from 'node:test';
import assert from 'node:assert/strict';

import { applyWallPickup, consumeWallOnCross } from '../src/modules/wall.js';

test('wall pickup always refreshes to 4 and never exceeds 4', () => {
  let c = 0;
  for (let i = 0; i < 6; i++) {
    c = applyWallPickup(4);
    assert.ok(c <= 4);
    assert.equal(c, 4);
  }
});

test('wall consumes on 1/2/4 crossings and then stops consuming', () => {
  let state = { wallCount: 1 };
  let r = consumeWallOnCross(state);
  assert.equal(r.consumed, true);
  assert.equal(r.wallCount, 0);

  state = { wallCount: 2 };
  r = consumeWallOnCross(state);
  assert.equal(r.consumed, true);
  assert.equal(r.wallCount, 1);
  r = consumeWallOnCross(r);
  assert.equal(r.consumed, true);
  assert.equal(r.wallCount, 0);

  state = { wallCount: 4 };
  for (let i = 0; i < 4; i++) {
    state = consumeWallOnCross(state);
    assert.equal(state.consumed, true);
  }
  assert.equal(state.wallCount, 0);
  const last = consumeWallOnCross(state);
  assert.equal(last.consumed, false);
  assert.equal(last.wallCount, 0);
});

test('wall prevents score and health penalties while active', () => {
  let score = 100;
  let health = 50;
  let wallCount = 2;

  for (let i = 0; i < 2; i++) {
    const res = consumeWallOnCross({ wallCount });
    if (res.consumed) {
      assert.equal(score, 100);
      assert.equal(health, 50);
      wallCount = res.wallCount;
    }
  }

  const res = consumeWallOnCross({ wallCount });
  assert.equal(res.consumed, false);
});
