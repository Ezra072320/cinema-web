<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Calendar } from '@element-plus/icons-vue';
import { hallApi, movieApi, scheduleApi } from '@/api';
import { hallTypeLabel, type Hall, type Schedule } from '@/types';
import DateFilterChips from './DateFilterChips.vue';
import MovieFilterChips from './MovieFilterChips.vue';
import ScheduleCard from './ScheduleCard.vue';

const route = useRoute();

const loading = ref(true);
const error = ref<unknown>(null);
const halls = ref<Hall[]>([]);
const schedulesByHall = ref<Map<number, Schedule[]>>(new Map());
/** 影片筛选预设(来自 /hall/:movieId)时补的片名, 仅作副标题兜底. */
const movieTitle = ref<string | null>(null);
const activeHall = ref<string | number | null>(null);

// ===== 筛选状态 =====

/** 日期筛选: null = 全部; 否则 "yyyy-MM-dd"(与排期 startTime 的日期段同口径). */
const dateFilter = ref<string | null>(null);
/** 影片筛选: null = 全部; 否则 movieId. */
const movieFilter = ref<number | null>(null);

/** 视图模型: 影厅 + 其场次(后端已按 startTime 升序且滤掉已取消/过期, 前端不再排序). */
interface HallSection {
  hall: Hall;
  schedules: Schedule[];
}

/** 影片胶囊选项. count 为「在当前日期筛选下」的场次数(交叉计数). */
interface MovieOption {
  id: number;
  name: string;
  poster?: string;
  count: number;
}

const movieIdParam = computed(() => {
  const id = Number(route.params.movieId);
  return id > 0 ? id : undefined;
});

/** 全部场次的扁平列表(跨厅合并, 不去重). */
const allSchedules = computed<Schedule[]>(() => [...schedulesByHall.value.values()].flat());

const hasActiveFilter = computed(() => dateFilter.value !== null || movieFilter.value !== null);

/** 页面级统一筛选: 每厅按 date+movie 过滤场次(保持 startTime 升序, 不重排). */
const filteredSections = computed<HallSection[]>(() => {
  const d = dateFilter.value;
  const m = movieFilter.value;
  return halls.value.map((hall) => ({
    hall,
    schedules: (schedulesByHall.value.get(hall.id) ?? []).filter(
      (s) =>
        (d === null || s.startTime.slice(0, 10) === d) && (m === null || s.movieId === m),
    ),
  }));
});

/**
 * 可见影厅:
 * - 无筛选 → 全部影厅(含空厅, 展示"该影厅暂无排片");
 * - 有筛选 → 只留 ≥1 条命中场次的厅(零命中的整块隐藏).
 */
const visibleSections = computed<HallSection[]>(() =>
  hasActiveFilter.value
    ? filteredSections.value.filter((x) => x.schedules.length > 0)
    : filteredSections.value,
);

/** 结果摘要 "共 N 场". */
const totalMatched = computed(() =>
  filteredSections.value.reduce((n, x) => n + x.schedules.length, 0),
);

/**
 * 影片胶囊: 按 movieId 聚合(名称/海报取首条非空), count 按日期筛选交叉统计.
 * 排序 count 降序(最热在前), 平手按最早开场.
 */
const allMovies = computed<MovieOption[]>(() => {
  const d = dateFilter.value;
  const byId = new Map<number, { name: string; poster?: string; count: number; first: string }>();
  for (const s of allSchedules.value) {
    let cur = byId.get(s.movieId);
    if (!cur) {
      cur = {
        name: s.movieName || `影片 ${s.movieId}`,
        poster: s.poster || undefined,
        count: 0,
        first: s.startTime,
      };
      byId.set(s.movieId, cur);
    }
    if (!cur.poster && s.poster) cur.poster = s.poster;
    if (s.startTime < cur.first) cur.first = s.startTime;
    if (d === null || s.startTime.slice(0, 10) === d) cur.count += 1;
  }
  return [...byId.entries()]
    .sort(([, a], [, b]) => b.count - a.count || (a.first < b.first ? -1 : 1))
    .map(([id, v]) => ({ id, name: v.name, poster: v.poster, count: v.count }));
});

/** 日期行「全部」胶囊的计数 = 只应用影片筛选(忽略自身). */
const allDateTotal = computed(() => {
  const m = movieFilter.value;
  return m === null
    ? allSchedules.value.length
    : allSchedules.value.filter((s) => s.movieId === m).length;
});

/** 影片行「全部」胶囊的计数 = 只应用日期筛选(忽略自身). */
const allMovieTotal = computed(() => {
  const d = dateFilter.value;
  return d === null
    ? allSchedules.value.length
    : allSchedules.value.filter((s) => s.startTime.slice(0, 10) === d).length;
});

/** 副标题从「当前」影片筛选派生 —— chip 切换后 UI 不说谎(即使 URL 仍是旧的). */
const subtitle = computed(() => {
  if (movieFilter.value !== null) {
    const name = allMovies.value.find((m) => m.id === movieFilter.value)?.name ?? movieTitle.value;
    return name ? `《${name}》在本店的全部场次` : '查看与影片相关的所有场次';
  }
  return '浏览所有影厅今日及近期的场次安排';
});

// ===== 加载 =====

/** 竞态防护: 路由快速切换时, 过期请求的响应不得覆盖新结果. */
let loadSeq = 0;

async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  error.value = null;
  // 重置旧数据 —— 路由切换重载时不能残留上一个影片/全量模式的卡片与筛选
  halls.value = [];
  schedulesByHall.value = new Map();
  movieTitle.value = null;
  activeHall.value = null;
  dateFilter.value = null;
  movieFilter.value = null;
  try {
    // 1. 影厅列表
    const hallList = await hallApi.list();

    // 2. 按厅拉排期 —— 不传 movieId, 拉全量: 影片 chips 要从全量排期聚合,
    //    URL 的 movieId 只作为 chip 预选(见下), 否则 /hall/:movieId 模式 chips 只剩一项.
    //    单厅失败降级为空, 不拖垮整页
    const results = await Promise.all(
      hallList.map((h) => scheduleApi.publicByHall(h.id).catch(() => [] as Schedule[])),
    );

    // 3. 影片筛选预设模式: 只补一次片名(副标题兜底), 失败退到首条排期的 movieName
    let title: string | null = null;
    if (movieIdParam.value) {
      title =
        (await movieApi.info(movieIdParam.value).catch(() => null))?.title ??
        results.flat()[0]?.movieName ??
        null;
    }

    if (seq !== loadSeq) return; // 路由已切换, 丢弃过期结果

    halls.value = hallList;
    const map = new Map<number, Schedule[]>();
    hallList.forEach((h, i) => map.set(h.id, results[i]));
    schedulesByHall.value = map;
    movieTitle.value = title;
    // URL 参数只预选影片 chip, 之后 chip 点击是本地状态(不做 router.replace —— 会触发重载闪烁)
    movieFilter.value = movieIdParam.value ?? null;

    // 4. 默认展开第一个有场次的厅, 其次第一个可见厅
    activeHall.value =
      (visibleSections.value.find((x) => x.schedules.length > 0) ?? visibleSections.value[0])?.hall
        .id ?? null;
  } catch (err) {
    if (seq !== loadSeq) return;
    // 业务失败错误由 http 拦截器统一弹 toast, 页面不重弹(D8) —— 只留错误态 + 重试
    error.value = err;
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

// 替代 onMounted —— /hall 与 /hall/:movieId 共用本组件实例, 参数切换也要重载
watch(movieIdParam, load, { immediate: true });

// ===== 筛选交互 =====

function clearFilters() {
  dateFilter.value = null;
  movieFilter.value = null;
}

// ===== 排片分页(每厅独立页码, 一页 PAGE_SIZE 张卡片) =====

const PAGE_SIZE = 12;
/** hallId → 页码(从 1 起); 缺省即第 1 页. */
const hallPages = ref<Record<number, number>>({});

function pageOf(hallId: number): number {
  return hallPages.value[hallId] ?? 1;
}

/** 页码越界时实际生效的页(筛选后总数变少时). */
function displayPage(hallId: number, list: Schedule[]): number {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  return Math.min(pageOf(hallId), pages);
}

/** 当前页的场次切片; 页码越界自动钳到末页(筛选后总数变少时). */
function pagedSchedules(hallId: number, list: Schedule[]): Schedule[] {
  const p = displayPage(hallId, list);
  return list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
}

function setPage(hallId: number, p: number) {
  hallPages.value = { ...hallPages.value, [hallId]: p };
}

// 筛选变化后各厅回到第 1 页
watch([dateFilter, movieFilter], () => {
  hallPages.value = {};
});

/**
 * 筛选变化后重推导展开厅: 当前展开的厅仍有命中则保持不动(不乱跳),
 * 否则展开第一个有命中的厅, 再退而求其次第一个可见厅.
 * 用 watch 不用 computed —— activeHall 是有副作用的 UI 状态.
 */
watch(visibleSections, (list) => {
  const cur = activeHall.value ?? null;
  if (list.some((x) => x.hall.id === cur && x.schedules.length > 0)) return;
  activeHall.value = (list.find((x) => x.schedules.length > 0) ?? list[0])?.hall.id ?? null;
});
</script>

<template>
  <div class="hall-wrap cx-page">
    <header class="header">
      <h1 class="title">
        <el-icon><Calendar /></el-icon>
        影厅排期
      </h1>
      <p class="subtitle">{{ subtitle }}</p>
    </header>

    <PageSkeleton v-if="loading" :rows="4" :show-header="false" />

    <ErrorState v-else-if="error" :error="error" @retry="load" />

    <EmptyState v-else-if="!halls.length" title="暂无影厅" hint="请稍后再来看看" />

    <template v-else>
      <!-- 筛选条: 有数据就在, 筛选无结果时也不消失(否则用户没法改) -->
      <div class="filters cx-glass" role="group" aria-label="场次筛选">
        <DateFilterChips
          v-model="dateFilter"
          :schedules="allSchedules"
          :filter-movie-id="movieFilter"
          :all-count="allDateTotal"
        />

        <MovieFilterChips
          v-model="movieFilter"
          :movies="allMovies"
          :all-count="allMovieTotal"
        />

        <div class="filter-summary">
          <span class="matched">共 <strong>{{ totalMatched }}</strong> 场</span>
          <el-button v-if="hasActiveFilter" link type="primary" @click="clearFilters">
            清除筛选
          </el-button>
        </div>
      </div>

      <EmptyState v-if="!visibleSections.length" title="筛选无结果" hint="换个日期或影片试试">
        <template #actions>
          <el-button type="primary" @click="clearFilters">清除筛选</el-button>
        </template>
      </EmptyState>

      <el-collapse v-else v-model="activeHall" accordion class="hall-collapse">
        <el-collapse-item
          v-for="(x, i) in visibleSections"
          :key="x.hall.id"
          :name="x.hall.id"
          class="hall-item"
          :style="{ '--i': i }"
        >
          <template #title>
            <div class="hall-title">
              <span class="name">{{ x.hall.name }}</span>
              <span class="cx-tag" :class="{ 'cx-tag--muted': Number(x.hall.type) < 3 }">
                {{ hallTypeLabel(x.hall.type) }}
              </span>
              <!-- capacity 由座位图算得; 0 = 还没画座位图, 不显示成"0 座" -->
              <span class="capacity" :class="{ 'is-warn': !(x.hall.capacity > 0) }">
                {{ x.hall.capacity > 0 ? `${x.hall.capacity} 座` : '未画座位图' }}
              </span>
              <span class="match-badge" :class="{ 'is-zero': !x.schedules.length }">
                {{ x.schedules.length ? `${x.schedules.length} 场` : '无匹配场次' }}
              </span>
            </div>
          </template>

          <div v-if="!x.schedules.length" class="empty-hall">
            <EmptyState title="该影厅暂无排片" hint="换个影厅看看" />
          </div>

          <template v-else>
            <!-- 只做 enter+move 不做 leave: grid 里离场元素仍占位会跳格 -->
            <TransitionGroup name="sched" tag="div" class="schedule-grid">
              <ScheduleCard
                v-for="(s, idx) in pagedSchedules(x.hall.id, x.schedules)"
                :key="s.id"
                :schedule="s"
                :index="idx"
              />
            </TransitionGroup>

            <!-- 内容多时分页(每厅独立页码, 筛选变化自动回第 1 页) -->
            <el-pagination
              v-if="x.schedules.length > PAGE_SIZE"
              class="pager"
              :current-page="displayPage(x.hall.id, x.schedules)"
              :page-size="PAGE_SIZE"
              :total="x.schedules.length"
              layout="prev, pager, next"
              @current-change="(p: number) => setPage(x.hall.id, p)"
            />
          </template>
        </el-collapse-item>
      </el-collapse>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/chip' as *;

.hall-wrap {
  padding-top: var(--cx-space-6);
}

.header {
  margin-bottom: var(--cx-space-6);

  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 8px;
    letter-spacing: -0.02em;
  }

  .subtitle {
    color: var(--cx-text-secondary);
    font-size: 14px;
    margin: 0;
  }
}

/* ===== 影厅手风琴 ===== */

.hall-collapse {
  background: transparent;
  border: none;

  :deep(.el-collapse-item__header) {
    background: var(--cx-bg-card);
    border: 1px solid var(--cx-border);
    border-radius: var(--cx-radius-md);
    padding: 0 var(--cx-space-4);
    margin-bottom: var(--cx-space-2);
    color: var(--cx-text-primary);
    font-weight: 500;

    &:hover {
      background: var(--cx-bg-card-hover);
    }

    &.is-active {
      background: color-mix(in srgb, var(--cx-color-primary) 8%, transparent);
      border-color: color-mix(in srgb, var(--cx-color-primary) 30%, transparent);
    }
  }

  :deep(.el-collapse-item__wrap) {
    background: transparent;
    border: none;
    margin-bottom: var(--cx-space-3);
  }

  :deep(.el-collapse-item__content) {
    padding: var(--cx-space-3) 0 var(--cx-space-5);
  }
}

/* 厅面板入场错峰(同 admin/HallManage 的 hall-in 模式) */
.hall-item {
  animation: hall-in var(--cx-duration-slow) var(--cx-ease-out) both;
  animation-delay: calc(var(--i, 0) * 60ms);
}

@keyframes hall-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

.hall-title {
  display: flex;
  align-items: center;
  gap: 12px;

  .name {
    font-weight: 600;
    font-size: 16px;
  }

  .capacity {
    color: var(--cx-text-muted);
    font-size: 12px;
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: var(--cx-radius-full);

    /* 未画座位图: 虚线弱化, 不当成正常容量展示 */
    &.is-warn {
      color: var(--cx-text-muted);
      border: 1px dashed var(--cx-border);
      background: transparent;
    }
  }

  .match-badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--cx-radius-full);
    background: color-mix(in srgb, var(--cx-color-primary) 12%, transparent);
    color: var(--cx-color-primary);

    &.is-zero {
      background: transparent;
      border: 1px dashed var(--cx-border);
      color: var(--cx-text-muted);
    }
  }
}

.empty-hall {
  padding: var(--cx-space-4) 0;
}

.pager {
  margin-top: var(--cx-space-4);
}

/* ===== 场次卡片网格(单卡样式在 ScheduleCard) ===== */

.schedule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--cx-space-3);
}

/* 无障碍: 系统要求减少动态效果时关掉厅面板入场 */
@media (prefers-reduced-motion: reduce) {
  .hall-item {
    animation: none;
    transition: none;
  }
}
</style>
