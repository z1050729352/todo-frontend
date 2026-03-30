<template>
  <div class="toast-container">
    <Transition name="toast">
      <div v-if="activeToast" :key="activeToast.id" class="toast" :class="`toast-${activeToast.type}`">
        <span class="toast-icon">{{ getIcon(activeToast.type) }}</span>
        <span class="toast-message">{{ activeToast.message }}</span>
        <button class="toast-close" @click="closeToast">×</button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { activeToast, closeToast } from '../utils/toast';

const getIcon = (type) => {
  switch(type) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    default: return 'ℹ️';
  }
};
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  border-radius: 8px;
  background: rgba(30, 30, 30, 0.95);
  color: white;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  min-width: 200px;
  justify-content: center;
  font-size: 15px;
  font-weight: 500;
  pointer-events: auto;
  max-width: min(92vw, 520px);
}

.toast-icon {
  font-size: 18px;
}

.toast-message {
  flex: 1;
}

.toast-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
  line-height: 1;
  font-size: 16px;
}

.toast-success { border-left: 4px solid #4caf50; }
.toast-error { border-left: 4px solid #f44336; }
.toast-warning { border-left: 4px solid #ff9800; }
.toast-info { border-left: 4px solid #2196f3; }

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}
</style>
