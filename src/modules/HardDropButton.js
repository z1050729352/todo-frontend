function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

export function playWhoosh({ audioContext, volume = 0.6, frequency = 800, durationMs = 200 }) {
  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(Math.max(0, volume), audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + durationMs / 1000);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + durationMs / 1000);
}

export function computeHardDropY(board, piece, collideFn) {
  let y = piece.y;
  while (true) {
    const nextY = y + 1;
    const nextPiece = { ...piece, y: nextY };
    if (collideFn(board, nextPiece)) return y;
    y = nextY;
  }
}

export function bindHardDropButton(buttonEl, {
  onHardDrop,
  ensureAudio,
  getAudioContext,
  getVolume,
  isMuted,
  disabledMs = 200,
  pressedClass = 'is-pressed',
  frequency = 800,
  durationMs = 200
}) {
  if (!buttonEl) return () => {};

  let disabledUntil = 0;

  function canTrigger() {
    if (buttonEl.disabled) return false;
    return nowMs() >= disabledUntil;
  }

  function setPressed(val) {
    if (val) buttonEl.classList.add(pressedClass);
    else buttonEl.classList.remove(pressedClass);
  }

  function trigger() {
    if (!canTrigger()) return;
    disabledUntil = nowMs() + disabledMs;
    buttonEl.disabled = true;
    requestAnimationFrame(() => {
      onHardDrop?.();
    });

    try {
      ensureAudio?.();
      const ctx = getAudioContext?.();
      const muted = isMuted?.();
      if (!muted && ctx) {
        playWhoosh({
          audioContext: ctx,
          volume: typeof getVolume === 'function' ? getVolume() : 0.6,
          frequency,
          durationMs
        });
      }
    } catch {}

    setTimeout(() => {
      buttonEl.disabled = false;
    }, disabledMs);
  }

  function onTouchStart(e) {
    e.preventDefault();
    e.stopPropagation();
    setPressed(true);
  }

  function onTouchEnd(e) {
    e.preventDefault();
    e.stopPropagation();
    setPressed(false);
    trigger();
  }

  function onTouchCancel(e) {
    e.preventDefault();
    e.stopPropagation();
    setPressed(false);
  }

  function onMouseDown() {
    setPressed(true);
  }

  function onMouseUp() {
    setPressed(false);
  }

  function onMouseLeave() {
    setPressed(false);
  }

  function onClick(e) {
    e.preventDefault();
    trigger();
  }

  buttonEl.addEventListener('touchstart', onTouchStart, { passive: false });
  buttonEl.addEventListener('touchend', onTouchEnd, { passive: false });
  buttonEl.addEventListener('touchcancel', onTouchCancel, { passive: false });
  buttonEl.addEventListener('mousedown', onMouseDown);
  buttonEl.addEventListener('mouseup', onMouseUp);
  buttonEl.addEventListener('mouseleave', onMouseLeave);
  buttonEl.addEventListener('click', onClick);

  return () => {
    buttonEl.removeEventListener('touchstart', onTouchStart);
    buttonEl.removeEventListener('touchend', onTouchEnd);
    buttonEl.removeEventListener('touchcancel', onTouchCancel);
    buttonEl.removeEventListener('mousedown', onMouseDown);
    buttonEl.removeEventListener('mouseup', onMouseUp);
    buttonEl.removeEventListener('mouseleave', onMouseLeave);
    buttonEl.removeEventListener('click', onClick);
  };
}
