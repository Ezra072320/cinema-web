<script setup lang="ts">
/**
 * 统计卡片(管理后台 KPI).
 */
defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  trend?: number; // 正数上升绿色,负数下降红色
  accent?: 'gold' | 'wine' | 'blue' | 'green';
}>();
</script>

<template>
  <div class="stat-card cx-card" :class="`is-${accent ?? 'gold'}`">
    <div class="label">{{ label }}</div>
    <div class="value">{{ value }}</div>
    <div class="footer">
      <span v-if="hint" class="hint">{{ hint }}</span>
      <span v-if="trend !== undefined" class="trend" :class="{ up: trend > 0, down: trend < 0 }">
        {{ trend > 0 ? '↑' : trend < 0 ? '↓' : '·' }} {{ Math.abs(trend).toFixed(1) }}%
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stat-card {
  padding: var(--cx-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-2);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 100% 0%,
      var(--cx-color-primary) 0%,
      transparent 60%
    );
    opacity: 0.08;
    pointer-events: none;
  }

  &.is-wine::before {
    background: radial-gradient(circle at 100% 0%, var(--cx-color-accent) 0%, transparent 60%);
  }
  &.is-blue::before {
    background: radial-gradient(circle at 100% 0%, var(--cx-color-info) 0%, transparent 60%);
  }
  &.is-green::before {
    background: radial-gradient(circle at 100% 0%, var(--cx-success) 0%, transparent 60%);
  }

  .label {
    color: var(--cx-text-secondary);
    font-size: 13px;
    letter-spacing: 0.04em;
  }

  .value {
    font-size: 32px;
    font-weight: 700;
    color: var(--cx-text-primary);
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--cx-space-2);

    .hint {
      font-size: 12px;
      color: var(--cx-text-muted);
    }

    .trend {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--cx-radius-full);
      background: rgba(255, 255, 255, 0.06);

      &.up {
        color: var(--cx-success);
        background: color-mix(in srgb, var(--cx-success) 10%, transparent);
      }
      &.down {
        color: var(--cx-danger);
        background: color-mix(in srgb, var(--cx-danger) 10%, transparent);
      }
    }
  }
}
</style>
