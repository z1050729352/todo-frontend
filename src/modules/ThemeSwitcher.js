export function getLang() {
  if (typeof navigator === 'undefined') return 'en';
  return (navigator.language || 'en').toLowerCase();
}

export function t(key) {
  const lang = getLang();
  const zh = lang.startsWith('zh');
  const map = {
    hardDrop: zh ? '一键降落' : 'Drop',
    holdFastDrop: zh ? '按住速降' : 'Fast',
    theme: zh ? '主题' : 'Theme',
    playerA: zh ? '玩家A' : 'Player A',
    playerB: zh ? '玩家B' : 'Player B',
    next: zh ? '下一个' : 'NEXT'
  };
  return map[key] || key;
}

export function getThemeStorageKey(player) {
  return player === 'A' ? 'tetris_theme_playerA' : 'tetris_theme_playerB';
}

export function computePopoverPosition(triggerRect, popoverSize, viewportPadding = 10) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const width = popoverSize?.width || 240;
  const height = popoverSize?.height || 200;

  let left = triggerRect.left;
  let top = triggerRect.bottom + 8;

  if (left + width + viewportPadding > vw) {
    left = vw - width - viewportPadding;
  }
  if (left < viewportPadding) left = viewportPadding;

  if (top + height + viewportPadding > vh) {
    top = triggerRect.top - height - 8;
  }
  if (top < viewportPadding) top = viewportPadding;

  return { left, top };
}

export function bindClickOutside({ rootEl, getEnabled, onClose }) {
  function handler(e) {
    if (!getEnabled?.()) return;
    if (!rootEl) return;
    if (rootEl.contains(e.target)) return;
    onClose?.();
  }

  window.addEventListener('pointerdown', handler, true);
  return () => window.removeEventListener('pointerdown', handler, true);
}
