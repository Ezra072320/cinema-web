<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { movieApi } from '@/api';
import type { Movie, MovieSoldVO } from '@/types';
import {
  backdropOf,
  boxOfficeOf,
  genresOf,
  posterOf,
  ratingOf,
  runtimeText,
  yearOf,
} from '@/utils/movie';

const router = useRouter();
const hot = ref<Movie[]>([]);
const topSales = ref<MovieSoldVO[]>([]);
const topBox = ref<MovieSoldVO[]>([]);
const loading = ref(true);
const error = ref<unknown>(null);
const rankErrors = ref({ sales: false, box: false });
/** 榜单 tab: 公开票房(全国累计, 亿级) / 影院销售(本店已支付票款, 元级). */
const rankTab = ref<'box' | 'sales'>('box');

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [h, s, b] = await Promise.allSettled([
      movieApi.hot(),
      movieApi.topSales(),
      movieApi.topBoxOffice(),
    ]);
    if (h.status === 'rejected') throw h.reason;
    hot.value = h.value ?? [];
    topSales.value = s.status === 'fulfilled' ? s.value ?? [] : [];
    topBox.value = b.status === 'fulfilled' ? b.value ?? [] : [];
    rankErrors.value = { sales: s.status === 'rejected', box: b.status === 'rejected' };
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

function goMovie(id: number) {
  router.push({ name: 'movie-detail', params: { id } });
}

/** 立即购票: 直达该片的本店场次列表. */
function goBuy(id: number) {
  router.push({ name: 'hall-by-movie', params: { movieId: id } });
}

/* ===== 衍生数据 ===== */

/** 热映中挑一部做头图：有剧照的优先，其次评分最高的。 */
const featured = computed<Movie | null>(() => {
  const now = hot.value.filter((m) => m.hasSchedules);
  const pool = now.length ? now : hot.value;
  if (!pool.length) return null;
  return (
    [...pool].sort((a, b) => {
      const ab = backdropOf(a) ? 1 : 0;
      const bb = backdropOf(b) ? 1 : 0;
      if (ab !== bb) return bb - ab;
      return (ratingOf(b) ?? 0) - (ratingOf(a) ?? 0);
    })[0] ?? null
  );
});

const nowShowing = computed(() => hot.value.filter((m) => m.hasSchedules));


/**
 * 双榜金额口径不同、量级差 3~5 个数量级(公开票房亿级 / 影院销售元级),
 * 各榜独立取数、独立算进度条分母, 绝不混用(混排会把本店条压成 4% 下限).
 */
const rankRows = computed(() =>
  (rankTab.value === 'box' ? topBox.value : topSales.value).slice(0, 10),
);

function rankAmount(m: MovieSoldVO): number {
  return rankTab.value === 'box'
    ? Number(m.totalBox ?? 0)
    : Number(m.boxOffice ?? 0);
}

function rankAmountText(m: MovieSoldVO): string {
  const v = rankAmount(m);
  if (!v) return '';
  return boxOfficeOf({ totalBox: v });
}

const maxRankAmount = computed(() => Math.max(1, ...rankRows.value.map(rankAmount)));

/** 头图背景：剧照铺底 + 压暗渐变，保证白字可读。 */
const heroStyle = computed(() => {
  const bg = featured.value ? backdropOf(featured.value) : '';
  const overlay = 'linear-gradient(90deg, rgba(10,12,18,0.94) 0%, rgba(10,12,18,0.72) 45%, rgba(10,12,18,0.35) 100%)';
  return bg ? { backgroundImage: `${overlay}, url(${bg})` } : undefined;
});

/** 图片挂了就藏掉，别显示裂图。 */
function hideOnError(e: Event) {
  const el = e.target as HTMLImageElement | null;
  if (el) el.style.visibility = 'hidden';
}

onMounted(load);
</script>

<template>
  <div class="home cx-page">
    <PageSkeleton v-if="loading" :rows="4" :show-header="false" />

    <ErrorState v-else-if="error" :error="error" @retry="load" />

    <template v-else>
      <!-- ===== 头图：主打一部热映影片 ===== -->
      <section v-if="featured" class="hero" :style="heroStyle">
        <div class="hero-body">
          <span class="hero-kicker">本店热映</span>
          <h1 class="hero-title">{{ featured.title }}</h1>

          <div class="hero-meta">
            <span v-if="ratingOf(featured)" class="hero-score">
              {{ ratingOf(featured)!.toFixed(1) }}
              <small>分</small>
            </span>
            <span v-if="featured.originalTitle" class="hero-orig">{{ featured.originalTitle }}</span>
            <span v-if="yearOf(featured)">{{ yearOf(featured) }}</span>
            <span v-if="runtimeText(featured)">· {{ runtimeText(featured) }}</span>
            <span v-if="featured.area">· {{ featured.area }}</span>
          </div>

          <div v-if="genresOf(featured, 3).length" class="hero-genres">
            <span v-for="g in genresOf(featured, 3)" :key="g" class="cx-tag cx-tag--muted">{{ g }}</span>
          </div>

          <p v-if="featured.summary" class="hero-summary">{{ featured.summary }}</p>

          <div class="hero-actions">
            <!-- 立即购票直达该片排期, 不再和「影片详情」同目的地 -->
            <el-button type="primary" round size="large" @click="goBuy(featured.id)">
              立即购票
            </el-button>
            <el-button round size="large" @click="goMovie(featured.id)">影片详情</el-button>
          </div>
        </div>

        <img
          v-if="posterOf(featured)"
          :src="posterOf(featured)"
          :alt="featured.title"
          class="hero-poster"
          @error="hideOnError"
        />
      </section>

      <!-- ===== 两栏：左侧影片列表 / 右侧票房榜 ===== -->
      <div class="home-layout">
        <div class="home-main">
          <!-- ===== 本店热映 ===== -->
          <section v-if="nowShowing.length" class="section">
            <div class="section-header">
              <h2 class="section-title">本店热映</h2>
              <el-link type="primary" :underline="false" @click="router.push('/movie')">
                查看全部 →
              </el-link>
            </div>
            <div class="grid">
              <MovieCard
                v-for="m in nowShowing"
                :key="m.id"
                :movie="m"
                @click="goMovie(m.id)"
              />
            </div>
          </section>

          <EmptyState v-if="!nowShowing.length" title="本店暂无排片" hint="影片资料已保留，安排场次后会在这里展示。">
            <template #actions><el-button @click="router.push('/movie')">浏览影片资料库</el-button></template>
          </EmptyState>
        </div>

        <!-- ===== 排行榜：公开票房 / 影院销售 双榜切换 ===== -->
        <aside v-if="topBox.length || topSales.length" class="home-side">
          <section class="rank-panel">
            <div class="section-header">
              <h2 class="section-title section-title--sm">排行榜</h2>
              <el-radio-group v-model="rankTab" size="small">
                <el-radio-button value="box">公开票房</el-radio-button>
                <el-radio-button value="sales">影院销售</el-radio-button>
              </el-radio-group>
            </div>
            <span class="section-hint">
              {{ rankTab === 'box' ? '全国累计票房（公开数据）' : '本店已支付票款' }}
            </span>

            <div v-if="rankErrors[rankTab]" class="rank-empty" role="status">
              榜单暂时加载失败
              <el-button text type="primary" @click="load">重试</el-button>
            </div>
            <ol v-else-if="rankRows.length" class="rank-list">
              <li
                v-for="(m, idx) in rankRows"
                :key="m.movieId"
                class="rank-item"
                role="button"
                tabindex="0"
                @click="goMovie(m.movieId)"
                @keydown.enter="goMovie(m.movieId)"
                @keydown.space.prevent="goMovie(m.movieId)"
              >
                <span class="rank" :class="`rank-${idx + 1}`">{{ idx + 1 }}</span>

                <img
                  :src="m.posterUrl"
                  :alt="m.title"
                  class="rank-poster"
                  loading="lazy"
                  @error="hideOnError"
                />

                <div class="rank-info">
                  <h4 class="rank-title">{{ m.title }}</h4>
                  <span v-if="rankAmountText(m)" class="rank-box">{{ rankAmountText(m) }}</span>
                  <span v-else-if="m.soldCount" class="rank-box">{{ m.soldCount }} 张</span>
                  <span v-else class="rank-box rank-box--empty">暂无</span>

                  <div class="rank-bar">
                    <span
                      class="rank-bar-fill"
                      :style="{ width: `${Math.max(4, (rankAmount(m) / maxRankAmount) * 100)}%` }"
                    ></span>
                  </div>
                </div>
              </li>
            </ol>
            <p v-else class="rank-empty">
              {{ rankTab === 'sales' ? '暂无售票记录，观众购票支付后会出现在这里' : '暂无公开票房数据' }}
            </p>
          </section>
        </aside>
      </div>

      <section v-if="!hot.length && !topBox.length && !topSales.length" class="section">
        <EmptyState title="暂无影片数据" hint="请先在后台管理导入影片" />
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.home {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-10);
  padding-top: var(--cx-space-6);
}

/* ===== Hero ===== */
.hero {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 260px;
  align-items: center;
  gap: var(--cx-space-8);
  min-height: 380px;
  padding: var(--cx-space-10) var(--cx-space-8);
  border-radius: var(--cx-radius-xl);
  border: 1px solid var(--cx-border);
  overflow: hidden;
  background-color: var(--cx-bg-elevated);
  background-size: cover;
  background-position: center 30%;
}

.hero-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-3);
  max-width: 620px;
}

.hero-kicker {
  align-self: flex-start;
  padding: 3px 10px;
  border-radius: var(--cx-radius-full);
  background: color-mix(in srgb, var(--cx-color-primary) 16%, transparent);
  color: var(--cx-color-primary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.hero-title {
  font-size: 46px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 0;
  color: #fff;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.5);
}

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
  color: var(--cx-text-secondary);

  .hero-score {
    color: var(--cx-gold);
    font-size: 22px;
    font-weight: 800;
    small { font-size: 12px; font-weight: 500; margin-left: 2px; }
  }
  .hero-orig { font-style: italic; opacity: 0.8; }
}

.hero-genres {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.hero-summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--cx-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hero-actions {
  display: flex;
  gap: var(--cx-space-3);
  margin-top: var(--cx-space-2);
}

.hero-poster {
  position: relative;
  z-index: 1;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--cx-radius-lg);
  box-shadow: var(--cx-shadow-lg);
  justify-self: end;
}

/* ===== 两栏布局：左内容 / 右票房榜 ===== */
.home-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--cx-space-8);
  align-items: start;
}

.home-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-10);
}

.home-side {
  min-width: 0;
  position: sticky;
  top: calc(var(--cx-header-h) + 16px);
}

/* ===== Sections ===== */
.section {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-5);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--cx-space-3);
}

.section-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.01em;

  &--sm { font-size: 17px; }
}

.section-hint {
  font-size: 12px;
  color: var(--cx-text-muted);
  white-space: nowrap;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--cx-space-5) var(--cx-space-4);
}

/* ===== 票房榜（侧栏纵向榜单） ===== */
.rank-panel {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
  padding: var(--cx-space-4);
  border-radius: var(--cx-radius-xl);
  background: var(--cx-bg-elevated);
  border: 1px solid var(--cx-border);
}

.rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 面板整体（含标题）不超过一屏, 超出部分榜单内部滚动 */
  max-height: calc(100vh - var(--cx-header-h) - 104px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--cx-border-strong) transparent;

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb {
    background: var(--cx-border-strong);
    border-radius: var(--cx-radius-full);
  }
}

.rank-item {
  display: grid;
  grid-template-columns: 18px 36px minmax(0, 1fr);
  align-items: center;
  gap: var(--cx-space-3);
  padding: 6px 8px;
  border-radius: var(--cx-radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;

  &:hover,
  &:focus-visible {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--cx-border);
    outline: none;
  }
}

.rank {
  font-size: 15px;
  font-weight: 800;
  text-align: center;
  color: var(--cx-text-muted);
  font-family: var(--cx-font-display);

  &.rank-1 { color: var(--cx-gold); }
  &.rank-2 { color: var(--cx-rank-silver); }
  &.rank-3 { color: var(--cx-rank-bronze); }
}

.rank-poster {
  width: 36px;
  height: 52px;
  object-fit: cover;
  border-radius: var(--cx-radius-sm);
  background: rgba(255, 255, 255, 0.04);
}

.rank-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* 侧栏里条带紧贴片名会看着像下划线, 数值已用文字给出, 这里省掉 */
.rank-info .rank-bar {
  display: none;
}

.rank-title {
  min-width: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-bar {
  height: 3px;
  border-radius: var(--cx-radius-full);
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}

.rank-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cx-color-primary), var(--cx-color-accent));
}

.rank-box {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--cx-gold);
  white-space: nowrap;

  &--empty {
    color: var(--cx-text-muted);
    font-weight: 400;
  }
}

.rank-empty {
  margin: var(--cx-space-4) 0;
  font-size: 12px;
  color: var(--cx-text-muted);
  text-align: center;
  line-height: 1.7;
}

/* 中等屏：榜单回到内容下方，横向铺开 */
@media (max-width: 1100px) {
  .home-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .home-side {
    position: static;
  }

  /* 外层不再是卡片，避免和列表项卡片套娃 */
  .rank-panel {
    padding: 0;
    border: 0;
    background: none;
    border-radius: 0;
  }

  .rank-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--cx-space-3);
    max-height: none;
    overflow: visible;
  }

  .rank-item {
    grid-template-columns: 22px 48px minmax(0, 1fr);
    padding: var(--cx-space-3);
    background: var(--cx-bg-elevated);
    border-color: var(--cx-border);

    &:hover,
    &:focus-visible {
      border-color: var(--cx-color-primary);
    }
  }

  .rank-poster {
    width: 48px;
    height: 72px;
  }

  /* 横铺布局恢复条带, 卡片够宽不会被当成下划线 */
  .rank-info .rank-bar { display: block; }
  .rank-title { font-size: 14px; }
  .rank-box { font-size: 13px; }
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
    padding: var(--cx-space-8) var(--cx-space-5);
  }
  .hero-poster { display: none; }
  .hero-title { font-size: 32px; }
}
</style>
