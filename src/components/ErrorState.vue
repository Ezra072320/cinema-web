<script setup lang="ts">
/**
 * 通用错误状态.
 * @example
 *   <ErrorState :error="err" @retry="load" />
 */
import { computed } from 'vue';

const props = defineProps<{
  error?: unknown;
  title?: string;
}>();

defineEmits<{ retry: [] }>();

// 必须是 computed: 父组件 load 失败后才给 error 赋值,
// 顶层 IIFE 只在 setup 时求值一次, props.error 更新后文案不会变.
const errorMessage = computed(() => {
  if (!props.error) return '请稍后再试';
  const e = props.error as { msg?: string; message?: string };
  return e.msg ?? e.message ?? '请稍后再试';
});
</script>

<template>
  <div class="cx-error" role="alert">
    <el-icon :size="40"><CircleCloseFilled /></el-icon>
    <div class="title">{{ title ?? '加载失败' }}</div>
    <div class="hint">{{ errorMessage }}</div>
    <el-button type="primary" @click="$emit('retry')">重试</el-button>
  </div>
</template>

<style scoped lang="scss">
.cx-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--cx-space-12) var(--cx-space-6);
  color: var(--cx-danger);
  text-align: center;
  gap: var(--cx-space-2);

  .title {
    font-size: 16px;
    color: var(--cx-text-primary);
    margin-top: var(--cx-space-2);
  }

  .hint {
    font-size: 13px;
    color: var(--cx-text-secondary);
    margin-bottom: var(--cx-space-3);
    max-width: 480px;
  }
}
</style>
