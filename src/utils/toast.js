import { ref } from 'vue';

export const activeToast = ref(null);

const queue = [];
let toastId = 0;
let timer = null;

function showNextToast() {
  if (activeToast.value || queue.length === 0) return;
  activeToast.value = queue.shift();
  timer = setTimeout(() => {
    closeToast();
  }, activeToast.value.duration);
}

export function showToast(message, type = 'info', duration = 3000) {
  queue.push({
    id: toastId++,
    message,
    type,
    duration: Math.max(1200, duration)
  });
  showNextToast();
}

export function closeToast() {
  if (!activeToast.value) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  activeToast.value = null;
  setTimeout(() => {
    showNextToast();
  }, 220);
}
