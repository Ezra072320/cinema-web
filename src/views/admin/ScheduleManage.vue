<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { hallApi, movieApi, scheduleApi } from '@/api';
import { useTablePage } from '@/composables/useTablePage';
import { confirmAction } from '@/composables/useConfirm';
import type { Hall, Movie, Schedule } from '@/types';
import ScheduleBatchDialog from './ScheduleBatchDialog.vue';
import ScheduleTimeline from './ScheduleTimeline.vue';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();

const filter = reactive({
  date: '',
  hallId: undefined as number | undefined,
  movieId: undefined as number | undefined,
  status: undefined as number | undefined,
});

// onMounted 里除 load 外还要先拉影厅/影片字典, 见文件底部 —— 故 immediate: false.
const { list, total, loading, page, limit, load, search } = useTablePage<Schedule>(
  (page, limit) =>
    scheduleApi.adminPage({
      page,
      limit,
      date: filter.date || undefined,
      hallId: filter.hallId,
      movieId: filter.movieId,
      // 不传=全部, 1=正常, 2=已取消
      status: filter.status,
    }),
  { immediate: false },
);

const halls = ref<Hall[]>([]);
const movies = ref<Movie[]>([]);

const dialogVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<Partial<Schedule> & { dateStr?: string; timeStr?: string }>({
  movieId: 0,
  hallId: 0,
  startTime: '',
  price: 50,
  vipPriceMultiplier: 3,
  couplePriceMultiplier: 2.5,
  dateStr: '',
  timeStr: '',
});

/** 倍率只在新排片时能设 —— 票在建票那一刻就把价算好落库了, 改倍率不会回头改已有票. */
const editing = computed(() => !!form.id);

/** 早先各 form-item 只有 required 属性(只画红星), validate() 无规则可跑恒通过. */
const rules: FormRules = {
  movieId: [{ required: true, message: '请选择影片', trigger: 'change' }],
  hallId: [{ required: true, message: '请选择影厅', trigger: 'change' }],
  dateStr: [{ required: true, message: '请选择日期', trigger: 'change' }],
  timeStr: [{ required: true, message: '请选择时间', trigger: 'change' }],
};

/**
 * 影片选择器严格只列「大陆上映中」(marketStatus=1).
 * 早先不过滤时按上映日倒序, 待映片(未来日期)占满前 30 部 —— 选器里全是不能排的待映片.
 * 要给老片/待映片排片, 需先在影片管理调整其市场状态.
 */
async function loadRefs() {
  try {
    halls.value = await hallApi.list();
    const r = await movieApi.page({ page: 1, limit: 30, status: 1 });
    movies.value = r.rows;
  } catch {
    /* ignore */
  }
}

async function searchMovies(title: string) {
  const result = await movieApi.page({ page: 1, limit: 30, status: 1, title: title || undefined });
  movies.value = result.rows;
}

const batchVisible = ref(false);
/** 时间轴点空白处带过来的预填(影厅/日期/时间). */
const batchPrefill = ref<{ hallId?: number; date?: string; time?: string } | undefined>(undefined);
/** 视图: 时间轴(默认) / 列表. */
const view = ref<'timeline' | 'list'>(auth.can('schedule:write') ? 'timeline' : 'list');
const timelineRef = ref<InstanceType<typeof ScheduleTimeline>>();

function onTimelineCreate(prefill: { hallId: number; date: string; time: string }) {
  batchPrefill.value = prefill;
  batchVisible.value = true;
}

/** 操作完成后同时刷新两个视图的数据. */
async function refresh() {
  await load();
  timelineRef.value?.reload();
}

async function openEdit(s: Schedule) {
  if (!movies.value.some((m) => m.id === s.movieId)) {
    const movie = await movieApi.info(s.movieId);
    movies.value = [movie, ...movies.value];
  }
  Object.assign(form, s);
  // 后端下发 "yyyy-MM-dd HH:mm:ss"(GMT+8), 直接字符串切片 —— 不走 Date,
  // 否则 toISOString() 取的是 UTC 日期, 晚于 16:00 的场次会错位一天.
  form.dateStr = s.startTime.slice(0, 10);
  form.timeStr = s.startTime.slice(11, 16);
  dialogVisible.value = true;
}

async function save() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  if (!form.dateStr || !form.timeStr) {
    ElMessage.warning('请选择日期与时间');
    return;
  }
  const startTime = `${form.dateStr}T${form.timeStr}:00`;
  try {
    // 只保留「编辑」: **不发 hallId/price/倍率** —— 后端 DTO 里没这些字段, 发了就是未知字段 400.
    // 票价在建票时定死, 要调价请取消场次后按新价重排. 新增走批量排片向导.
    await scheduleApi.update({
      id: form.id!,
      movieId: form.movieId!,
      startTime,
    });
    ElMessage.success('已更新');
    dialogVisible.value = false;
    await refresh();
  } catch {
    /* 拦截器已弹 */
  }
}

async function remove(s: Schedule) {
  // confirm 取消时是 reject, 早先 .catch(() => null) 之后继续往下走, 点"取消"也照样删.
  const ok = await confirmAction(`确认删除该排片?`, '删除', {
    type: 'error',
    confirmButtonText: '确认删除',
  });
  if (!ok) return;
  try {
    await scheduleApi.delete(s.id);
    ElMessage.success('已删除');
    await refresh();
  } catch {
    /* 拦截器已弹 */
  }
}

/** 取消场次: 停止售票 + 自动全额退款已售订单, 不可恢复. */
async function cancel(s: Schedule) {
  const ok = await confirmAction(
    '取消后将停止售票，并自动全额退款已售订单，不可恢复。确认取消？',
    '取消场次',
    { type: 'warning', confirmButtonText: '确认取消' },
  );
  if (!ok) return;
  try {
    const n = await scheduleApi.cancel(s.id);
    ElMessage.success(n > 0 ? `已取消，自动退款 ${n} 笔订单` : '已取消（无受影响订单）');
    await refresh();
  } catch {
    /* 拦截器已弹 */
  }
}

/** 状态三态: 已取消落库(2); 已放映由 endTime 推导; 其余待放映. */
function statusOf(s: Schedule): { label: string; type: 'danger' | 'info' | 'success' } {
  if (Number(s.status) === 2) return { label: '已取消', type: 'danger' };
  if (s.endTime && new Date(s.endTime.replace(/-/g, '/')).getTime() < Date.now()) {
    return { label: '已放映', type: 'info' };
  }
  return { label: '待放映', type: 'success' };
}
const started = (s: Schedule) =>
  !!s.startTime && new Date(s.startTime.replace(/-/g, '/')).getTime() <= Date.now();

function hallName(id: number) {
  return halls.value.find((h) => h.id === id)?.name ?? `#${id}`;
}
function movieTitle(id: number) {
  return movies.value.find((m) => m.id === id)?.title ?? `#${id}`;
}

onMounted(() => {
  loadRefs();
  load();
});
</script>

<template>
  <div class="schedule-manage">
    <header class="header">
      <div>
        <h1 class="title">排片管理</h1>
        <p class="subtitle">
          {{
            auth.can('schedule:write') ? '拖动色块改开场时间，点击空白快速排片' : '查看影院排片安排'
          }}
        </p>
      </div>
      <div class="header-actions">
        <el-radio-group v-if="auth.can('schedule:write')" v-model="view" size="default">
          <el-radio-button value="timeline">时间轴</el-radio-button>
          <el-radio-button value="list">列表</el-radio-button>
        </el-radio-group>
        <el-button
          v-if="auth.can('schedule:write')"
          type="primary"
          round
          @click="
            batchPrefill = undefined;
            batchVisible = true;
          "
          >+ 批量排片</el-button
        >
      </div>
    </header>

    <!-- ===== 时间轴视图: 单日 · 影厅行甘特 ===== -->
    <template v-if="view === 'timeline'">
      <div class="filters cx-glass">
        <el-date-picker
          v-model="filter.date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="日期（默认今天）"
          style="width: 180px"
          clearable
        />
        <span class="tl-tip">横轴 00:00–24:00；色块宽 = 片长 + 30 分钟清场</span>
      </div>
      <ScheduleTimeline
        ref="timelineRef"
        :date="filter.date"
        @edit="openEdit"
        @cancel="cancel"
        @remove="remove"
        @create="onTimelineCreate"
      />
    </template>

    <!-- ===== 列表视图 ===== -->
    <div v-if="view === 'list'" class="filters cx-glass">
      <el-date-picker
        v-model="filter.date"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="日期"
        style="width: 160px"
        @change="search"
      />
      <el-select
        v-model="filter.hallId"
        placeholder="影厅"
        clearable
        style="width: 160px"
        @change="search"
      >
        <el-option v-for="h in halls" :key="h.id" :value="h.id" :label="h.name" />
      </el-select>
      <el-select
        v-model="filter.movieId"
        placeholder="搜索热映影片"
        clearable
        filterable
        remote
        :remote-method="searchMovies"
        style="width: 200px"
        @change="search"
      >
        <el-option v-for="m in movies" :key="m.id" :value="m.id" :label="m.title" />
      </el-select>
      <el-select
        v-model="filter.status"
        placeholder="全部状态"
        clearable
        style="width: 140px"
        @change="search"
      >
        <el-option :value="1" label="正常" />
        <el-option :value="2" label="已取消" />
      </el-select>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-card v-if="view === 'list'" class="table-card cx-glass">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="影片">
          <!-- 后端已下发 movieName; 本地热映 30 部映射只作兜底(早先只按本地映射显示, 片不在列表里就成 #id) -->
          <template #default="{ row }">{{ row.movieName || movieTitle(row.movieId) }}</template>
        </el-table-column>
        <el-table-column label="影厅">
          <template #default="{ row }">{{ row.hallName || hallName(row.hallId) }}</template>
        </el-table-column>
        <el-table-column prop="startTime" label="开映时间" width="180" />
        <el-table-column prop="price" label="票价" width="100">
          <template #default="{ row }">¥{{ row.price }}</template>
        </el-table-column>
        <el-table-column label="倍率 (VIP/情侣)" width="140">
          <template #default="{ row }">
            {{ (row.vipPriceMultiplier ?? 3).toFixed(2) }}× /
            {{ (row.couplePriceMultiplier ?? 2.5).toFixed(2) }}×
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusOf(row).type" size="small">{{ statusOf(row).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="auth.can('schedule:write')" label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              :disabled="Number(row.status) === 2 || started(row)"
              @click="openEdit(row)"
              >编辑</el-button
            >
            <el-button
              size="small"
              type="warning"
              :disabled="Number(row.status) === 2"
              @click="cancel(row)"
              >取消场次</el-button
            >
            <el-button size="small" type="danger" :disabled="started(row)" @click="remove(row)"
              >删除</el-button
            >
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

    <el-dialog v-model="dialogVisible" title="编辑排片" width="min(460px, 92vw)">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="影片" prop="movieId" required>
          <el-select
            v-model="form.movieId"
            filterable
            remote
            :remote-method="searchMovies"
            placeholder="搜索大陆热映影片"
          >
            <el-option v-for="m in movies" :key="m.id" :value="m.id" :label="m.title" />
          </el-select>
        </el-form-item>
        <el-form-item label="影厅" prop="hallId" required>
          <!-- 编辑时禁用: 换厅会让场次的座位图版本和已建的票对不上, 后端也拒收 hallId.
               要换厅就删掉这个排片重排一个. -->
          <el-select v-model="form.hallId" :disabled="editing">
            <el-option v-for="h in halls" :key="h.id" :value="h.id" :label="h.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" prop="dateStr" required>
          <el-date-picker v-model="form.dateStr" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="时间" prop="timeStr" required>
          <el-time-picker v-model="form.timeStr" format="HH:mm" value-format="HH:mm" />
        </el-form-item>
        <p class="hint tip">
          影厅与票价在编辑时都不能改: 换厅会让座位图版本和已建的票对不上, 票价在建票时就按
          当时价格落库了. 要换厅或调价, 请取消场次后重新排片.
        </p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量排片向导: 新增场次(单场=只有一行的批量); 时间轴点空白处带 prefill -->
    <ScheduleBatchDialog v-model="batchVisible" :prefill="batchPrefill" @done="refresh" />
  </div>
</template>

<style scoped lang="scss">
.schedule-manage {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--cx-space-3);
  }

  .title {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .subtitle {
    color: var(--cx-text-muted);
    font-size: 13px;
    margin: 4px 0 0;
  }
}

.tl-tip {
  font-size: 12px;
  color: var(--cx-text-muted);
  align-self: center;
}

.filters {
  display: flex;
  gap: var(--cx-space-3);
  padding: var(--cx-space-3) var(--cx-space-4);
  border-radius: var(--cx-radius-lg);
  flex-wrap: wrap;
}

.table-card {
  padding: var(--cx-space-4);
}

.pager {
  margin-top: var(--cx-space-4);
}

.hint {
  font-size: 12px;
  color: var(--cx-text-muted);
  line-height: 1.6;

  &.tip {
    margin: 4px 0 0;
    padding-left: 100px;
  }

  &:not(.tip) {
    margin-left: 10px;
  }
}
</style>
