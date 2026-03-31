import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, updatePlayerHUD } from '../src/state/gameState.js';

test('updatePlayerHUD patches player state', () => {
  updatePlayerHUD(1, { score: 123, bulletType: 'laser', bulletLevel: 2, health: 88 });
  assert.equal(GameState.player1.score, 123);
  assert.equal(GameState.player1.bulletType, 'laser');
  assert.equal(GameState.player1.bulletLevel, 2);
  assert.equal(GameState.player1.health, 88);
});

