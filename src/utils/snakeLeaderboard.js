const STORAGE_KEY = 'snake_leaderboard_v1';

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadSnakeLeaderboard() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      id: String(x.id || ''),
      name: String(x.name || ''),
      score: Number.isFinite(Number(x.score)) ? Number(x.score) : 0,
      durationMs: Number.isFinite(Number(x.durationMs)) ? Number(x.durationMs) : 0,
      victory: Boolean(x.victory),
      difficulty: String(x.difficulty || 'medium'),
      ts: Number.isFinite(Number(x.ts)) ? Number(x.ts) : Date.now()
    }))
    .filter((x) => x.id && x.name);
}

export function saveSnakeRecord({ name, score, durationMs, victory, difficulty }) {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const list = loadSnakeLeaderboard();
  const entry = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: String(name || '玩家'),
    score: Number.isFinite(Number(score)) ? Number(score) : 0,
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : 0,
    victory: Boolean(victory),
    difficulty: String(difficulty || 'medium'),
    ts: Date.now()
  };
  const next = [entry, ...list];
  next.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.durationMs !== a.durationMs) return b.durationMs - a.durationMs;
    return b.ts - a.ts;
  });
  const trimmed = next.slice(0, 100);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearSnakeLeaderboard() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return `${mm}:${ss}`;
}

