<script setup lang="ts">
import { seatTypeLabel } from '@/types';

/**
 * 座位类型图例 —— 座位图编辑器 / 影厅预览 / 选座页三处共用.
 *
 * 存在的意义就是"统一". 之前三个页面各写各的图例, 结果:
 *   - 配色各写各的 rgba, 同一个"情侣座"在三页是三种橙;
 *   - 文案各叫各的(有座位 / 可选 / 标准);
 *   - **无障碍(type=4)只在编辑器里有**, 预览页和选座页既不画也不标.
 *
 * 现在颜色走 theme.scss 的 `--cx-seat-*` 令牌, 文案走 types 里的 `SEAT_TYPE_LABEL`,
 * 三处不可能再对不上.
 *
 * @example
 *   <SeatLegend />                                  // 四类座位 + 过道
 *   <SeatLegend :types="['couple', 'vip']" />       // 只要两类
 *   <SeatLegend><template #extra>...页面特有的状态...</template></SeatLegend>
 */
const TYPE_CODE: Record<string, number> = {
  standard: 1,
  couple: 2,
  vip: 3,
  accessible: 4,
};

withDefaults(
  defineProps<{
    /** 要展示哪几类座位. 顺序即展示顺序. 默认四类全展示. */
    types?: string[];
    /** 是否追加"过道 / 不可用"这一条. */
    aisle?: boolean;
  }>(),
  {
    types: () => ['standard', 'couple', 'vip', 'accessible'],
    aisle: true,
  },
);
</script>

<template>
  <div class="seat-legend">
    <!-- 页面特有的条目(选座页的 已选/已售 等)排在类型前面 -->
    <slot name="extra" />
    <span v-for="t in types" :key="t" class="lg" :class="`lg--${t}`">
      <i class="chip" aria-hidden="true" />{{ seatTypeLabel(TYPE_CODE[t]) }}
    </span>
    <span v-if="aisle" class="lg lg--aisle">
      <i class="chip" aria-hidden="true" />过道 / 不可用
    </span>
  </div>
</template>

<style scoped lang="scss">
.seat-legend {
  display: flex;
  gap: var(--cx-space-4);
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--cx-text-secondary);
}

.lg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 色块用组件自己的类上色, 外部页面如果要放"已选/已售"那种格子, 用 /deep/ 或
   直接复用下面的变量即可, 不必再写一遍座位类型的颜色 */
.chip {
  width: 14px;
  height: 14px;
  border-radius: var(--cx-radius-sm);
  border: 1px solid var(--cx-border);
  background: var(--cx-bg-card);
}

.lg--standard .chip {
  background: var(--cx-seat-standard-bg);
  border-color: var(--cx-seat-standard-border);
}
.lg--couple .chip {
  background: var(--cx-seat-couple-bg);
  border-color: var(--cx-seat-couple-border);
}
.lg--vip .chip {
  background: var(--cx-seat-vip-bg);
  border-color: var(--cx-seat-vip-border);
}
.lg--accessible .chip {
  background: var(--cx-seat-accessible-bg);
  border-color: var(--cx-seat-accessible-border);
}
.lg--aisle .chip {
  background: transparent;
  border: 1px dashed var(--cx-seat-aisle-border);
}
</style>
