import { computed, ref } from 'vue';

const loadingCount = ref(0);

export const isLoading = computed(() => loadingCount.value > 0);

export function beginLoading() {
  loadingCount.value += 1;
}

export function endLoading() {
  loadingCount.value = Math.max(0, loadingCount.value - 1);
}

export function resetLoading() {
  loadingCount.value = 0;
}

