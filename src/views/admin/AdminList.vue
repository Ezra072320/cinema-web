<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Delete, Search } from '@element-plus/icons-vue';
import { adminApi } from '@/api';
import { useTablePage } from '@/composables/useTablePage';
import { confirmAction } from '@/composables/useConfirm';
import { timeParts } from '@/utils/datetime';
import { USER_STATUS, type Admin } from '@/types';

const filter = reactive({ name: '' });

const { list, total, loading, page, limit, load, search } = useTablePage<Admin>((page, limit) =>
  adminApi.listAdmins({ page, limit, name: filter.name || undefined }),
);

const dialogVisible = ref(false);
const dialogMode = ref<'add' | 'edit'>('add');
const formRef = ref<FormInstance>();
const form = reactive({ name: '', password: '', age: 30 });
const saving = ref(false);

/**
 * 管理端账号表单必须真校验: 早先只有 required 属性(只画红星),
 * 空账号/空密码都能提交, 属于安全相关缺陷.
 */
const rules: FormRules = {
  name: [
    { required: true, whitespace: true, message: '请输入管理员账号', trigger: 'blur' },
    { pattern: /^\S{2,16}$/, message: '账号需为 2~16 个非空字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入登录密码', trigger: 'blur' },
    { pattern: /^\S{6,16}$/, message: '密码需为 6~16 个非空字符', trigger: 'blur' },
  ],
};

function openAdd() {
  dialogMode.value = 'add';
  Object.assign(form, { name: '', password: '', age: 30 });
  dialogVisible.value = true;
}

async function save() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    await adminApi.addAdmin({
      name: form.name,
      password: form.password,
      age: form.age,
    });
    ElMessage.success('已新增管理员');
    dialogVisible.value = false;
    await load();
  } catch {
    /* 拦截器已弹 */
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(a: Admin) {
  const next = Number(a.status) === 1 ? 0 : 1;
  // confirm 取消时是 reject, 早先 .catch(() => null) 之后继续往下走, 点"取消"也照样改状态.
  const ok = await confirmAction(
    `确认${next === 0 ? '停用' : '启用'}管理员「${a.name}」?\n停用后该账号无法登录管理后台，历史操作记录保留。`,
    '状态变更',
    { type: 'warning' },
  );
  if (!ok) return;
  try {
    await adminApi.toggleAdmin(a.name, next);
    ElMessage.success('已更新');
    await load();
  } catch {
    /* 拦截器已弹 */
  }
}

async function remove(a: Admin) {
  const ok = await confirmAction(
    `确认删除管理员「${a.name}」?`,
    '删除',
    { type: 'error', confirmButtonText: '确认删除' },
  );
  if (!ok) return;
  try {
    await adminApi.deleteAdmin(a.id);
    ElMessage.success('已删除');
    await load();
  } catch {
    /* 拦截器已弹 */
  }
}
</script>

<template>
  <div class="admin-list">
    <header class="header">
      <div>
        <h1 class="title">管理员</h1>
        <p class="subtitle">共 {{ total }} 位管理员</p>
      </div>
      <el-button type="primary" round @click="openAdd">+ 新增管理员</el-button>
    </header>

    <div class="filters cx-glass">
      <el-input
        v-model="filter.name"
        placeholder="按账号搜索"
        clearable
        style="width: 240px"
        @change="search"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-card class="table-card cx-glass">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="账号" min-width="200">
          <template #default="{ row }">
            <div class="user-cell">
              <!-- 管理员一般没头像, 首字圆标是常态显示; pic 有值就用 -->
              <el-avatar :size="36" :src="row.pic || undefined">{{ row.name?.charAt(0) }}</el-avatar>
              <div class="user-meta">
                <span class="user-name">{{ row.name }}</span>
                <span class="user-id">#{{ row.id }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="年龄" width="80">
          <template #default="{ row }">
            <span class="muted">{{ row.age ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">
            <div v-if="row.createTime" class="time-cell">
              <span class="date">{{ timeParts(row.createTime).date }}</span>
              <span class="time">{{ timeParts(row.createTime).time }}</span>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <span class="status-pill" :class="Number(row.status) === 1 ? 'is-normal' : 'is-off'">
              <i class="dot" />{{ Number(row.status) === 1 ? USER_STATUS.NORMAL : USER_STATUS.DISABLED }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              :type="Number(row.status) === 1 ? 'warning' : 'success'"
              plain
              @click="toggleStatus(row)"
            >
              {{ Number(row.status) === 1 ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" text type="danger" :icon="Delete" @click="remove(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无管理员" hint="点右上角「新增管理员」创建第一个账号" />
        </template>
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

    <el-dialog v-model="dialogVisible" title="新增管理员" width="min(420px, 92vw)" align-center>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="账号" prop="name" required>
          <el-input v-model="form.name" placeholder="登录账号" maxlength="16" />
        </el-form-item>
        <el-form-item label="密码" prop="password" required>
          <el-input v-model="form.password" type="password" show-password placeholder="6~16 位登录密码" />
        </el-form-item>
        <el-form-item label="年龄">
          <el-input-number v-model="form.age" :min="1" :max="120" />
        </el-form-item>
        <p class="hint">新增后可用该账号在管理端登录. 停用的管理员无法登录, 但历史操作记录保留.</p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
/* 单元格样式(头像/时间/状态胶囊)与 UserManage 共用, 在 src/styles/admin-table.scss */
@use '../../styles/admin-table' as *;

.admin-list {
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

.filters {
  display: flex;
  /* 窄屏换行, 不让筛选控件被挤出视口 */
  flex-wrap: wrap;
  gap: var(--cx-space-3);
  padding: var(--cx-space-3) var(--cx-space-4);
  border-radius: var(--cx-radius-lg);
}

.table-card {
  padding: var(--cx-space-4);
}

/* 管理员头像用酒红调(区别于用户管理的金色), 覆盖共享样式里的默认 */
.user-cell .el-avatar {
  background: color-mix(in srgb, var(--cx-color-accent) 24%, transparent);
  color: #e5a8c0;
  border-color: color-mix(in srgb, var(--cx-color-accent) 45%, transparent);
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

.pager {
  margin-top: var(--cx-space-4);
}
</style>
