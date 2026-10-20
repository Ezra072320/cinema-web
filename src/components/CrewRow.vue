<script setup lang="ts">
/**
 * 演职单行: 用于"导演"/"编剧"等一行多人的场景.
 *
 * props:
 *  - label: '导演' | '编剧' | ...
 *  - names: 名字字符串数组
 */
defineProps<{ label: string; names: string[] }>();
</script>

<template>
  <div v-if="names?.length" class="crew-row">
    <span class="label">{{ label }}</span>
    <span class="divider">|</span>
    <span class="names">{{ names.join(' / ') }}</span>
  </div>
</template>

<style scoped lang="scss">
.crew-row {
  display: flex;
  align-items: baseline;
  gap: var(--cx-space-2);
  font-size: 14px;
  color: var(--cx-text-secondary);
  line-height: 1.6;
}
.label {
  color: var(--cx-text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  min-width: 48px;
}
.divider {
  color: var(--cx-text-muted);
  font-size: 12px;
}
.names { color: var(--cx-text-primary); }
</style>
