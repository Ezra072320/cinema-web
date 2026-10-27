<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Delete, Edit } from '@element-plus/icons-vue';
import { hallApi } from '@/api';
import { confirmAction } from '@/composables/useConfirm';
import { HALL_TYPE_LABEL, hallTypeLabel, type Hall } from '@/types';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();

const router = useRouter();

const list = ref<Hall[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const formRef = ref<FormInstance>();
/**
 * type 是数字(1 标准2D / 2 标准3D / 3 IMAX2D / 4 IMAX3D), 别传字符串 —— 后端 hall.type 是 Integer.
 * 没有 capacity: 座位数由座位图算出来, 建厅时不填.
 */
const form = reactive<Partial<Hall>>({ name: '', type: 1 });

/** 早先 form-item 只有 required 属性(只画红星), validate() 无规则可跑恒通过. */
const rules: FormRules = {
  name: [
    { required: true, whitespace: true, message: '请输入影厅名称', trigger: 'blur' },
    { max: 32, message: '影厅名称最多 32 个字符', trigger: 'blur' },
  ],
  type: [{ required: true, message: '请选择影厅类型', trigger: 'change' }],
};

/** 卡片顶部"迷你影厅"装饰的每排点数. 纯视觉(下宽上窄的梯形), 不反映真实座位数. */
const ROW_DOTS = [9, 11, 13];

/** 已配置座位图的厅数 —— 标题栏顺带暴露, 免得逐张卡去找"未画"的. */
const mappedCount = computed(() => list.value.filter((h) => h.capacity > 0).length);

async function load() {
  loading.value = true;
  try {
    list.value = await hallApi.list();
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  Object.assign(form, { id: undefined, name: '', type: 1 });
  dialogVisible.value = true;
}

function openEdit(h: Hall) {
  Object.assign(form, h);
  dialogVisible.value = true;
}

/** 跳到座位图编辑器. 座位图不走这个弹窗 —— 它是草稿/发布工作流, 有自己的页面. */
function openSeatEditor(h: Hall) {
  router.push({ name: 'admin-hall-seats', params: { id: h.id } });
}

/** 只读预览当前生效的座位图(不用进草稿流程就能看一眼现在长什么样). */
function openHallInfo(h: Hall) {
  router.push({ name: 'admin-hall-info', params: { id: h.id } });
}

async function save() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  try {
    if (form.id) {
      await hallApi.update(form as Hall);
      ElMessage.success('已更新');
    } else {
      await hallApi.add(form as Hall);
      ElMessage.success('已新增');
    }
    dialogVisible.value = false;
    await load();
  } catch {
    // 业务错误由 http 拦截器统一弹 toast(D8)
  }
}

async function remove(h: Hall) {
  // confirm 取消时是 reject —— confirmAction 已拦成 false, 取消不会往下走
  const ok = await confirmAction(`确认删除影厅「${h.name}」?`, '删除', {
    type: 'error',
    confirmButtonText: '确认删除',
  });
  if (!ok) return;
  try {
    await hallApi.delete(h.id);
    ElMessage.success('已删除');
    await load();
  } catch {
    // 拦截器已弹
  }
}

onMounted(load);
</script>

<template>
  <div class="hall-manage">
    <header class="header">
      <div>
        <h1 class="title">影厅管理</h1>
        <p class="subtitle">
          共 {{ list.length }} 个影厅
          <template v-if="mappedCount"> · {{ mappedCount }} 个已配置座位图</template>
        </p>
      </div>
      <el-button v-if="auth.can('venue:write')" type="primary" round @click="openAdd"
        >+ 新增影厅</el-button
      >
    </header>

    <el-card class="grid-card cx-glass" v-loading="loading">
      <div v-if="list.length" class="grid">
        <article
          v-for="(h, i) in list"
          :key="h.id"
          class="hall-item cx-card"
          :class="{ 'is-empty': !(h.capacity > 0) }"
          :style="{ '--i': Math.min(i, 8) }"
        >
          <!--
            迷你影厅装饰: 银幕弧 + 3 排座位点. 纯视觉, 不是真实座位图(列表接口
            不下发 seats), 所以 aria-hidden —— 真数据在下方 capacity 里.
          -->
          <div class="hall-visual" aria-hidden="true">
            <div class="screen" />
            <div class="seats">
              <span v-for="(count, r) in ROW_DOTS" :key="r" class="dot-row">
                <i v-for="c in count" :key="c" class="dot" />
              </span>
            </div>
          </div>

          <div class="hall-body">
            <div class="hall-title-row">
              <span class="name">{{ h.name }}</span>
              <!-- IMAX 厅给金色标, 标准厅走灰标 —— 扫一眼能分出档次 -->
              <span class="cx-tag" :class="{ 'cx-tag--muted': Number(h.type) < 3 }">
                {{ hallTypeLabel(h.type) }}
              </span>
            </div>
            <!-- capacity = 0 表示座位图还没画/发布, 不要显示成"0 座"让人以为是坏数据 -->
            <div v-if="h.capacity > 0" class="capacity">
              <span class="num">{{ h.capacity }}</span
              ><span class="unit">座</span>
            </div>
            <div v-else class="warn">未画座位图</div>
          </div>

          <div class="hall-actions">
            <!-- 主操作: 座位图是这个页面最常去的地方 -->
            <el-button
              v-if="auth.can('venue:write')"
              size="small"
              type="primary"
              plain
              @click="openSeatEditor(h)"
            >
              座位图
            </el-button>
            <el-button size="small" plain @click="openHallInfo(h)">预览</el-button>
            <span v-if="auth.can('venue:write')" class="actions-end">
              <el-button size="small" text :icon="Edit" @click="openEdit(h)">编辑</el-button>
              <el-button size="small" text type="danger" :icon="Delete" @click="remove(h)">
                删除
              </el-button>
            </span>
          </div>
        </article>
      </div>
      <EmptyState v-else title="还没有影厅" hint="新建影厅后即可绘制座位图并排片">
        <template #actions>
          <el-button v-if="auth.can('venue:write')" type="primary" round @click="openAdd"
            >+ 新增影厅</el-button
          >
        </template>
      </EmptyState>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑影厅' : '新增影厅'"
      width="min(420px, 92vw)"
      align-center
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="影厅名" prop="name" required>
          <el-input v-model="form.name" placeholder="例: 1号厅" maxlength="32" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <!-- v-for 的 key 是字符串, 必须转回数字, 否则又变成给后端发字符串 -->
          <el-select v-model="form.type">
            <el-option
              v-for="(label, key) in HALL_TYPE_LABEL"
              :key="key"
              :value="Number(key)"
              :label="label"
            />
          </el-select>
        </el-form-item>
        <!-- 座位数不填: 由座位图算出来. 见下方提示. -->
        <el-form-item label="座位数">
          <span class="muted">
            {{ form.id ? `${form.capacity ?? 0} 座（由座位图算得）` : '保存后按座位图自动统计' }}
          </span>
        </el-form-item>
        <el-form-item label="座位详情" v-if="form.seats?.length">
          <span class="muted">
            已配置 {{ form.seats.length }} 个座位. 座位布局请在「座位图」页编辑 ——
            它走草稿/发布流程, 改动前要确认该厅没有未放映的场次.
          </span>
        </el-form-item>
        <p class="hint">
          座位数不用填 —— 保存后点「座位图」画好座位并发布, 系统会按实际画出的座位数自动算.
          过道格不算座位.
        </p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.hall-manage {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;

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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--cx-space-4);
}

/* ===== 影厅卡 ===== */

.hall-item {
  display: flex;
  flex-direction: column;
  padding: var(--cx-space-4);
  padding-top: 0;
  overflow: hidden;
  /* 入场动画之外, hover 的位移/阴影也要有过渡, 否则是瞬跳 */
  transition:
    background var(--cx-duration-base) var(--cx-ease),
    border-color var(--cx-duration-base) var(--cx-ease),
    transform var(--cx-duration-fast) var(--cx-ease),
    box-shadow var(--cx-duration-fast) var(--cx-ease);

  /* 入场: 逐张上浮, 最多叠 8 张的延迟, 厅多了不至于等太久 */
  animation: hall-in var(--cx-duration-slow) var(--cx-ease-out) both;
  animation-delay: calc(var(--i, 0) * 60ms);

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--cx-shadow-md);
  }
}

@keyframes hall-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hall-item {
    animation: none;
  }
}

/* 迷你影厅装饰区 —— 负 margin 让它贴到卡片上边缘, 像卡里嵌了一块小场地 */
.hall-visual {
  margin: 0 calc(var(--cx-space-4) * -1);
  padding: var(--cx-space-5) var(--cx-space-4) var(--cx-space-3);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cx-space-3);
  background: radial-gradient(
    120% 90% at 50% 0%,
    color-mix(in srgb, var(--cx-color-primary) 7%, transparent),
    transparent 70%
  );
}

/* 银幕: 一条金色渐变弧, hover 时打光, 呼应影厅的"放电影"感 */
.screen {
  width: 68%;
  height: 4px;
  border-radius: 50%;
  background: linear-gradient(90deg, transparent, var(--cx-color-primary), transparent);
  opacity: 0.75;
  transition:
    opacity var(--cx-duration-base) var(--cx-ease),
    box-shadow var(--cx-duration-base) var(--cx-ease);
}

.hall-item:hover .screen {
  opacity: 1;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--cx-color-primary) 45%, transparent);
}

.seats {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.dot-row {
  display: flex;
  gap: 5px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: var(--cx-seat-standard-bg);
  border: 1px solid var(--cx-seat-standard-border);
  transition:
    background var(--cx-duration-base) var(--cx-ease),
    border-color var(--cx-duration-base) var(--cx-ease);
}

/* hover 时座位点泛金光 */
.hall-item:hover .dot {
  background: color-mix(in srgb, var(--cx-color-primary) 22%, transparent);
  border-color: color-mix(in srgb, var(--cx-color-primary) 55%, transparent);
}

/* 未画座位图: 银幕熄灭, 座位全变虚线空壳 */
.hall-item.is-empty .screen {
  background: linear-gradient(90deg, transparent, var(--cx-border-strong), transparent);
  opacity: 0.6;
  box-shadow: none;
}

.hall-item.is-empty .dot {
  background: transparent;
  border-style: dashed;
  border-color: var(--cx-seat-aisle-border);
}

.hall-body {
  padding: 0 var(--cx-space-1) var(--cx-space-3);
}

.hall-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-space-2);

  .name {
    font-size: 17px;
    font-weight: 600;
    color: var(--cx-text-primary);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cx-tag {
    flex-shrink: 0;
  }
}

.capacity {
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  gap: 4px;

  .num {
    font-size: 20px;
    font-weight: 700;
    color: var(--cx-color-primary);
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 12px;
    color: var(--cx-text-muted);
  }
}

.warn {
  margin-top: 6px;
  font-size: 12px;
  color: var(--cx-warning);
}

/* 动作栏: 主操作在左, 编辑/删除收成右侧的文字按钮 */
.hall-actions {
  margin-top: auto;
  padding-top: var(--cx-space-3);
  border-top: 1px solid var(--cx-divider);
  display: flex;
  align-items: center;
  gap: 6px;

  .el-button + .el-button {
    margin-left: 0;
  }

  .actions-end {
    margin-left: auto;
    display: flex;
    align-items: center;
  }
}

/* ===== 弹窗 ===== */

.muted {
  color: var(--cx-text-muted);
  font-size: 12px;
}

.hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--cx-text-muted);
  background: color-mix(in srgb, var(--cx-color-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--cx-color-primary) 18%, transparent);
  border-radius: var(--cx-radius-sm);
  padding: 10px 12px;
  margin: 4px 0 0;
}
</style>
