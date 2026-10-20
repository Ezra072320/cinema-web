<script setup lang="ts">
/**
 * 座位模板管理 (Phase 1).
 *
 * 设计:
 * - 列表展示模板(名称 / 行列 / 单元数 / 创建时间)
 * - 新建: 弹窗填 name + rows × cols, 不传 units 时后端按 rows×cols 全 status=1 生成
 * - 编辑: 跳到"整图覆盖"弹窗, 网格编辑器, 点格切换 status 0/1, 可填 label
 *
 * 关键约束:
 * - 模板是"草图", 改模板不会影响任何已发布的影厅座位图
 * - 单元的 (y, x) 唯一, 不能重复
 * - 过道用 status=0 表达(占行, 让前端网格对齐)
 *
 * 后续 Phase:
 * - Phase 2: 把模板关联到影厅的当前版本
 * - Phase 4: 情侣对 (2 个相邻单元绑一组)
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormInstance } from 'element-plus';
import { seatTemplateApi } from '@/api';
import { confirmAction } from '@/composables/useConfirm';
import type { SeatTemplate, SeatTemplateUnit } from '@/types';

const list = ref<SeatTemplate[]>([]);
const loading = ref(false);

// ===== 新建对话框 =====
const createDialog = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  name: '',
  description: '',
  rowsCount: 8,
  colsCount: 10,
});

async function load() {
  loading.value = true;
  try {
    list.value = await seatTemplateApi.list();
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(createForm, { name: '', description: '', rowsCount: 8, colsCount: 10 });
  createDialog.value = true;
}

async function submitCreate() {
  if (!createFormRef.value) return;
  const valid = await createFormRef.value.validate().catch(() => false);
  if (!valid) return;
  try {
    await seatTemplateApi.create({
      name: createForm.name,
      description: createForm.description || undefined,
      rowsCount: createForm.rowsCount,
      colsCount: createForm.colsCount,
    });
    ElMessage.success('已新建模板');
    createDialog.value = false;
    await load();
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '新建失败');
  }
}

// ===== 详情/编辑对话框 =====
const editDialog = ref(false);
const editing = ref<SeatTemplate | null>(null);
const editGrid = ref<SeatTemplateUnit[]>([]);
const editLoading = ref(false);
const editSaving = ref(false);

async function openEdit(t: SeatTemplate) {
  editLoading.value = true;
  editDialog.value = true;
  try {
    const detail = await seatTemplateApi.detail(t.id);
    editing.value = detail;
    // 用 units 初始化网格, 没有 units 时全 status=1
    if (detail.units && detail.units.length) {
      editGrid.value = detail.units.map((u) => ({
        y: u.y,
        x: u.x,
        status: u.status,
        label: u.label,
      }));
    } else {
      editGrid.value = generateAllAvailable(detail.rowsCount, detail.colsCount);
    }
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '加载模板失败');
    editDialog.value = false;
  } finally {
    editLoading.value = false;
  }
}

function generateAllAvailable(rows: number, cols: number): SeatTemplateUnit[] {
  const out: SeatTemplateUnit[] = [];
  for (let y = 1; y <= rows; y++) {
    for (let x = 1; x <= cols; x++) {
      out.push({ y, x, status: 1 });
    }
  }
  return out;
}

const gridCellMap = computed(() => {
  // y-x 索引便于快速 toggle
  const m = new Map<string, SeatTemplateUnit>();
  for (const u of editGrid.value) m.set(`${u.y}-${u.x}`, u);
  return m;
});

const rows = computed(() => editing.value?.rowsCount ?? 0);
const cols = computed(() => editing.value?.colsCount ?? 0);

function cellOf(y: number, x: number): SeatTemplateUnit | undefined {
  return gridCellMap.value.get(`${y}-${x}`);
}

function toggleStatus(y: number, x: number) {
  const c = cellOf(y, x);
  if (!c) return;
  // 0 <-> 1 来回切, 不切到 3/4 (VIP/无障碍留到后续)
  c.status = c.status === 0 ? 1 : 0;
}

function fillAll() {
  editGrid.value = generateAllAvailable(rows.value, cols.value);
}

function clearAll() {
  for (const u of editGrid.value) u.status = 0;
}

async function submitEdit() {
  if (!editing.value) return;
  editSaving.value = true;
  try {
    await seatTemplateApi.replaceUnits(editing.value.id, editGrid.value);
    ElMessage.success('已保存');
    editDialog.value = false;
    await load();
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '保存失败');
  } finally {
    editSaving.value = false;
  }
}

// ===== 删除 =====
async function remove(t: SeatTemplate) {
  // confirm 取消时是 reject —— confirmAction 已拦成 false, 取消不会往下走
  const ok = await confirmAction(
    `确认删除模板「${t.name}」? 单元数据会一起删, 此操作不可撤销.`,
    '删除',
    { type: 'error', confirmButtonText: '确认删除' },
  );
  if (!ok) return;
  try {
    await seatTemplateApi.delete(t.id);
    ElMessage.success('已删除');
    await load();
  } catch {
    // 拦截器已弹
  }
}

function statusClass(s: number) {
  if (s === 0) return 'cell-cell--empty';
  if (s === 1) return 'cell-cell--standard';
  if (s === 3) return 'cell-cell--vip';
  if (s === 4) return 'cell-cell--accessible';
  return '';
}

onMounted(load);
</script>

<template>
  <div class="seat-template-manage">
    <header class="header">
      <div>
        <h1 class="title">座位模板</h1>
        <p class="subtitle">共 {{ list.length }} 个模板</p>
      </div>
      <el-button type="primary" round @click="openCreate">+ 新建模板</el-button>
    </header>

    <el-card class="grid-card cx-glass" v-loading="loading">
      <div v-if="list.length" class="grid">
        <article v-for="t in list" :key="t.id" class="tpl-item cx-card">
          <div class="info">
            <div class="name">{{ t.name }}</div>
            <div class="meta">
              <span class="cx-tag cx-tag--muted">{{ t.rowsCount }} × {{ t.colsCount }}</span>
              <span class="cx-tag cx-tag--muted">{{ t.unitCount ?? 0 }} 单元</span>
            </div>
            <div v-if="t.description" class="desc">{{ t.description }}</div>
          </div>
          <div class="actions">
            <el-button size="small" @click="openEdit(t)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(t)">删除</el-button>
          </div>
        </article>
      </div>
      <el-empty v-else description="暂无模板, 点右上角新建" />
    </el-card>

    <!-- 新建对话框 -->
    <el-dialog v-model="createDialog" title="新建模板" width="480px" align-center>
      <el-form ref="createFormRef" :model="createForm" label-width="100px">
        <el-form-item label="模板名称" prop="name" required
          :rules="[{ required: true, message: '请输入名称', trigger: 'blur' }]">
          <el-input v-model="createForm.name" placeholder="例: 1号厅标准模板" maxlength="64" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.description" type="textarea" :rows="2"
            placeholder="可选" maxlength="255" />
        </el-form-item>
        <el-form-item label="行数" required>
          <el-input-number v-model="createForm.rowsCount" :min="1" :max="20" />
        </el-form-item>
        <el-form-item label="列数" required>
          <el-input-number v-model="createForm.colsCount" :min="1" :max="30" />
        </el-form-item>
        <p class="hint">
          不传单元时会按 <b>{{ createForm.rowsCount }} × {{ createForm.colsCount }}</b> 全量生成 status=1 的「全可用」模板,
          之后可以进入编辑把任意格子标为过道.
        </p>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">新建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialog" :title="editing ? `编辑模板 - ${editing.name}` : '编辑模板'"
      width="900px" top="5vh" align-center>
      <div v-loading="editLoading">
        <div class="editor-toolbar">
          <span class="legend">
            <span class="dot cell-cell--standard" /> 标准
            <span class="dot cell-cell--empty" /> 过道/留空
          </span>
          <div class="actions">
            <el-button size="small" @click="fillAll">全部填充</el-button>
            <el-button size="small" @click="clearAll">全部清空</el-button>
          </div>
        </div>
        <div class="grid-editor">
          <div class="screen">银幕</div>
          <div class="seat-grid" :style="{ gridTemplateColumns: `repeat(${cols}, 28px)` }">
            <template v-for="y in rows" :key="y">
              <button
                v-for="x in cols"
                :key="`${y}-${x}`"
                class="cell-cell"
                :class="statusClass(cellOf(y, x)?.status ?? 0)"
                :title="`${y}排${x}座`"
                @click="toggleStatus(y, x)"
              >{{ y }}-{{ x }}</button>
            </template>
          </div>
        </div>
        <p class="hint">
          点击格子在「标准 / 过道」之间切换. 模板的行列数不能改, 改大改小请先删除再新建.
        </p>
      </div>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.seat-template-manage {
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    .title { font-size: 24px; font-weight: 600; margin: 0; }
    .subtitle { color: var(--cx-text-muted); font-size: 13px; margin: 4px 0 0; }
  }
}

.grid-card {
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
}

.tpl-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  gap: 12px;
  .info {
    flex: 1;
    min-width: 0;
    .name { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    .meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .desc {
      font-size: 12px;
      color: var(--cx-text-muted);
      line-height: 1.5;
    }
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
}

.hint {
  font-size: 12px;
  color: var(--cx-text-muted);
  margin: 12px 0 0;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  .legend {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--cx-text-secondary);
    .dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
      margin-right: 4px;
    }
  }
}

.grid-editor {
  display: flex;
  flex-direction: column;
  align-items: center;
  .screen {
    width: 60%;
    max-width: 600px;
    height: 24px;
    background: var(--cx-bg-elevated);
    color: var(--cx-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    font-size: 12px;
    margin-bottom: 16px;
  }
}

.seat-grid {
  display: grid;
  gap: 4px;
  max-height: 60vh;
  overflow: auto;
  padding: 8px;
}

/* 座位类型配色统一走 theme.scss 的 --cx-seat-* 令牌, 跟选座页/预览页/座位编辑器一致 */
.cell-cell {
  width: 28px;
  height: 28px;
  font-size: 9px;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  padding: 0;
  transition: transform 0.1s;
  &:hover { transform: scale(1.05); }
  &--standard {
    background: var(--cx-seat-standard-bg);
    border-color: var(--cx-seat-standard-border);
    color: var(--cx-seat-standard-text);
  }
  &--empty {
    background: transparent;
    border: 1px dashed var(--cx-seat-aisle-border);
    color: var(--cx-text-muted);
  }
  &--vip {
    background: var(--cx-seat-vip-bg);
    border-color: var(--cx-seat-vip-border);
    color: var(--cx-seat-vip-text);
  }
  &--accessible {
    background: var(--cx-seat-accessible-bg);
    border-color: var(--cx-seat-accessible-border);
    color: var(--cx-seat-accessible-text);
  }
}
</style>
