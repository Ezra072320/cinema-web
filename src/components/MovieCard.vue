<script setup lang="ts">
import { computed } from 'vue';
import type { Movie } from '@/types';
import { searchHighlight } from '@/utils/searchHighlight';
import {
  boxOfficeOf,
  genresOf,
  posterOf,
  ratingOf,
  runtimeText,
  statusText,
  yearOf,
} from '@/utils/movie';

/**
 * 影片卡片 —— 首页 / 影片列表 / 想看列表共用.
 *
 * props:
 *  - movie    : 必传
 *  - variant  : 'default' 竖版海报卡 | 'rank' 票房榜横向条目
 *  - rank     : variant='rank' 时的名次, 影响奖牌配色
 *  - showScore: 是否显示评分角标, 默认 true
 *
 * emits:
 *  - click: 跳详情由父组件处理
 */
const props = withDefaults(
  defineProps<{
    movie: Movie;
    titleHighlight?: string;
    variant?: 'default' | 'rank';
    rank?: number;
    showScore?: boolean;
  }>(),
  { variant: 'default', showScore: true },
);

defineEmits<{ (e: 'click'): void }>();

const poster = computed(() => posterOf(props.movie));
const safeTitleHighlight = computed(() => searchHighlight(props.titleHighlight));
const genres = computed(() => genresOf(props.movie, 2));
const rating = computed(() => ratingOf(props.movie));
const runtime = computed(() => runtimeText(props.movie));
const year = computed(() => yearOf(props.movie));
const box = computed(() => boxOfficeOf(props.movie));
const statusLabel = computed(() => statusText(props.movie));
</script>

<template>
  <article
    class="movie-card"
    :class="`movie-card--${variant}`"
    role="button"
    tabindex="0"
    @click="$emit('click')"
    @keydown.enter="$emit('click')"
    @keydown.space.prevent="$emit('click')"
  >
    <div class="poster-wrap">
      <!-- 海报 + 失败占位在 PosterImage(懒加载/首字占位内置) -->
      <PosterImage
        :src="poster"
        :alt="movie.title"
        :initial="movie.title?.charAt(0)"
        :sub="genres[0]"
      />

      <span v-if="showScore && rating" class="badge badge--score">
        {{ rating.toFixed(1) }}
      </span>
      <span
        v-if="variant === 'rank' && rank"
        class="badge badge--rank"
        :class="`badge--rank-${rank}`"
      >
        {{ rank }}
      </span>
      <span v-else-if="variant === 'default'" class="badge badge--status">
        {{ statusLabel }}
      </span>

      <!-- 悬停浮层：补足卡片本身放不下的信息 -->
      <div class="overlay">
        <p v-if="movie.summary" class="overlay-summary">{{ movie.summary }}</p>
        <span class="overlay-cta">查看详情 →</span>
      </div>
    </div>

    <div class="info">
      <h3 class="title" :title="movie.title">
        <span v-if="safeTitleHighlight" v-html="safeTitleHighlight" /><template v-else>{{
          movie.title
        }}</template>
      </h3>

      <div class="meta">
        <template v-if="variant === 'rank'">
          <span v-if="box" class="box">{{ box }}</span>
          <span v-if="box && year" class="dot">·</span>
          <span v-if="year">{{ year }}</span>
        </template>
        <template v-else>
          <span v-for="(g, i) in genres" :key="`g-${i}`" class="chip">{{ g }}</span>
          <span v-if="!genres.length && year">{{ year }}</span>
          <template v-if="runtime">
            <span v-if="genres.length || year" class="dot">·</span>
            <span>{{ runtime }}</span>
          </template>
        </template>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.movie-card {
  cursor: pointer;
  outline: none;
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-2);
  transition: transform 0.18s ease;

  &:hover,
  &:focus-visible {
    transform: translateY(-4px);
  }
  &:focus-visible .poster-wrap {
    outline: 2px solid var(--cx-color-primary);
    outline-offset: 2px;
  }
}

.poster-wrap {
  position: relative;
  border-radius: var(--cx-radius-md);
  overflow: hidden;
  aspect-ratio: 2 / 3;
  background: linear-gradient(135deg, #1a1f2e 0%, #2a2235 100%);
}

.poster-wrap :deep(.poster-image) {
  transition: transform var(--cx-duration-slow) var(--cx-ease);
}

.movie-card:hover :deep(.poster-image) {
  transform: scale(1.06);
}

.badge {
  position: absolute;
  padding: 2px 8px;
  border-radius: var(--cx-radius-sm);
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(8px);

  &--score {
    top: 8px;
    right: 8px;
    background: rgba(15, 20, 25, 0.78);
    color: var(--cx-color-primary);
  }
  &--status {
    top: 8px;
    left: 8px;
    background: rgba(15, 20, 25, 0.7);
    color: var(--cx-text-secondary);
    font-weight: 500;
  }
  &--rank {
    top: 8px;
    left: 8px;
    background: var(--cx-color-accent);
    color: #fff;
  }
  &--rank-1 {
    background: var(--cx-gold);
    color: #1a1f2e;
  }
  &--rank-2 {
    background: var(--cx-rank-silver);
    color: #1a1f2e;
  }
  &--rank-3 {
    background: var(--cx-rank-bronze);
  }
}

/* 悬停浮层 */
.overlay {
  position: absolute;
  inset: auto 0 0 0;
  padding: var(--cx-space-3);
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: linear-gradient(180deg, transparent, rgba(10, 12, 18, 0.92));
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
  pointer-events: none;

  .overlay-summary {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--cx-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .overlay-cta {
    font-size: 11px;
    font-weight: 600;
    color: var(--cx-color-primary);
  }
}

.movie-card:hover .overlay,
.movie-card:focus-visible .overlay {
  opacity: 1;
  transform: translateY(0);
}

.info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--cx-text-muted);
  flex-wrap: wrap;
  min-height: 18px;
}

.chip {
  padding: 1px 6px;
  border-radius: var(--cx-radius-sm);
  background: color-mix(in srgb, var(--cx-color-primary) 12%, transparent);
  color: var(--cx-color-primary);
  font-size: 11px;
}

.box {
  color: var(--cx-gold);
  font-weight: 700;
}

.dot {
  opacity: 0.5;
}

/* ===== 票房榜横向条目 ===== */
.movie-card--rank {
  flex-direction: row;
  align-items: center;
  gap: var(--cx-space-3);
  padding: var(--cx-space-3);
  border-radius: var(--cx-radius-md);
  background: var(--cx-bg-elevated);
  border: 1px solid var(--cx-border);

  &:hover {
    transform: translateX(4px);
  }

  .poster-wrap {
    width: 56px;
    flex: 0 0 56px;
    aspect-ratio: 2 / 3;
    border-radius: var(--cx-radius-sm);
  }
  .overlay {
    display: none;
  }
  .badge--rank {
    font-size: 11px;
    padding: 1px 6px;
  }
  .title {
    font-size: 14px;
  }
  .info {
    gap: 2px;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .overlay {
    display: none;
  }
}
</style>
