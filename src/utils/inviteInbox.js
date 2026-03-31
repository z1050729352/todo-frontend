const STORAGE_KEY = 'invite_inbox_v1';

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function createInviteInbox(storage) {
  const mem = new Map();

  function load() {
    const raw = storage?.getItem ? storage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? safeParse(raw) : null;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    mem.clear();
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const id = String(it.id || '');
      const at = Number(it.at);
      const status = String(it.status || '');
      if (!id || !Number.isFinite(at) || !status) continue;
      mem.set(id, { at, status });
    }
  }

  function persist() {
    if (!storage?.setItem) return;
    const items = Array.from(mem.entries())
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 200)
      .map(([id, v]) => ({ id, at: v.at, status: v.status }));
    storage.setItem(STORAGE_KEY, JSON.stringify({ items }));
  }

  function cleanup(nowMs = Date.now(), ttlMs = 30 * 60 * 1000) {
    let changed = false;
    for (const [id, v] of mem.entries()) {
      if (nowMs - v.at >= ttlMs) {
        mem.delete(id);
        changed = true;
      }
    }
    if (changed) persist();
  }

  function hasHandled(inviteId) {
    const id = String(inviteId || '');
    if (!id) return false;
    return mem.has(id);
  }

  function markHandled(inviteId, status, nowMs = Date.now()) {
    const id = String(inviteId || '');
    const st = String(status || '');
    if (!id || !st) return false;
    mem.set(id, { at: nowMs, status: st });
    persist();
    return true;
  }

  function shouldPrompt(inviteId) {
    cleanup();
    return !hasHandled(inviteId);
  }

  load();
  cleanup();

  return {
    hasHandled,
    markHandled,
    shouldPrompt,
    cleanup
  };
}

export { createInviteInbox };
