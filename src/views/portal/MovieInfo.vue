<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { movieApi } from '@/api';
import { useAuth } from '@/composables/useAuth';
import MovieReviews from '@/components/MovieReviews.vue';
import type { MovieDetail } from '@/types';
import {
  backdropOf,
  boxOfficeOf,
  genresOf,
  posterOf,
  runtimeText as runtimeTextOf,
  sourceText,
  statusText,
  ratingSourceText,
} from '@/utils/movie';

const route = useRoute();
const router = useRouter();
const { isLogin } = useAuth();

const movieId = computed(() => Number(route.params.id));
const movie = ref<MovieDetail | null>(null);
const loading = ref(true);
const error = ref<unknown>(null);
const showTrailer = ref(false);

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  error.value = null;
  try {
    const data = await movieApi.info(movieId.value);
    if (seq !== loadSeq) return;
    movie.value = data;
  } catch (err) {
    if (seq !== loadSeq) return;
    // toast 由 http 拦截器统一弹; 这里只记 error 渲染重试入口
    error.value = err;
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function toggleWant(next: boolean) {
  if (!movie.value) return;
  movie.value = { ...movie.value, isWant: next };
}

function buyTicket() {
  router.push({ name: 'hall-by-movie', params: { movieId: String(movieId.value) } });
}

function gotoLogin() {
  router.replace({ name: 'login', query: { redirect: route.fullPath } });
}

const statusLabel = computed(() => (movie.value ? statusText(movie.value) : ''));

/** 类型标签: typeNames（关联表展开）优先，退化到 cat（原始 csv）。 */
const displayTypes = computed<string[]>(() =>
  movie.value ? genresOf(movie.value, 4) : [],
);

const directorName = computed(() => movie.value?.director?.name ?? '');
const writerNames = computed(() => movie.value?.writers?.map(w => w.name) ?? []);

const hasTrailer = computed(() => (movie.value?.videos?.length ?? 0) > 0);

/** 头图: 没剧照就退化成海报, 再没有就交给 MovieBanner 的渐变底色. */
const bannerUrl = computed(() => (movie.value ? backdropOf(movie.value) : ''));

const posterUrl = computed(() => (movie.value ? posterOf(movie.value) : ''));

const runtimeText = computed(() => (movie.value ? runtimeTextOf(movie.value) : ''));

const attribution = computed(() => sourceText(movie.value?.source));

/** 票房 / 上映天数一行文案. */
const boxText = computed(() => {
  const m = movie.value;
  if (!m) return '';
  const parts: string[] = [];
  const box = boxOfficeOf(m);
  if (box) parts.push(`累计票房 ${box}`);
  if (m.showDays) parts.push(`上映 ${m.showDays} 天`);
  return parts.join(' · ');
});

watch(movieId, () => {
  showTrailer.value = false;
  void load();
}, { immediate: true });
</script>

<template>
  <div class="movie-info cx-page">
    <PageSkeleton v-if="loading" :rows="4" :show-header="true" />

    <ErrorState v-else-if="error" :error="error" @retry="load" />

    <template v-else-if="movie">
      <MovieBanner
        :backdrop="bannerUrl"
        :title="movie.originalTitle || movie.title"
        height="280px"
      />

      <div class="layout">
        <div class="poster-wrap">
          <div class="poster">
            <PosterImage :src="posterUrl" :alt="movie.title" :initial="movie.title?.charAt(0)" />
          </div>
          <div class="status-badge">
            <span class="cx-tag">{{ statusLabel }}</span>
            <span v-if="movie.score > 0" class="cx-tag cx-tag--accent">
              {{ ratingSourceText(movie.scoreSource) }} {{ movie.score.toFixed(1) }}
            </span>
          </div>
        </div>

        <div class="content">
          <h1 class="title cx-gradient-text">{{ movie.title }}</h1>

          <div class="meta">
            <span v-if="movie.area">{{ movie.area }}</span>
            <span v-if="runtimeText" class="dot">·</span>
            <span v-if="runtimeText">{{ runtimeText }}</span>
            <span v-if="movie.language" class="dot">·</span>
            <span v-if="movie.language">{{ movie.language }}</span>
            <span v-if="movie.releaseDate" class="dot">·</span>
            <span v-if="movie.releaseDate">{{ movie.releaseDate }}</span>
            <span v-if="movie.fmt" class="dot">·</span>
            <span v-if="movie.fmt" class="fmt">{{ movie.fmt }}</span>
          </div>

          <div v-if="displayTypes.length" class="types">
            <span v-for="(t, i) in displayTypes" :key="`t-${i}`" class="cx-tag cx-tag--muted">
              {{ t }}
            </span>
          </div>

          <CrewRow v-if="directorName" label="导演" :names="[directorName]" />
          <CrewRow v-if="writerNames.length" label="编剧" :names="writerNames" />

          <p v-if="movie.summary" class="summary">{{ movie.summary }}</p>

          <p v-if="boxText" class="box">
            <span class="cx-tag cx-tag--accent">{{ boxText }}</span>
          </p>

          <div v-if="movie.tags?.length" class="tags">
            <span v-for="t in movie.tags" :key="t" class="cx-tag cx-tag--muted">#{{ t }}</span>
          </div>

          <section v-if="movie.cast?.length" class="cast">
            <h3>演职</h3>
            <CastList :cast="movie.cast" />
          </section>

          <div class="actions">
            <WantButton
              v-if="isLogin"
              :movie-id="movie.id"
              :is-want="!!movie.isWant"
              @change="toggleWant"
            />
            <el-button v-else type="primary" size="large" round @click="gotoLogin">
              登录后想看
            </el-button>

            <el-button
              v-if="hasTrailer"
              size="large"
              round
              @click="showTrailer = true"
            >
              观看预告片
            </el-button>

            <el-button type="primary" size="large" round :disabled="!movie.hasSchedules" @click="buyTicket">
              {{ movie.hasSchedules ? '查看本店场次' : '本店暂未排片' }}
            </el-button>
          </div>

          <p v-if="attribution" class="source">
            {{ attribution }}
            <template v-if="movie.maoyanId">（猫眼 ID: {{ movie.maoyanId }}）</template>
          </p>
          <p v-if="movie.tmdbId && movie.source !== 'TMDB'" class="source">部分影片资料由 TMDB 补充</p>
        </div>
      </div>

      <MovieReviews :movie-id="movie.id" />
      <TrailerModal v-model="showTrailer" :videos="movie.videos || []" />
    </template>

    <EmptyState v-else title="影片不存在" hint="可能已下架" />
  </div>
</template>

<style scoped lang="scss">
.movie-info {
  padding-top: var(--cx-space-6);
}

.layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--cx-space-8);
  align-items: start;
  margin-top: var(--cx-space-4);
}

.poster-wrap {
  position: relative;
  .poster {
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: var(--cx-radius-lg);
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
    box-shadow: var(--cx-shadow-md);
  }
  .status-badge {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
}

.title {
  font-size: 40px;
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--cx-text-secondary);
  font-size: 14px;
  .dot { color: var(--cx-text-muted); }
  .fmt {
    color: var(--cx-color-primary);
    border: 1px solid var(--cx-color-primary);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
  }
}

.types, .tags { display: flex; flex-wrap: wrap; gap: 6px; }

.summary {
  font-size: 15px;
  line-height: 1.7;
  color: var(--cx-text-secondary);
  white-space: pre-wrap;
  margin: 0;
}

.box { font-size: 13px; margin: 0; }

.cast {
  h3 {
    font-size: 13px;
    color: var(--cx-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 var(--cx-space-3);
  }
}

.actions {
  display: flex;
  gap: var(--cx-space-3);
  margin-top: var(--cx-space-4);
  flex-wrap: wrap;
}

.source {
  font-size: 12px;
  color: var(--cx-text-muted);
  margin: var(--cx-space-2) 0 0 0;
}

@media (max-width: 768px) {
  .layout { grid-template-columns: 1fr; }
  .poster-wrap { max-width: 240px; margin: 0 auto; }
  /* 240px 小海报上左上角叠两个标签会遮住主体, 移动端改为海报下方横排 */
  .poster-wrap .status-badge {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 10px;
  }
  .title { font-size: 28px; }
}
</style>
