<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { movieApi, movieAdminApi } from '@/api';
import { useTablePage } from '@/composables/useTablePage';
import type { Movie, MovieSyncOverview, MovieDetail, MovieSyncStatus } from '@/types';
import MovieMetadataEditor from '@/components/MovieMetadataEditor.vue';
import MovieDetailDrawer from './MovieDetailDrawer.vue';
import SyncProgressCard from './SyncProgressCard.vue';
import {
  boxOfficeOf,
  genresOf,
  posterOf,
  ratingOf,
  runtimeText,
  statusText,
  marketStatusText,
} from '@/utils/movie';

/**
 * 影片资料更新、全片库补缺与管理员核实补录。本店热映由排片决定。
 * 详情抽屉与同步进度卡在同目录 MovieDetailDrawer / SyncProgressCard。
 */

const filter = reactive({ title: '', status: undefined as number | undefined, incomplete: false });

// onMounted 里除 load 外还要拉概况和接续同步轮询, 见文件底部 —— 故 immediate: false.
const { list, total, loading, page, limit, load, search } = useTablePage<Movie>(
  (page, limit) =>
    movieApi.page({
      page,
      limit,
      title: filter.title || undefined,
      status: filter.status,
      incomplete: filter.incomplete || undefined,
    }),
  { immediate: false },
);

/** 状态选项: 用数字 (1=热映 2=即将上映 0=经典) 与后端 DB 对齐 */
const STATUS_OPTIONS = [
  { value: 1, label: '大陆上映中' },
  { value: 2, label: '大陆待上映' },
  { value: 0, label: '已上映 / 片库' },
] as const;

/* ===== 详情抽屉 (只读展示库里已存的完整影片信息) ===== */

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<MovieDetail | null>(null);
const editMovie = ref<Movie | null>(null);
const editingId = ref<number | null>(null);
async function openEditor(movie: { id: number }) {
  editingId.value = movie.id;
  try { editMovie.value = await movieApi.info(movie.id); }
  catch { /* 拦截器已弹 */ }
  finally { editingId.value = null; }
}
async function metadataSaved() {
  const id = editMovie.value?.id;
  editMovie.value = null;
  await Promise.all([load(), loadOverview()]);
  if (id && detailVisible.value && detail.value?.id === id) await openDetail(detail.value);
}
function applyFilters() { search(); }

/** 片名输入 300ms 防抖, 否则要么必须回车/失焦才生效, 要么每个字符都打一次接口. */
let keywordTimer: ReturnType<typeof setTimeout> | undefined;
function onKeywordInput() {
  if (keywordTimer) clearTimeout(keywordTimer);
  keywordTimer = setTimeout(applyFilters, 300);
}
onUnmounted(() => {
  if (keywordTimer) clearTimeout(keywordTimer);
});

async function openDetail(m: Movie) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await movieApi.info(m.id);
  } catch {
    /* 拦截器已弹 */
  } finally {
    detailLoading.value = false;
  }
}

/* ===== 同步 ===== */

const syncing = ref(false);
const sync = ref<MovieSyncStatus | null>(null);
let pollTimer: number | undefined;

function stopPoll() {
  if (pollTimer !== undefined) {
    window.clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}

/** 轮询进度. 同步是分钟级操作, 后端异步跑, 这里只是看进度. */
async function poll() {
  try {
    const s = await movieAdminApi.syncStatus();
    sync.value = s;
    if (s.running) {
      pollTimer = window.setTimeout(poll, 2000);
      return;
    }
    // 跑完了
    syncing.value = false;
    stopPoll();
    await load();
    await loadOverview(); // 剩余可同步数变了
    if (s.state === 'FAILED') {
      ElMessage.error(s.message);
    } else if (s.mode === 'REPAIR') {
      ElMessage({ message: s.message, type: s.fail || s.partial ? 'warning' : 'success' });
    } else if (s.fail > 0 || s.partial > 0) {
      ElMessage.warning(`新增 ${s.created} 部，已存在跳过 ${s.skipped} 部，失败 ${s.fail} 部，待补 ${s.partial} 部`);
    } else if (s.ok > 0) {
      ElMessage.success(`新增 ${s.created} 部，已存在跳过 ${s.skipped} 部；已有影片未改动`);
    }
  } catch {
    syncing.value = false;
    stopPoll();
    /* 拦截器已弹 */
  }
}

async function startSync(repair = false) {
  if (syncing.value) return;
  try {
    if (repair) await movieAdminApi.startRepair();
    else await movieAdminApi.startSync();
    syncing.value = true;
    sync.value = { running: true, total: 0, done: 0, ok: 0, fail: 0, startedAt: Date.now(), finishedAt: 0, results: [], created: 0, updated: 0, skipped: 0, partial: 0, pending: 0, message: repair ? '正在扫描全片库缺失资料' : '正在获取大陆待映片单', state: repair ? 'REPAIRING' : 'DISCOVERING', mode: repair ? 'REPAIR' : 'SYNC' };
    ElMessage.info(repair ? '补缺已开始：包括历史影片，只补空缺并保留人工确认资料' : '同步已开始：只新增库中没有的大陆待映影片，已有影片不修改');
    poll();
  } catch {
    /* 拦截器已弹 */
  }
}

/* 历史影片永久保留。 */
const overview = ref<MovieSyncOverview | null>(null);
async function loadOverview() {
  try { overview.value = await movieAdminApi.overview(); } catch { /* 不阻断列表 */ }
}

onMounted(async () => {
  await load();
  await loadOverview();
  // 管理员可能在同步进行中刷新了页面 —— 把进度接回来继续轮询
  try {
    const s = await movieAdminApi.syncStatus();
    sync.value = s;
    if (s.running) {
      syncing.value = true;
      poll();
    }
  } catch {
    // 拿不到进度不影响列表展示
  }
});

onUnmounted(stopPoll);
</script>

<template>
  <div class="movie-manage">
    <header class="header">
      <div>
        <h1 class="title">影片管理</h1>
        <p class="subtitle">
          共 {{ total }} 部影片
          <span class="hint">· 资料库永久保留，本店热映由排片决定</span>
        </p>
      </div>
      <div class="actions">
        <div class="sync-action">
          <div class="task-buttons">
            <el-button round :loading="syncing && sync?.mode === 'REPAIR'" :disabled="syncing && sync?.mode !== 'REPAIR'" @click="startSync(true)">补全缺失资料</el-button>
            <el-button type="primary" round :loading="syncing && sync?.mode !== 'REPAIR'" :disabled="syncing && sync?.mode === 'REPAIR'" @click="startSync(false)">同步大陆待映影片</el-button>
          </div>
          <span class="sync-hint">
            同步只新增大陆待映新片 · 补缺覆盖全片库 · 人工确认资料受保护
          </span>
        </div>
      </div>
    </header>

    <div v-if="overview" class="catalog-bar cx-glass">
      <div class="catalog-info">
        <span class="catalog-title">影片资料库</span>
        <span class="catalog-stat">共 <b>{{ overview.total }}</b> 部</span>
        <span class="catalog-sep">·</span>
        <span class="catalog-stat">资料待补 <b>{{ overview.incomplete }}</b> 部</span>
        <span class="catalog-built">最近更新 {{ overview.lastSyncedAt?.replace('T', ' ') || '尚未更新' }}</span>
      </div>
      <span class="hint">猫眼片单 / TMDB 辅助 · 待映范围 {{ overview.upcomingDays }} 天</span>
    </div>
    <el-alert type="info" :closable="false" show-icon
      title="资料更新与本店排片分开管理"
      description="更新后请到排片管理为本店安排场次。有有效且尚未结束的排片，影片才会进入本店热映；旧片也可以重新排片。" />

    <!-- ===== 同步进度 (进度条/明细在 SyncProgressCard) ===== -->
    <SyncProgressCard :sync="sync" :syncing="syncing" @edit="(id) => openEditor({ id })" />

    <div class="filters cx-glass">
      <el-input
        v-model="filter.title"
        placeholder="按片名搜索"
        clearable
        class="filter-title"
        @input="onKeywordInput"
        @change="applyFilters"
      />
      <el-select
        v-model="filter.status"
        placeholder="市场状态"
        clearable
        class="filter-status"
        @change="applyFilters"
      >
        <el-option
          v-for="o in STATUS_OPTIONS"
          :key="o.value"
          :value="o.value"
          :label="o.label"
        />
      </el-select>
      <el-checkbox v-model="filter.incomplete" @change="applyFilters">只看资料待补</el-checkbox>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-card class="table-card cx-glass">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="海报" width="80">
          <template #default="{ row }">
            <img
              v-if="posterOf(row)"
              :src="posterOf(row)"
              :alt="row.title"
              class="poster-sm"
              loading="lazy"
              @error="(e: Event) => ((e.target as HTMLImageElement).style.visibility = 'hidden')"
            />
            <span v-else class="poster-sm poster-sm--empty">{{ row.title?.charAt(0) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="片名" min-width="150">
          <template #default="{ row }">
            <div class="cell-title">{{ row.title }}</div>
            <div v-if="row.originalTitle" class="cell-sub">{{ row.originalTitle }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" min-width="140">
          <template #default="{ row }">
            <span
              v-for="t in genresOf(row, 2)"
              :key="t"
              class="cx-tag cx-tag--muted genre-tag"
            >
              {{ t }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="本店排片" width="100">
          <template #default="{ row }">
            <span class="cx-tag cx-tag--muted">{{ statusText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="市场状态" width="120"><template #default="{ row }">{{ marketStatusText(row) }}</template></el-table-column>
        <el-table-column label="资料" width="110"><template #default="{ row }">
          <el-tooltip v-if="row.missingFields?.length" :content="'待补：' + row.missingFields.join('、')"><el-tag type="warning" size="small">{{ row.missingFields.length }} 项待补</el-tag></el-tooltip>
          <el-tag v-else type="success" size="small">基础资料完整</el-tag>
          <div v-if="row.missingFields?.includes('时长')" class="cell-sub metadata-blocked">时长待补，暂不能排片</div>
          <div v-if="row.lockedFields?.length" class="cell-sub">{{ row.lockedFields.length }} 项人工确认</div>
        </template></el-table-column>
        <el-table-column prop="area" label="地区" width="90" />
        <el-table-column label="时长" width="90">
          <template #default="{ row }">{{ runtimeText(row) || '—' }}</template>
        </el-table-column>
        <el-table-column label="评分" width="80">
          <template #default="{ row }">
            <span v-if="ratingOf(row)" class="score">{{ ratingOf(row)!.toFixed(1) }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="累计票房" width="110">
          <template #default="{ row }">{{ boxOfficeOf(row) || '—' }}</template>
        </el-table-column>
        <el-table-column prop="releaseDate" label="上映" width="110" />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
            <el-button size="small" :loading="editingId === row.id" @click="openEditor(row)">补录</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :page-size="limit"
        :total="total"
        layout="total, prev, pager, next, jumper"
        class="pager"
        @current-change="load"
      />
    </el-card>

    <MovieMetadataEditor v-if="editMovie" :movie="editMovie" @close="editMovie = null" @saved="metadataSaved" />

    <!-- ===== 影片详情 (展示结构在 MovieDetailDrawer) ===== -->
    <MovieDetailDrawer v-model="detailVisible" :movie="detail" :loading="detailLoading" />
  </div>
</template>

<style scoped lang="scss">
.metadata-blocked { color: var(--el-color-warning); }
.task-buttons { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; .el-button + .el-button { margin-left: 0; } }
.movie-manage { display: flex; flex-direction: column; gap: var(--cx-space-4); }

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;

  .actions { display: flex; gap: var(--cx-space-2); }
  .title { font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
  .subtitle { color: var(--cx-text-muted); font-size: 13px; margin: 4px 0 0; }
  .hint { opacity: 0.7; }
}

.sync-action { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.sync-hint { font-size: 12px; color: var(--cx-text-muted); max-width: 320px; text-align: right; line-height: 1.5; }

/* ===== 片库概况 ===== */
.catalog-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-space-4);
  padding: var(--cx-space-3) var(--cx-space-4);
  border-radius: var(--cx-radius-lg);
}

.catalog-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  color: var(--cx-text-secondary);
}

.catalog-title { font-weight: 700; color: var(--cx-color-primary); margin-right: 4px; }
.catalog-stat b { color: var(--cx-text-primary, #fff); font-weight: 700; }
.catalog-sep { color: var(--cx-text-muted); }
.catalog-built { margin-left: var(--cx-space-2); font-size: 12px; color: var(--cx-text-muted); }

.filters {
  display: flex;
  gap: var(--cx-space-3);
  padding: var(--cx-space-3) var(--cx-space-4);
  border-radius: var(--cx-radius-lg);
}

/* 原内联 style 宽度: Element Plus 组件根元素接收 class, 视觉同 style="width: …" */
.filter-title { width: 240px; }
.filter-status { width: 140px; }

.table-card { padding: var(--cx-space-4); }
.cell-title { font-weight: 600; }
.cell-sub { font-size: 12px; color: var(--cx-text-muted); font-style: italic; }
.genre-tag { margin-right: 4px; }

/* 评分高亮金 → --cx-gold(值即 #fbbf24, 与 Home / MovieCard 全站一致, 零色差) */
.score { color: var(--cx-gold); font-weight: 700; }

.poster-sm {
  width: 48px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--cx-radius-sm);
  background: rgba(255, 255, 255, 0.04);

  &--empty {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    color: var(--cx-color-primary);
    background: linear-gradient(135deg, #1a1f2e 0%, #2a2235 100%);
  }
}

.pager { margin-top: var(--cx-space-4); }
</style>
