<script setup lang="ts">
import { Box } from '@element-plus/icons-vue';

/**
 * 通用空状态.
 * @example
 *   <EmptyState title="暂无订单" hint="下单后会自动出现在这里" />
 */
withDefaults(
  defineProps<{
    title?: string;
    hint?: string;
  }>(),
  { title: '暂无数据' },
);
</script>

<template>
  <div class="cx-empty">
    <div class="icon" aria-hidden="true">
      <slot name="icon">
        <el-icon :size="48"><Box /></el-icon>
      </slot>
    </div>
    <div class="title">{{ title }}</div>
    <div class="hint" v-if="hint">{{ hint }}</div>
    <div class="actions" v-if="$slots.actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.cx-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--cx-space-12) var(--cx-space-6);
  color: var(--cx-text-secondary);
  text-align: center;

  .icon {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--cx-border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cx-text-muted);
    margin-bottom: var(--cx-space-4);
  }

  .title {
    font-size: 16px;
    color: var(--cx-text-primary);
    margin-bottom: var(--cx-space-2);
  }

  .hint {
    font-size: 13px;
    color: var(--cx-text-muted);
    margin-bottom: var(--cx-space-4);
  }

  .actions {
    margin-top: var(--cx-space-3);
  }
}
</style>
