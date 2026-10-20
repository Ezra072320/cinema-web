<script setup lang="ts">
/**
 * 影片筛选 chips —— 影厅排期页的影片行胶囊条.
 *
 * props:
 *  - movies    : 聚合好的影片选项(名称/海报/交叉计数), 由 Hall 算好传入
 *  - modelValue: 选中 movieId, null = 全部
 *  - allCount  : 「全部」胶囊的计数(只应用日期筛选, 忽略自身)
 *
 * emits:
 *  - update:modelValue: 切换影片筛选(v-model)
 */
/** 影片胶囊选项(Hall 聚合后传入). count 为交叉计数. */
interface MovieChipOption {
  id: number;
  name: string;
  poster?: string;
  count: number;
}

defineProps<{
  movies: MovieChipOption[];
  modelValue: number | null;
  allCount: number;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', id: number | null): void }>();

/** 点击胶囊后把它滚进可视区(窄屏横滑时选中项不跑丢). */
function scrollChipIntoView(e: MouseEvent) {
  (e.currentTarget as HTMLElement | null)?.scrollIntoView({
    inline: 'nearest',
    block: 'nearest',
    behavior: 'smooth',
  });
}

function pick(id: number | null, e: MouseEvent) {
  emit('update:modelValue', id);
  scrollChipIntoView(e);
}
</script>

<template>
  <div class="filter-row">
    <span class="row-label">影片</span>
    <div class="chip-strip">
      <button
        type="button"
        class="chip chip--movie"
        :class="{ 'is-active': modelValue === null }"
        :aria-pressed="modelValue === null"
        @click="pick(null, $event)"
      >
        全部<span class="count">{{ allCount }}</span>
      </button>
      <button
        v-for="m in movies"
        :key="m.id"
        type="button"
        class="chip chip--movie"
        :class="{ 'is-active': modelValue === m.id, 'is-zero': m.count === 0 }"
        :aria-pressed="modelValue === m.id"
        :title="m.name"
        @click="pick(m.id, $event)"
      >
        <img v-if="m.poster" :src="m.poster" alt="" class="thumb" loading="lazy" />
        <span class="name">{{ m.name }}</span>
        <span class="count">{{ m.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/chip' as *;
</style>
