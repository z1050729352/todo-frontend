import test from 'node:test';
import assert from 'node:assert/strict';
import { createInviteInbox } from '../src/utils/inviteInbox.js';

function createMemStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); }
  };
}

test('inviteInbox persists handled invites and suppresses prompts', () => {
  const storage = createMemStorage();
  const inbox1 = createInviteInbox(storage);
  const now = Date.now();
  assert.equal(inbox1.shouldPrompt('inv1'), true);
  inbox1.markHandled('inv1', 'accepted', now);

  const inbox2 = createInviteInbox(storage);
  assert.equal(inbox2.shouldPrompt('inv1'), false);
  assert.equal(inbox2.hasHandled('inv1'), true);
});

test('inviteInbox cleanup removes expired entries', () => {
  const storage = createMemStorage();
  const inbox = createInviteInbox(storage);
  inbox.markHandled('inv2', 'rejected', 1000);
  inbox.cleanup(1000 + 31 * 60 * 1000, 30 * 60 * 1000);
  assert.equal(inbox.hasHandled('inv2'), false);
});
