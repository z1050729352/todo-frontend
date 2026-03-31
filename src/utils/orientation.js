export function getOrientationFromViewport(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'unknown';
  if (w === h) return 'square';
  return w > h ? 'landscape' : 'portrait';
}

export function getCurrentOrientation() {
  if (typeof window === 'undefined') return 'unknown';
  return getOrientationFromViewport(window.innerWidth, window.innerHeight);
}

export function getOrientationLabel(ori) {
  if (ori === 'portrait') return '竖屏';
  if (ori === 'landscape') return '横屏';
  return '未知';
}

export async function requestBestEffortOrientationLock(target) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  const t = target === 'portrait' ? 'portrait' : 'landscape';
  const orientation = window.screen && window.screen.orientation;
  if (!orientation || typeof orientation.lock !== 'function') return { ok: false, reason: 'no-api' };

  try {
    if (typeof document !== 'undefined' && document.documentElement && !document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {}
      }
    }
    await orientation.lock(t);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'lock-failed') };
  }
}

export function waitForOrientation(target, timeoutMs = 2000) {
  const t = target === 'portrait' ? 'portrait' : 'landscape';
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (getCurrentOrientation() === t) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);
      requestAnimationFrame(check);
    };
    check();
  });
}

