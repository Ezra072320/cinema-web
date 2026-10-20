<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Calendar, CircleCheck, Clock, EditPen, Plus, RefreshLeft, Tickets, User } from '@element-plus/icons-vue';
import { orderApi, userApi, fileApi } from '@/api';
import { useAuth } from '@/composables/useAuth';
import { accountStatusText, isAccountNormal, joinText, totalOrderCount } from '@/utils/user';

const router = useRouter();
const { profile, bootstrap } = useAuth();

const formRef = ref<FormInstance>();
const avatarInput = ref<HTMLInputElement>();
const form = reactive({ name: '', age: 18 });
const saving = ref(false);
const uploading = ref(false);
const editing = ref(false);

const counts = ref<Record<string, number>>({});
const totalOrders = computed(() => totalOrderCount(counts.value));

const rules: FormRules = {
  name: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { min: 2, max: 20, message: '长度 2~20 个字符', trigger: 'blur' },
  ],
  age: [
    { required: true, message: '请输入年龄', trigger: 'blur' },
    { type: 'number', min: 1, max: 120, message: '年龄需在 1~120 之间', trigger: 'blur' },
  ],
};

async function load() {
  await bootstrap(true);
  if (profile.value) {
    form.name = profile.value.name;
    form.age = profile.value.age;
  }
  try {
    counts.value = await orderApi.countByStatus();
  } catch {
    /* 后端未实现就静默 */
  }
}

async function save() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    await userApi.update({ name: form.name, age: form.age });
    ElMessage.success('资料已更新');
    await bootstrap(true);
    editing.value = false;
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onPickAvatar(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !profile.value) return;
  uploading.value = true;
  try {
    const url = await fileApi.upload(file);
    await userApi.changeAvatar(profile.value.id, url);
    await bootstrap(true);
    ElMessage.success('头像已更新');
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '上传失败');
  } finally {
    uploading.value = false;
    // 重置 input 以便重复选择同一文件
    (e.target as HTMLInputElement).value = '';
  }
}

function cancelEdit() {
  editing.value = false;
  if (profile.value) {
    form.name = profile.value.name;
    form.age = profile.value.age;
  }
}

onMounted(load);
</script>

<template>
  <div class="user-info">
    <!-- Hero -->
    <section class="hero cx-card">
      <div class="hero-bg" aria-hidden="true" />
      <div class="hero-inner">
        <div class="avatar-area">
          <el-avatar :size="104" :src="profile?.pic" class="hero-avatar">
            {{ profile?.name?.charAt(0) ?? '?' }}
          </el-avatar>
          <!-- button + 隐藏 input: label 方案无法 Tab 聚焦, 键盘/读屏用户换不了头像 -->
          <button
            class="avatar-upload"
            type="button"
            :class="{ uploading }"
            :disabled="uploading"
            @click="avatarInput?.click()"
          >
            <el-icon><Plus /></el-icon>
            <span>{{ uploading ? '上传中' : '换头像' }}</span>
          </button>
          <input
            ref="avatarInput"
            type="file"
            accept="image/*"
            hidden
            @change="onPickAvatar"
          />
        </div>

        <div class="hero-text">
          <h1 class="hero-name">{{ profile?.name || '—' }}</h1>
          <div class="hero-tags">
            <span class="chip">
              <el-icon><User /></el-icon>
              {{ profile?.age ?? '-' }} 岁
            </span>
            <span class="chip">
              <el-icon><Calendar /></el-icon>
              {{ joinText(profile?.createTime) }}
            </span>
            <span class="chip status" :class="isAccountNormal(profile?.status) ? 'on' : 'off'">
              <span class="dot" />
              {{ accountStatusText(profile?.status) }}
            </span>
          </div>
        </div>

        <button class="hero-cta" type="button" @click="editing = true">
          <el-icon><EditPen /></el-icon>
          <span>编辑资料</span>
        </button>
      </div>
    </section>

    <!-- 统计 -->
    <section class="stats">
      <button class="stat-tile cx-card" type="button" @click="router.push('/me/orders/5')">
        <span class="stat-icon"><el-icon><Tickets /></el-icon></span>
        <span class="stat-meta">
          <span class="stat-value">{{ totalOrders }}</span>
          <span class="stat-label">累计订单</span>
        </span>
      </button>
      <button class="stat-tile cx-card" type="button" @click="router.push('/me/orders/2')">
        <span class="stat-icon"><el-icon><CircleCheck /></el-icon></span>
        <span class="stat-meta">
          <span class="stat-value">{{ Number(counts['2'] || 0) }}</span>
          <span class="stat-label">已支付</span>
        </span>
      </button>
      <button class="stat-tile cx-card" type="button" @click="router.push('/me/orders/1')">
        <span class="stat-icon warn"><el-icon><Clock /></el-icon></span>
        <span class="stat-meta">
          <span class="stat-value">{{ Number(counts['1'] || 0) }}</span>
          <span class="stat-label">待支付</span>
        </span>
      </button>
      <button class="stat-tile cx-card" type="button" @click="router.push('/me/orders/3')">
        <span class="stat-icon"><el-icon><RefreshLeft /></el-icon></span>
        <span class="stat-meta">
          <span class="stat-value">{{ Number(counts['3'] || 0) + Number(counts['4'] || 0) }}</span>
          <span class="stat-label">退款 / 已关</span>
        </span>
      </button>
    </section>

    <!-- 编辑卡(默认收起, 点击编辑后展开) -->
    <section v-if="editing" class="edit-card cx-card">
      <header class="edit-head">
        <h2>编辑个人资料</h2>
        <p>昵称会展示给其他用户;年龄仅用于画像统计, 不会公开展示。</p>
      </header>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="edit-form"
        @submit.prevent="save"
      >
        <el-form-item label="昵称" prop="name">
          <el-input v-model="form.name" placeholder="2~20 个字符" maxlength="20" show-word-limit />
        </el-form-item>

        <el-form-item label="年龄" prop="age">
          <el-input-number v-model="form.age" :min="1" :max="120" />
        </el-form-item>

        <div class="actions">
          <el-button @click="cancelEdit">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">
            保存修改
          </el-button>
        </div>
      </el-form>
    </section>

    <!-- 提示卡(无编辑态) -->
    <section v-else class="tip cx-card">
      <div class="tip-icon"><el-icon><EditPen /></el-icon></div>
      <div>
        <h3>想更新昵称或年龄？</h3>
        <p>点击右上角「编辑资料」即可修改。</p>
      </div>
      <button class="tip-btn" type="button" @click="editing = true">立即编辑</button>
    </section>
  </div>
</template>

<style scoped lang="scss">
.user-info {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-5);
}

/* ===== Hero ===== */
.hero {
  position: relative;
  padding: 0;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 12% 20%, color-mix(in srgb, var(--cx-color-primary) 45%, transparent) 0%, transparent 55%),
    radial-gradient(circle at 88% 80%, color-mix(in srgb, var(--cx-color-accent) 55%, transparent) 0%, transparent 60%),
    linear-gradient(135deg, #1a1208 0%, #1a1f2e 60%, #26121e 100%);
  opacity: 0.95;
}

.hero-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 80% 0%, rgba(255, 255, 255, 0.06) 0%, transparent 40%),
    repeating-linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.025) 0,
      rgba(255, 255, 255, 0.025) 1px,
      transparent 1px,
      transparent 14px
    );
}

.hero-inner {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--cx-space-6);
  padding: var(--cx-space-6) var(--cx-space-6);
}

.avatar-area {
  position: relative;
}

.hero-avatar {
  font-size: 36px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
  color: var(--cx-color-primary-contrast);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border: 3px solid rgba(255, 255, 255, 0.12);
}

.avatar-upload {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--cx-radius-full);
  background: var(--cx-bg-elevated);
  border: 1px solid var(--cx-border-strong);
  color: var(--cx-text-primary);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition:
    background var(--cx-duration-fast) var(--cx-ease),
    color var(--cx-duration-fast) var(--cx-ease),
    border-color var(--cx-duration-fast) var(--cx-ease);

  &:hover {
    background: var(--cx-color-primary);
    color: var(--cx-color-primary-contrast);
    border-color: var(--cx-color-primary);
  }

  &.uploading,
  &:disabled { opacity: 0.6; pointer-events: none; }
}

.hero-text {
  min-width: 0;
}

.hero-name {
  margin: 0 0 var(--cx-space-3);
  font-size: 28px;
  font-weight: 700;
  color: var(--cx-text-primary);
  letter-spacing: -0.02em;
}

.hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--cx-radius-full);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 12px;
  color: var(--cx-text-primary);
  backdrop-filter: blur(6px);

  .el-icon { font-size: 12px; opacity: 0.8; }

  &.status {
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--cx-text-muted);
    }
    &.on .dot {
      background: var(--cx-success);
      box-shadow: 0 0 6px color-mix(in srgb, var(--cx-success) 60%, transparent);
    }
    &.off .dot { background: var(--cx-text-muted); }
  }
}

.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: var(--cx-radius-full);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--cx-text-primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  backdrop-filter: blur(6px);
  transition: all var(--cx-duration-fast) var(--cx-ease);

  &:hover {
    background: var(--cx-color-primary);
    color: var(--cx-color-primary-contrast);
    border-color: var(--cx-color-primary);
    transform: translateY(-1px);
  }
}

/* ===== 统计 ===== */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--cx-space-3);
}

.stat-tile {
  display: flex;
  align-items: center;
  gap: var(--cx-space-3);
  padding: var(--cx-space-4);
  cursor: pointer;
  text-align: left;
  border: 1px solid var(--cx-border);
  background: var(--cx-bg-card);
  transition:
    background var(--cx-duration-fast) var(--cx-ease),
    transform var(--cx-duration-fast) var(--cx-ease),
    border-color var(--cx-duration-fast) var(--cx-ease);

  &:hover {
    background: var(--cx-bg-card-hover);
    border-color: var(--cx-border-strong);
    transform: translateY(-2px);
  }
}

.stat-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cx-radius-md);
  background: color-mix(in srgb, var(--cx-color-primary) 15%, transparent);
  color: var(--cx-color-primary);
  font-size: 18px;

  &.warn { background: color-mix(in srgb, var(--cx-warning) 15%, transparent); color: var(--cx-warning); }
}

.stat-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--cx-text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  color: var(--cx-text-muted);
}

/* ===== 编辑卡 ===== */
.edit-card {
  padding: var(--cx-space-6);
}

.edit-head {
  margin-bottom: var(--cx-space-5);

  h2 {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 600;
    color: var(--cx-text-primary);
  }
  p {
    margin: 0;
    font-size: 13px;
    color: var(--cx-text-muted);
  }
}

.edit-form {
  max-width: 480px;
}

:deep(.el-form-item__label) {
  color: var(--cx-text-secondary);
  font-weight: 500;
}

.actions {
  display: flex;
  gap: var(--cx-space-2);
  justify-content: flex-end;
  margin-top: var(--cx-space-4);
}

/* ===== 提示卡 ===== */
.tip {
  display: flex;
  align-items: center;
  gap: var(--cx-space-4);
  padding: var(--cx-space-5);

  h3 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--cx-text-primary);
  }
  p {
    margin: 0;
    font-size: 13px;
    color: var(--cx-text-muted);
  }
}

.tip-icon {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cx-radius-md);
  background: color-mix(in srgb, var(--cx-color-primary) 12%, transparent);
  color: var(--cx-color-primary);
  font-size: 20px;
  flex-shrink: 0;
}

.tip-btn {
  margin-left: auto;
  padding: 8px 18px;
  border-radius: var(--cx-radius-full);
  background: color-mix(in srgb, var(--cx-color-primary) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--cx-color-primary) 35%, transparent);
  color: var(--cx-color-primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all var(--cx-duration-fast) var(--cx-ease);
  flex-shrink: 0;

  &:hover {
    background: var(--cx-color-primary);
    color: var(--cx-color-primary-contrast);
    border-color: var(--cx-color-primary);
  }
}

/* ===== 响应式 ===== */
@media (max-width: 720px) {
  .hero-inner {
    grid-template-columns: auto 1fr;
    gap: var(--cx-space-3);
  }
  .hero-cta { grid-column: 1 / -1; justify-self: start; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .tip { flex-wrap: wrap; }
  .tip-btn { margin-left: 0; }
}
</style>
