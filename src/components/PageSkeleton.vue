<script setup lang="ts">
/**
 * 通用页面骨架屏.
 * @example
 *   <PageSkeleton :rows="6" :show-header="true" />
 */
withDefaults(
  defineProps<{
    rows?: number;
    showHeader?: boolean;
    showFilters?: boolean;
  }>(),
  { rows: 4, showHeader: true, showFilters: false },
);
</script>

<template>
  <div class="cx-skeleton" aria-busy="true" aria-live="polite">
    <div v-if="showHeader" class="skeleton skeleton--title" />
    <div v-if="showFilters" class="skeleton skeleton--filters">
      <span class="block" v-for="i in 4" :key="i" />
    </div>
    <div class="skeleton-list">
      <div v-for="i in rows" :key="i" class="skeleton-row">
        <span class="block block--thumb" />
        <div class="block-stack">
          <span class="block block--text-lg" />
          <span class="block block--text" />
          <span class="block block--text-sm" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cx-skeleton {
  width: 100%;
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: var(--cx-radius-md);
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton--title {
  height: 32px;
  width: 240px;
  margin-bottom: var(--cx-space-6);
}

.skeleton--filters {
  display: flex;
  gap: var(--cx-space-3);
  margin-bottom: var(--cx-space-5);
  .block {
    height: 36px;
    width: 120px;
    border-radius: var(--cx-radius-sm);
  }
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-3);
}

.skeleton-row {
  display: flex;
  gap: var(--cx-space-4);
  padding: var(--cx-space-4);
  background: var(--cx-bg-card);
  border: 1px solid var(--cx-border);
  border-radius: var(--cx-radius-lg);
}

.block {
  display: block;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: var(--cx-radius-sm);
}

.block--thumb {
  width: 64px;
  height: 64px;
  border-radius: var(--cx-radius-md);
  flex-shrink: 0;
}

.block-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
}

.block--text-lg {
  height: 18px;
  width: 60%;
}

.block--text {
  height: 14px;
  width: 80%;
}

.block--text-sm {
  height: 12px;
  width: 40%;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton,
  .block {
    animation: none;
  }
}
</style>
