<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { movieApi } from '@/api';
import { searchApi } from '@/api/search';
import { searchHighlight } from '@/utils/searchHighlight';
import type { Movie } from '@/types';

const route = useRoute();
const router = useRouter();

const STATUS_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: '全部' }, // 3 = 全部(后端识别)
  { value: 1, label: '本店热映' },
  { value: 0, label: '暂未排片' },
];

const list = ref<Movie[]>([]);
const loading = ref(true);
const error = ref<unknown>(null);
const page = ref(1);
const limit = 12;
const total = ref(0);
const status = ref<number>(3);
const keyword = ref('');
const genre = ref('');
const area = ref('');
const sort = ref('relevance');
const mode = ref('FULLTEXT');
const highlights = ref<Record<number, Record<string, string[]>>>({});
let requestVersion = 0;

const queryKeyword = computed(() => (route.query.q as string) ?? '');
const queryStatus = computed(() => (route.query.status as string) ?? '');

async function load() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = null;
  try {
    let result;
    try {
      result = await searchApi.movies({
        page: page.value,
        size: limit,
        q: keyword.value || undefined,
        genre: genre.value || undefined,
        area: area.value || undefined,
        sort: sort.value,
        showing: status.value === 3 ? undefined : status.value === 1,
      });
    } catch (searchError) {
      // The base group works without Search. Advanced filters require the search group.
      if (genre.value || area.value || sort.value === 'score') throw searchError;
      const basic = await movieApi.page({
        page: page.value,
        limit,
        title: keyword.value || undefined,
        showing: status.value === 3 ? undefined : status.value === 1,
      });
      result = {
        total: basic.total,
        rows: basic.rows.map((movie) => ({
          movie,
          highlights: {},
          hasSchedules: movie.hasSchedules,
          scheduleCount: movie.scheduleCount,
          nextShowTime: movie.nextShowTime,
        })),
        mode: 'CATALOG',
      };
    }
    if (version !== requestVersion) return;
    list.value = result.rows.map((item) => ({
      ...item.movie,
      hasSchedules: item.hasSchedules,
      scheduleCount: item.scheduleCount,
      nextShowTime: item.nextShowTime,
    }));
    highlights.value = Object.fromEntries(
      result.rows.map((item) => [item.movie.id, item.highlights]),
    );
    total.value = result.total;
    mode.value = result.mode;
  } catch (err) {
    if (version === requestVersion) error.value = err;
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function changeFilters() {
  cancelDebouncedSearch();
  page.value = 1;
  void load();
}
function excerpt(id: number) {
  const item = highlights.value[id];
  return item?.aliases?.[0] ?? item?.people?.[0] ?? item?.summary?.[0];
}

function goMovie(id: number) {
  router.push({ name: 'movie-detail', params: { id } });
}

/** 输入防抖 300ms 再搜; 回车/清空立即触发. 不用 @change: 失焦会在防抖已跑完后再发一次.
 *  手写 setTimeout 而非 useDebounceFn: 后者的返回类型没有 .cancel, 挂起的防抖取消不掉. */
let searchTimer: ReturnType<typeof setTimeout> | undefined;
function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void load();
  }, 300);
}
function cancelDebouncedSearch() {
  clearTimeout(searchTimer);
}

function onKeywordInput() {
  debouncedSearch();
}

function onKeywordEnter() {
  // 回车立即搜, 并取消挂起的防抖, 避免重复请求
  cancelDebouncedSearch();
  page.value = 1;
  void load();
}

function changeStatus(v: number) {
  cancelDebouncedSearch();
  status.value = v;
  page.value = 1;
  load();
}

function changeKeyword(v: string) {
  // 清空立即搜(v-model 已同步, 这里以 v 为准)
  cancelDebouncedSearch();
  keyword.value = v;
  page.value = 1;
  load();
}

function changePage(p: number) {
  cancelDebouncedSearch();
  page.value = p;
  load();
  // 翻页后新一页从列表中部开始显示, 用户体验很差
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

watch(queryKeyword, (v) => {
  {
    keyword.value = v;
    page.value = 1;
    load();
  }
});

watch(queryStatus, (v) => {
  if (v) {
    const n = ({ NOW: 1, SOON: 0, CLASSIC: 0 } as Record<string, number>)[v];
    if (n !== undefined) {
      status.value = n;
      load();
    }
  }
});

onMounted(() => {
  if (queryKeyword.value) keyword.value = queryKeyword.value;
  if (queryStatus.value) {
    const n = ({ NOW: 1, SOON: 0, CLASSIC: 0 } as Record<string, number>)[queryStatus.value];
    if (n !== undefined) status.value = n;
  }
  load();
});
onUnmounted(() => {
  clearTimeout(searchTimer);
  requestVersion++;
});
</script>

<template>
  <div class="movie-page cx-page">
    <header class="header">
      <div>
        <h1 class="title">所有影片</h1>
        <p class="subtitle">
          共 <strong>{{ total }}</strong> 部
          <template v-if="keyword">· 关键词「{{ keyword }}」</template>
        </p>
      </div>
    </header>

    <div class="filters cx-glass">
      <el-radio-group :model-value="status" @change="changeStatus">
        <el-radio-button v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </el-radio-button>
      </el-radio-group>

      <el-input
        v-model="keyword"
        placeholder="搜索片名、别名、导演或演员"
        :maxlength="100"
        clearable
        class="search"
        @input="onKeywordInput"
        @keyup.enter="onKeywordEnter"
        @clear="changeKeyword('')"
      />
      <div class="advanced-filters">
        <el-select v-model="genre" clearable placeholder="全部类型" @change="changeFilters">
          <el-option
            v-for="v in ['剧情', '喜剧', '动作', '爱情', '动画', '科幻', '悬疑', '犯罪', '纪录片']"
            :key="v"
            :label="v"
            :value="v"
          />
        </el-select>
        <el-select
          v-model="area"
          clearable
          filterable
          allow-create
          default-first-option
          placeholder="全部地区"
          @change="changeFilters"
        >
          <el-option
            v-for="v in ['中国大陆', '中国香港', '美国', '日本', '韩国', '法国', '英国']"
            :key="v"
            :label="v"
            :value="v"
          />
        </el-select>
        <el-select v-model="sort" aria-label="排序方式" @change="changeFilters">
          <el-option label="综合排序" value="relevance" /><el-option
            label="评分优先"
            value="score"
          /><el-option label="最新上映" value="release" />
        </el-select>
      </div>
    </div>

    <p v-if="!loading && !error && mode !== 'FULLTEXT'" class="search-note" role="status">
      {{
        mode === 'BASIC'
          ? '当前使用基础检索，暂不提供相关度排序和高亮。'
          : '搜索服务暂不可用，当前仅按片名检索。'
      }}
    </p>

    <PageSkeleton v-if="loading" :rows="3" :show-header="false" />

    <ErrorState v-else-if="error" :error="error" @retry="load" />

    <EmptyState v-else-if="!list.length" title="没有匹配的影片" hint="试试其它关键词或分类" />

    <div v-else class="grid">
      <div v-for="m in list" :key="m.id" class="search-result">
        <MovieCard
          :movie="m"
          :title-highlight="searchHighlight(highlights[m.id]?.title?.[0])"
          @click="goMovie(m.id)"
        />
        <p v-if="excerpt(m.id)" class="match-excerpt" v-html="searchHighlight(excerpt(m.id))" />
      </div>
    </div>

    <el-pagination
      v-if="!loading && !error && list.length"
      v-model:current-page="page"
      :page-size="limit"
      :total="total"
      layout="total, prev, pager, next, jumper"
      class="pager"
      @current-change="changePage"
    />
  </div>
</template>

<style scoped lang="scss">
.movie-page {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-5);
}

.header {
  .title {
    font-size: 28px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .subtitle {
    color: var(--cx-text-muted);
    font-size: 13px;
    margin: 6px 0 0;
  }
}

.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cx-space-3) var(--cx-space-4);
  padding: var(--cx-space-3) var(--cx-space-4);
  border-radius: var(--cx-radius-lg);

  :deep(.el-radio-group) {
    flex-wrap: wrap;
  }

  .search {
    width: 300px;
  }

  :deep(.el-radio-button__inner) {
    background: transparent;
    border-color: var(--cx-border);
    color: var(--cx-text-secondary);
  }

  :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
    background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
    border-color: transparent;
    color: white;
  }
}

@media (max-width: 640px) {
  .filters .search {
    width: 100%;
  }
}

/* 卡片样式全部在 MovieCard.vue 里, 这里只负责栅格 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--cx-space-5) var(--cx-space-4);
}

.advanced-filters {
  display: flex;
  gap: 12px;
  flex: 1 0 100%;
}
.advanced-filters :deep(.el-select) {
  width: 160px;
}
.search-note {
  margin: 0;
  font-size: 13px;
  color: var(--cx-text-muted);
}
.match-excerpt {
  font-size: 12px;
  color: var(--cx-text-secondary);
  line-height: 1.6;
  margin: 8px 0 0;
  overflow-wrap: anywhere;
}
.search-result :deep(mark) {
  color: var(--cx-color-primary);
  background: color-mix(in srgb, var(--cx-color-primary) 14%, transparent);
}
@media (max-width: 640px) {
  .advanced-filters {
    flex-wrap: wrap;
  }
  .advanced-filters :deep(.el-select) {
    flex: 1 1 120px;
    width: auto;
  }
}
.pager {
  justify-content: center;
  margin-top: var(--cx-space-4);
}
</style>
