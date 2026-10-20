<script setup lang="ts">
/**
 * 日期筛选 chips —— 影厅排期页的日期行胶囊条.
 *
 * 选项由本组件从全量排期推导(全库日期并集升序, 交叉计数),
 * Hall 只持有 dateFilter 状态 —— 胶囊条是日期筛选的全部 UI.
 *
 * props:
 *  - schedules   : 全量场次(跨厅合并), 推导日期并集与计数
 *  - modelValue  : 选中日期 "yyyy-MM-dd", null = 全部
 *  - filterMovieId: 当前影片筛选(只影响交叉计数, 不过滤日期并集)
 *  - allCount    : 「全部」胶囊的计数(只应用影片筛选, 忽略自身)
 *
 * emits:
 *  - update:modelValue: 切换日期筛选(v-model)
 */
import { computed } from 'vue';
import type { Schedule } from '@/types';
import { localToday, localMaxDate, dateLabel } from '@/utils/datetime';

const props = defineProps<{
  schedules: Schedule[];
  modelValue: string | null;
  filterMovieId: number | null;
  allCount: number;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', date: string | null): void }>();

/** 日期胶囊选项. count 为「在当前影片筛选下」的场次数(交叉计数). */
interface DateOption {
  date: string; // "yyyy-MM-dd"
  label: string;
  count: number;
}

/**
 * 日期胶囊: 全库日期并集升序(字典序=时间序), count 按影片筛选交叉统计.
 * 只保留未来两周(含今天共 14 天) —— 再远的排期不进胶囊条, 全部胶囊下仍可见.
 * count=0 的日期保留(半透明可点) —— 解释"为什么无结果", 不与用户抢状态.
 */
const options = computed<DateOption[]>(() => {
  const m = props.filterMovieId;
  const dates = new Set<string>();
  const counts = new Map<string, number>();
  const today = localToday();
  const max = localMaxDate();
  for (const s of props.schedules) {
    const d = s.startTime.slice(0, 10);
    if (d < today || d > max) continue; // 后端已滤过期, 双保险; 胶囊只留两周
    dates.add(d);
    if (m === null || s.movieId === m) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...dates].sort().map((date) => ({
    date,
    label: dateLabel(date),
    count: counts.get(date) ?? 0,
  }));
});

/** 点击胶囊后把它滚进可视区(窄屏横滑时选中项不跑丢). */
function scrollChipIntoView(e: MouseEvent) {
  (e.currentTarget as HTMLElement | null)?.scrollIntoView({
    inline: 'nearest',
    block: 'nearest',
    behavior: 'smooth',
  });
}

function pick(d: string | null, e: MouseEvent) {
  emit('update:modelValue', d);
  scrollChipIntoView(e);
}
</script>

<template>
  <div class="filter-row">
    <span class="row-label">日期</span>
    <div class="chip-strip">
      <button
        type="button"
        class="chip"
        :class="{ 'is-active': modelValue === null }"
        :aria-pressed="modelValue === null"
        @click="pick(null, $event)"
      >
        全部<span class="count">{{ allCount }}</span>
      </button>
      <button
        v-for="d in options"
        :key="d.date"
        type="button"
        class="chip"
        :class="{ 'is-active': modelValue === d.date, 'is-zero': d.count === 0 }"
        :aria-pressed="modelValue === d.date"
        :aria-label="`${d.label}，${d.count} 场`"
        @click="pick(d.date, $event)"
      >
        {{ d.label }}<span class="count">{{ d.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/chip' as *;
</style>
