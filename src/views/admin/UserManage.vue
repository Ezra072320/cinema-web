<script setup lang="ts">
import { reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, Search } from '@element-plus/icons-vue';
import { adminApi } from '@/api';
import { useTablePage } from '@/composables/useTablePage';
import { confirmAction } from '@/composables/useConfirm';
import { timeParts } from '@/utils/datetime';
import { USER_STATUS, type UserProfile } from '@/types';

const filter = reactive({ name: '', status: undefined as number | undefined });

const { list, total, loading, page, limit, load, search } = useTablePage<UserProfile>((page, limit) =>
  adminApi.userList({
    page,
    limit,
    name: filter.name || undefined,
    status: filter.status,
  }),
);

async function toggleStatus(u: UserProfile) {
  const next = Number(u.status) === 1 ? 0 : 1;
  // confirm 取消时是 reject, 早先 .catch(() => null) 之后继续往下走, 点"取消"也照样改状态.
  const ok = await confirmAction(
    `确认${next === 0 ? '停用' : '启用'}用户「${u.name}」?\n停用后该用户无法登录，已购票订单与观影记录不受影响。`,
    '状态变更',
    { type: 'warning' },
  );
  if (!ok) return;
  try {
    await adminApi.userStatus(u.id, next);
    ElMessage.success('已更新');
    await load();
  } catch {
    /* 拦截器已弹 */
  }
}

async function remove(u: UserProfile) {
  const ok = await confirmAction(
    `确认删除用户「${u.name}」? 该操作不可恢复`,
    '删除用户',
    { type: 'error', confirmButtonText: '确认删除' },
  );
  if (!ok) return;
  try {
    await adminApi.userDelete(u.id);
    ElMessage.success('已删除');
    await load();
  } catch {
    /* 拦截器已弹 */
  }
}

function statusLabel(s: number | string) {
  return USER_STATUS[(Number(s) === 1 ? 'NORMAL' : 'DISABLED') as keyof typeof USER_STATUS];
}
</script>

<template>
  <div class="user-manage">
    <header class="header">
      <div>
        <h1 class="title">用户管理</h1>
        <p class="subtitle">共 {{ total }} 位用户</p>
      </div>
    </header>

    <div class="filters cx-glass">
      <el-input
        v-model="filter.name"
        placeholder="按昵称搜索"
        clearable
        style="width: 240px"
        @change="search"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select
        v-model="filter.status"
        placeholder="状态"
        clearable
        style="width: 140px"
        @change="search"
      >
        <el-option :value="1" label="正常" />
        <el-option :value="0" label="停用" />
      </el-select>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-card class="table-card cx-glass">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="用户" min-width="200">
          <template #default="{ row }">
            <div class="user-cell">
              <!-- 没有头像时用昵称首字兜底, 不留灰圆 -->
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
        <el-table-column label="注册时间" min-width="160">
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
              <i class="dot" />{{ statusLabel(row.status) }}
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
          <EmptyState title="暂无用户" hint="换个筛选条件试试, 或等待新用户注册" />
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
  </div>
</template>

<style scoped lang="scss">
/* 单元格样式(头像/时间/状态胶囊)与 AdminList 共用, 在 src/styles/admin-table.scss */
@use '../../styles/admin-table' as *;

.user-manage {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
}

.header {
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

.pager {
  margin-top: var(--cx-space-4);
}
</style>
