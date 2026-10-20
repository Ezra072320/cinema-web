<script setup lang="ts">
import type { MovieDetail } from '@/types';
import {
  backdropOf,
  boxOfficeOf,
  genresOf,
  posterOf,
  ratingOf,
  runtimeText,
  sourceText,
  statusText,
  marketStatusText,
  ratingSourceText,
} from '@/utils/movie';

/**
 * 影片详情抽屉（只读展示库里已存的完整影片信息）。
 * 从 MovieManage 拆出：只负责展示，可见性与数据由父级控制（v-model + movie），
 * 补录保存后的刷新也留在父级 —— 这里不发请求。
 */
defineProps<{ modelValue: boolean; movie: MovieDetail | null; loading?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>();
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="影片详情"
    size="620px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="detail">
      <template v-if="movie">
        <div class="detail-hero">
          <img v-if="posterOf(movie)" :src="posterOf(movie)" :alt="movie.title" class="detail-poster" />
          <div class="detail-hero-body">
            <h2 class="detail-title">{{ movie.title }}</h2>
            <p v-if="movie.originalTitle" class="detail-orig">{{ movie.originalTitle }}</p>
            <div class="detail-tags">
              <span v-if="ratingOf(movie)" class="detail-score">
                {{ ratingOf(movie)!.toFixed(1) }}<small>分</small>
              </span>
              <span class="cx-tag cx-tag--muted">{{ statusText(movie) }}</span>
              <span v-for="g in genresOf(movie, 3)" :key="g" class="cx-tag cx-tag--muted">{{ g }}</span>
            </div>
          </div>
        </div>

        <el-descriptions :column="2" border size="small" class="detail-desc">
          <el-descriptions-item label="上映日期">{{ movie.releaseDate || '—' }}</el-descriptions-item>
          <el-descriptions-item label="时长">{{ runtimeText(movie) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="地区">{{ movie.area || '—' }}</el-descriptions-item>
          <el-descriptions-item label="主语言">{{ movie.language || '—' }}</el-descriptions-item>
          <el-descriptions-item label="制式">{{ movie.fmt || '—' }}</el-descriptions-item>
          <el-descriptions-item label="上映天数">
            {{ movie.showDays ? `${movie.showDays} 天` : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="累计票房">{{ boxOfficeOf(movie) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="首日票房">
            {{ movie.firstDayBox ? boxOfficeOf({ totalBox: movie.firstDayBox }) : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="想看人数">{{ movie.wishCount ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="评分人数">{{ movie.scoreCount ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="数据来源">{{ sourceText(movie.source) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="猫眼 ID">{{ movie.maoyanId ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="市场状态">{{ marketStatusText(movie) }}</el-descriptions-item>
          <el-descriptions-item label="最近更新">{{ movie.lastSyncedAt || '—' }}</el-descriptions-item>
          <el-descriptions-item label="最近补缺">{{ movie.lastRepairAt || '—' }}</el-descriptions-item>
          <el-descriptions-item label="评分来源">{{ ratingSourceText(movie.scoreSource) }}</el-descriptions-item>
        </el-descriptions>

        <section v-if="movie.director || movie.cast?.length" class="detail-section">
          <h3>演职</h3>
          <p v-if="movie.director" class="detail-line">
            <span class="detail-line-key">导演</span>{{ movie.director.name }}
          </p>
          <p v-if="movie.writers?.length" class="detail-line">
            <span class="detail-line-key">编剧</span>
            {{ movie.writers.map((w) => w.name).join(' / ') }}
          </p>
          <div v-if="movie.cast?.length" class="detail-cast">
            <span v-for="c in movie.cast" :key="c.person.id" class="cx-tag cx-tag--muted">
              {{ c.person.name }}<template v-if="c.character"> 饰 {{ c.character }}</template>
            </span>
          </div>
        </section>

        <section v-if="movie.summary" class="detail-section">
          <h3>简介</h3>
          <p class="detail-story">{{ movie.summary }}</p>
        </section>

        <section v-if="movie.tags?.length" class="detail-section">
          <h3>标签</h3>
          <span v-for="t in movie.tags" :key="t" class="cx-tag cx-tag--muted">{{ t }}</span>
        </section>

        <section v-if="backdropOf(movie)" class="detail-section">
          <h3>剧照</h3>
          <img :src="backdropOf(movie)" :alt="movie.title" class="detail-backdrop" />
        </section>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped lang="scss">
.detail {
  min-height: 200px;
}

.detail-hero {
  display: flex;
  gap: var(--cx-space-4);
  margin-bottom: var(--cx-space-5);
}

.detail-poster {
  width: 110px;
  height: 156px;
  object-fit: cover;
  border-radius: var(--cx-radius-md);
  flex-shrink: 0;
}

.detail-hero-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.detail-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.detail-orig {
  margin: 0;
  font-size: 13px;
  font-style: italic;
  color: var(--cx-text-muted);
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

/* 评分高亮金 → --cx-gold(值即 #fbbf24, 与 Home / MovieCard 全站一致, 零色差) */
.detail-score {
  color: var(--cx-gold);
  font-size: 20px;
  font-weight: 800;
  small { font-size: 11px; font-weight: 500; margin-left: 2px; }
}

.detail-desc {
  margin-bottom: var(--cx-space-5);
}

.detail-section {
  margin-bottom: var(--cx-space-5);

  h3 {
    margin: 0 0 var(--cx-space-2);
    font-size: 14px;
    font-weight: 700;
    color: var(--cx-text-secondary);
  }
}

.detail-line {
  margin: 0 0 6px;
  font-size: 13px;
}

.detail-line-key {
  display: inline-block;
  width: 44px;
  color: var(--cx-text-muted);
}

.detail-cast {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.detail-story {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--cx-text-secondary);
}

.detail-backdrop {
  width: 100%;
  border-radius: var(--cx-radius-md);
}
</style>
