function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

export function playLowWhoosh({ audioContext, volume = 0.5, frequency = 140, durationMs = 60 }) {
  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(Math.max(0, volume) * 0.8, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + durationMs / 1000);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + durationMs / 1000);
}

export function bindHoldFastDropButton(buttonEl, {
  onHoldStart,
  onHoldEnd,
  ensureAudio,
  getAudioContext,
  getVolume,
  isMuted,
  pressedClass = 'is-pressed',
  pressFeedbackDelayMs = 120,
  releaseResetMs = 80,
  vibrateMs = 20,
  frequency = 140,
  durationMs = 60
}) {
  if (!buttonEl) return () => {};

  let holding = false;
  let pressTimer = null;
  let releaseTimer = null;

  function clearTimers() {
    if (pressTimer) clearTimeout(pressTimer);
    if (releaseTimer) clearTimeout(releaseTimer);
    pressTimer = null;
    releaseTimer = null;
  }

  function setPressed(val) {
    if (val) buttonEl.classList.add(pressedClass);
    else buttonEl.classList.remove(pressedClass);
  }

  function startHold() {
    if (holding) return;
    holding = true;
    clearTimers();
    pressTimer = setTimeout(() => {
      setPressed(true);
    }, Math.max(0, pressFeedbackDelayMs));

    try {
      if (navigator.vibrate) navigator.vibrate(vibrateMs);
    } catch {}

    try {
      ensureAudio?.();
      const ctx = getAudioContext?.();
      const muted = isMuted?.();
      if (!muted && ctx) {
        playLowWhoosh({
          audioContext: ctx,
          volume: typeof getVolume === 'function' ? getVolume() : 0.5,
          frequency,
          durationMs
        });
      }
    } catch {}

    onHoldStart?.({ ts: nowMs() });
  }

  function endHold() {
    if (!holding) return;
    holding = false;
    clearTimers();
    releaseTimer = setTimeout(() => {
      setPressed(false);
    }, Math.max(0, releaseResetMs));
    onHoldEnd?.({ ts: nowMs() });
  }

  function onTouchStart(e) {
    e.preventDefault();
    e.stopPropagation();
    startHold();
  }

  function onTouchEnd(e) {
    e.preventDefault();
    e.stopPropagation();
    endHold();
  }

  function onTouchCancel(e) {
    e.preventDefault();
    e.stopPropagation();
    endHold();
  }

  function onMouseDown(e) {
    e.preventDefault();
    startHold();
  }

  function onMouseUp(e) {
    e.preventDefault();
    endHold();
  }

  function onMouseLeave() {
    endHold();
  }

  buttonEl.addEventListener('touchstart', onTouchStart, { passive: false });
  buttonEl.addEventListener('touchend', onTouchEnd, { passive: false });
  buttonEl.addEventListener('touchcancel', onTouchCancel, { passive: false });
  buttonEl.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  buttonEl.addEventListener('mouseleave', onMouseLeave);

  return () => {
    clearTimers();
    buttonEl.removeEventListener('touchstart', onTouchStart);
    buttonEl.removeEventListener('touchend', onTouchEnd);
    buttonEl.removeEventListener('touchcancel', onTouchCancel);
    buttonEl.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    buttonEl.removeEventListener('mouseleave', onMouseLeave);
  };
}

