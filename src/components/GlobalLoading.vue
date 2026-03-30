<template>
  <Transition name="global-loading">
    <div v-if="isLoading" class="global-loading" aria-busy="true">
      <div class="global-loading-bar">
        <div class="global-loading-bar-inner"></div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { isLoading } from '../utils/loading';
</script>

<style scoped>
.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9998;
  pointer-events: none;
  padding-top: var(--safe-area-top, 0px);
}

.global-loading-bar {
  height: 3px;
  width: 100%;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.global-loading-bar-inner {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, rgba(33, 150, 243, 0), rgba(33, 150, 243, 0.95), rgba(33, 150, 243, 0));
  animation: global-loading-move 1s ease-in-out infinite;
}

@keyframes global-loading-move {
  0% { transform: translateX(-60%); }
  100% { transform: translateX(260%); }
}

.global-loading-enter-active,
.global-loading-leave-active {
  transition: opacity 0.18s ease;
}

.global-loading-enter-from,
.global-loading-leave-to {
  opacity: 0;
}
</style>

