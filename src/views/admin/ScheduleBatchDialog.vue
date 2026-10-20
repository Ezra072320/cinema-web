<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import { hallApi, movieApi, scheduleApi, type ScheduleBatchResult } from '@/api';
import type { Hall, Movie } from '@/types';

const emit = defineEmits<{ done: [] }>();
/** 时间轴点空白处带过来的预填: 影厅 + 一行时段. */
const props = defineProps<{ prefill?: { hallId?: number; date?: string; time?: string } }>();

/** 影片选择器严格只列「大陆上映中」(marketStatus=1) —— 待映/资料库老片不进排片候选. */
const movies = ref<Movie[]>([]);
const halls = ref<Hall[]>([]);
const refsLoaded = ref(false);

const form = reactive({
  movieId: undefined as number | undefined,
  hallId: undefined as number | undefined,
  price: 50,
  vipPriceMultiplier: 3,
  couplePriceMultiplier: 2.5,
});

interface Row {
  date: string;
  time: string;
  price?: number;
}

const dateRange = ref<[string, string] | null>(defaultRange());
const timeSlots = ref<string[]>(['10:00', '14:00', '19:00']);
const customTime = ref('');
const rows = ref<Row[]>([]);
const submitting = ref(false);
const result = ref<ScheduleBatchResult | null>(null);

function defaultRange(): [string, string] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const a = new Date();
  const b = new Date();
  b.setDate(b.getDate() + 6);
  return [fmt(a), fmt(b)];
}

const selectedMovie = computed(() => movies.value.find((m) => m.id === form.movieId));
const runtimeMin = computed(() => selectedMovie.value?.runtimeMin ?? 0);

async function loadRefs() {
  if (refsLoaded.value) return;
  try {
    const [h, m] = await Promise.all([
      hallApi.list(),
      movieApi.page({ page: 1, limit: 30, status: 1 }),
    ]);
    halls.value = h;
    movies.value = m.rows;
    refsLoaded.value = true;
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '加载基础数据失败');
  }
}

async function searchMovies(title: string) {
  const r = await movieApi.page({ page: 1, limit: 30, status: 1, title: title || undefined });
  movies.value = r.rows;
}

// ===== 时段生成器 =====

function addSlot(t: string) {
  if (t && !timeSlots.value.includes(t)) {
    timeSlots.value = [...timeSlots.value, t].sort();
  }
  customTime.value = '';
}

function removeSlot(t: string) {
  timeSlots.value = timeSlots.value.filter((s) => s !== t);
}

function generate() {
  if (!dateRange.value?.[0] || !dateRange.value?.[1] || !timeSlots.value.length) {
    ElMessage.warning('请先选日期范围和每日时段');
    return;
  }
  const [from, to] = dateRange.value;
  const added: Row[] = [];
  const existing = new Set(rows.value.map((r) => `${r.date} ${r.time}`));
  for (const d = new Date(`${from}T00:00:00`); `${fmtDate(d)}` <= to; d.setDate(d.getDate() + 1)) {
    for (const t of timeSlots.value) {
      const key = `${fmtDate(d)} ${t}`;
      if (!existing.has(key)) {
        existing.add(key);
        added.push({ date: fmtDate(d), time: t });
      }
    }
  }
  rows.value = [...rows.value, ...added].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  if (!added.length) ElMessage.info('这些时段已都在列表里了');
}

function fmtDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addRow() {
  const d = dateRange.value?.[0] ?? fmtDate(new Date());
  rows.value = [...rows.value, { date: d, time: '19:00' }];
}

function removeRow(i: number) {
  rows.value = rows.value.filter((_, idx) => idx !== i);
}

// ===== 结束时间与批内重叠提示 =====

function endText(r: Row): string {
  if (!runtimeMin.value) return '—';
  const start = new Date(`${r.date}T${r.time}:00`);
  const end = new Date(start.getTime() + (runtimeMin.value + 30) * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const t = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return fmtDate(end) !== r.date ? `次日 ${t}` : t;
}

/** 同批行与行重叠的提示 —— 仅提示, 提交时后端按已插入行裁决跳过. */
function overlapHint(r: Row): string {
  if (!runtimeMin.value) return '';
  const start = new Date(`${r.date}T${r.time}:00`).getTime();
  const end = start + (runtimeMin.value + 30) * 60000;
  const other = rows.value.find(
    (o) => o !== r && start < new Date(`${o.date}T${o.time}:00`).getTime() + (runtimeMin.value + 30) * 60000
      && end > new Date(`${o.date}T${o.time}:00`).getTime(),
  );
  return other ? `与同批 ${other.date} ${other.time} 重叠，提交时会被跳过` : '';
}

// ===== 提交 =====

const canSubmit = computed(
  () => !!form.movieId && !!form.hallId && rows.value.length > 0 && rows.value.length <= 100
    && rows.value.every((r) => r.date && r.time) && !submitting.value,
);

async function submit() {
  submitting.value = true;
  try {
    result.value = await scheduleApi.batchAdd({
      movieId: form.movieId!,
      hallId: form.hallId!,
      price: form.price,
      vipPriceMultiplier: form.vipPriceMultiplier,
      couplePriceMultiplier: form.couplePriceMultiplier,
      sessions: rows.value.map((r) => ({
        startTime: `${r.date}T${r.time}:00`,
        price: r.price,
      })),
    });
    if (result.value.created.length) emit('done');
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '批量排片失败');
  } finally {
    submitting.value = false;
  }
}

function reset() {
  result.value = null;
  rows.value = [];
  form.movieId = undefined;
  form.hallId = undefined;
  dateRange.value = defaultRange();
}

const visible = defineModel<boolean>({ required: true });
watch(visible, (v) => {
  if (v) {
    reset();
    // 时间轴点空白处的快速排片: 预填影厅 + 一行时段
    if (props.prefill?.hallId) form.hallId = props.prefill.hallId;
    if (props.prefill?.date && props.prefill?.time) {
      rows.value = [{ date: props.prefill.date, time: props.prefill.time }];
    }
    loadRefs();
  }
});
</script>

<template>
  <el-dialog v-model="visible" title="批量排片" width="min(1280px, 94vw)" :close-on-click-modal="false">
    <template v-if="!result">
      <div class="form-grid">
        <div class="field">
          <label>影片（仅大陆热映中）</label>
          <el-select
            v-model="form.movieId"
            filterable
            remote
            :remote-method="searchMovies"
            placeholder="搜索热映影片"
            style="width: 100%"
          >
            <el-option
              v-for="m in movies"
              :key="m.id"
              :value="m.id"
              :label="`${m.title} · ${m.runtimeMin || '?'}分钟`"
            />
          </el-select>
        </div>
        <div class="field">
          <label>影厅</label>
          <el-select v-model="form.hallId" placeholder="选择影厅" style="width: 100%">
            <el-option v-for="h in halls" :key="h.id" :value="h.id" :label="`${h.name}（${h.capacity || '未画'}座）`" />
          </el-select>
        </div>
        <div class="field">
          <label>基础票价</label>
          <el-input-number v-model="form.price" :min="1" :max="500" :precision="2" :step="1" style="width: 100%" />
        </div>
        <div class="field">
          <label>VIP 倍率</label>
          <el-input-number v-model="form.vipPriceMultiplier" :min="1" :max="9.99" :precision="2" :step="0.1" style="width: 100%" />
        </div>
        <div class="field">
          <label>情侣倍率</label>
          <el-input-number v-model="form.couplePriceMultiplier" :min="1" :max="9.99" :precision="2" :step="0.1" style="width: 100%" />
        </div>
      </div>

      <div class="generator cx-glass">
        <div class="gen-row">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 260px"
          />
          <span class="gen-label">每日时段：</span>
          <el-tag
            v-for="t in timeSlots"
            :key="t"
            closable
            class="slot-tag"
            @close="removeSlot(t)"
          >{{ t }}</el-tag>
          <el-time-picker
            v-model="customTime"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="自定义"
            style="width: 110px"
            @change="(v: string) => v && addSlot(v)"
          />
          <el-button size="small" :icon="Plus" @click="addSlot(customTime)" :disabled="!customTime">加入</el-button>
          <el-button type="primary" size="small" @click="generate">生成时段</el-button>
        </div>
        <p class="gen-hint">日期范围 × 每日时段生成场次行；同日期同时间自动去重。也可在下方手动添加。</p>
      </div>

      <div class="rows-head">
        <span>共 {{ rows.length }} 场（上限 100）<template v-if="selectedMovie"> · 《{{ selectedMovie.title }}》</template></span>
        <el-button size="small" :icon="Plus" @click="addRow">添加一行</el-button>
      </div>
      <!-- 列宽用 min-width 自适应(早先全写死 width, 加了影片列后总宽超出 780px 对话框,
           删除列被挤进横向滚动区外, 看起来像删除功能没了); 删除列 fixed=right 永远可见. -->
      <el-table :data="rows" size="small" max-height="440" empty-text="点「生成时段」或「添加一行」开始排片">
        <el-table-column label="影片" min-width="140">
          <template #default>
            <span v-if="selectedMovie" class="row-movie">{{ selectedMovie.title }}</span>
            <span v-else class="overlap">未选影片</span>
          </template>
        </el-table-column>
        <el-table-column label="日期" min-width="150">
          <template #default="{ row }">
            <el-date-picker v-model="row.date" type="date" value-format="YYYY-MM-DD" style="width: 140px" />
          </template>
        </el-table-column>
        <el-table-column label="开始" min-width="110">
          <template #default="{ row }">
            <el-time-picker v-model="row.time" format="HH:mm" value-format="HH:mm" style="width: 100px" />
          </template>
        </el-table-column>
        <el-table-column label="结束" min-width="90">
          <template #default="{ row }">
            <span class="end-text">{{ endText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="票价" min-width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.price" :min="1" :max="500" :precision="2" :placeholder="String(form.price)" style="width: 115px" />
          </template>
        </el-table-column>
        <el-table-column label="提示" min-width="180">
          <template #default="{ row }">
            <span class="overlap">{{ overlapHint(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="88" align="center" fixed="right">
          <template #default="{ $index }">
            <el-button size="small" type="danger" text :icon="Delete" @click="removeRow($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="rows.length > 100" class="overlap">超过 100 行上限，请删减后再提交</p>
    </template>

    <template v-else>
      <div class="result">
        <el-result
          :icon="result.created.length ? 'success' : 'warning'"
          :title="`《${selectedMovie?.title ?? '未选影片'}》成功 ${result.created.length} 场${result.skipped.length ? `，跳过 ${result.skipped.length} 场` : ''}`"
        />
        <el-table v-if="result.skipped.length" :data="result.skipped" size="small" max-height="260">
          <el-table-column prop="startTime" label="被跳过的时段" width="200" />
          <el-table-column prop="reason" label="原因" />
        </el-table>
      </div>
    </template>

    <template #footer>
      <template v-if="!result">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">
          提交 {{ rows.length }} 场
        </el-button>
      </template>
      <el-button v-else type="primary" @click="visible = false">完成</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.form-grid {
  display: grid;
  grid-template-columns: 1.6fr 1.2fr 1fr 1fr 1fr;
  gap: var(--cx-space-3);
  margin-bottom: var(--cx-space-4);

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 480px) {
    grid-template-columns: minmax(0, 1fr);
  }

  .field label {
    display: block;
    font-size: 12px;
    color: var(--cx-text-muted);
    margin-bottom: 6px;
  }
}

.generator {
  padding: var(--cx-space-3) var(--cx-space-4);
  border-radius: var(--cx-radius-lg);
  margin-bottom: var(--cx-space-3);

  .gen-row {
    display: flex;
    align-items: center;
    gap: var(--cx-space-2);
    flex-wrap: wrap;
  }

  .gen-label {
    font-size: 13px;
    color: var(--cx-text-secondary);
  }

  .slot-tag {
    margin-right: 2px;
  }

  .gen-hint {
    margin: var(--cx-space-2) 0 0;
    font-size: 12px;
    color: var(--cx-text-muted);
  }
}

.rows-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--cx-space-2);
  font-size: 13px;
  color: var(--cx-text-secondary);
}

.end-text {
  color: var(--cx-text-muted);
  font-variant-numeric: tabular-nums;
}

.row-movie {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
  max-width: 130px;
  vertical-align: bottom;
}

.overlap {
  color: var(--el-color-warning);
  font-size: 12px;
}

.result {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-3);
}
</style>
