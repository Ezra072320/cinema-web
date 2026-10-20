<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter, RouterView } from 'vue-router';
import { useMediaQuery } from '@vueuse/core';
import {
  House,
  User,
  VideoCamera,
  Calendar,
  Tickets,
  DataAnalysis,
  OfficeBuilding,
  Operation,
  Expand,
  Fold,
  SwitchButton,
} from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/composables/useAuth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { logout } = useAuth();

const collapsed = ref(false);

/**
 * 小屏侧栏改为浮层: 必须默认折叠 + 有遮罩,
 * 否则打开后台时侧栏直接盖住主内容, 且点内容区收不起来.
 */
const isMobile = useMediaQuery('(max-width: 768px)');
watch(isMobile, (m) => { if (m) collapsed.value = true; }, { immediate: true });
watch(() => route.fullPath, () => { if (isMobile.value) collapsed.value = true; });

interface MenuItem {
  idx: string;
  label: string;
  icon: typeof House;
  children?: MenuItem[];
}

const menus: MenuItem[] = [
  { idx: '/manage/overview', label: '影院概览', icon: OfficeBuilding },
  { idx: '/manage/users', label: '用户管理', icon: User },
  { idx: '/manage/admins', label: '管理员', icon: Operation },
  { idx: '/manage/halls', label: '影厅管理', icon: House },
  // 「座位模板」菜单已下线 (2026-10-16): 后端只有模板 CRUD, 没有任何路径能把模板
  // 套用到影厅上(hall_seat_version.template_id 恒为 NULL), 摆个点了没反应的入口
  // 只会让人以为链路断了. 页面文件和接口都留着, 等真要做"套用模板"时再接回来.
  // 影片只剩只读展示 + 同步, 原来的 电影类型 / 演员 / 角色 三个手改页已移除,
  // 所以这里从 sub-menu 拍平成单个菜单项
  { idx: '/manage/movies', label: '影片管理', icon: VideoCamera },
  { idx: '/manage/schedules', label: '排片管理', icon: Calendar },
  { idx: '/manage/orders', label: '订单管理', icon: Tickets },
  { idx: '/manage/revenue', label: '营收', icon: DataAnalysis },
];

const activeIdx = computed(() => route.path);

/**
 * 面包屑.
 *
 * ⚠️ 必须**前缀匹配**, 不能只做 `idx === route.path` 的精确匹配.
 * 子页面(如 `/manage/halls/24/seats` 座位图编辑)在菜单里没有对应项,
 * 精确匹配会整个落空 → 只剩一个不可点的「管理后台」, 从子页面回列表页只能靠浏览器后退,
 * 刷新过页面甚至连后退都没得退. 现在按最长前缀找到所属菜单项, 再补一格当前页标题。
 *
 * 形态: 管理后台 / 影厅管理 / 座位图编辑
 *                     ↑ 可点, 回列表
 */
const breadcrumbs = computed<Array<{ label: string; to?: string }>>(() => {
  const all = menus.flatMap((m) => (m.children ? [m, ...m.children] : [m]));
  const owner = all
    .filter((m) => route.path === m.idx || route.path.startsWith(`${m.idx}/`))
    .sort((a, b) => b.idx.length - a.idx.length)[0];

  const isMenuItself = owner != null && route.path === owner.idx;
  const crumbs: Array<{ label: string; to?: string }> = [];
  // 已经在概览页时, 第一格就别再指回自己了
  crumbs.push(
    route.path === '/manage/overview'
      ? { label: '管理后台' }
      : { label: '管理后台', to: '/manage/overview' },
  );
  if (owner) crumbs.push(isMenuItself ? { label: owner.label } : { label: owner.label, to: owner.idx });
  if (owner && !isMenuItself) {
    const title = route.meta?.title as string | undefined;
    if (title) crumbs.push({ label: title });
  }
  return crumbs;
});

function handleLogout() {
  logout('/auth/adminLogin');
}
</script>

<template>
  <el-container class="admin">
    <div
      v-if="isMobile && !collapsed"
      class="aside-backdrop"
      aria-hidden="true"
      @click="collapsed = true"
    />
    <el-aside
      :width="collapsed ? 'var(--cx-aside-w-collapsed)' : 'var(--cx-aside-w)'"
      class="admin-aside"
    >
      <div class="brand">
        <img src="/logo.svg" alt="" class="brand-logo" />
        <span v-if="!collapsed" class="brand-text">影院后台</span>
      </div>
      <el-menu
        :default-active="activeIdx"
        background-color="transparent"
        text-color="#cbd5e1"
        active-text-color="#c9a96e"
        router
        :collapse="collapsed"
        class="menu"
      >
        <template v-for="m in menus" :key="m.idx">
          <el-sub-menu v-if="m.children" :index="m.idx">
            <template #title>
              <el-icon><component :is="m.icon" /></el-icon>
              <span>{{ m.label }}</span>
            </template>
            <el-menu-item v-for="c in m.children" :key="c.idx" :index="c.idx">
              <el-icon><component :is="c.icon" /></el-icon>
              <template #title>{{ c.label }}</template>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="m.idx">
            <el-icon><component :is="m.icon" /></el-icon>
            <template #title>{{ m.label }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="admin-header">
        <div class="left">
          <el-button
            text
            class="collapse-btn"
            :aria-label="collapsed ? '展开侧栏' : '折叠侧栏'"
            @click="collapsed = !collapsed"
          >
            <el-icon :size="18">
              <component :is="collapsed ? Expand : Fold" />
            </el-icon>
          </el-button>
          <el-breadcrumb separator="/" class="crumb">
            <!-- key 用下标: 菜单名和页面标题可能同名, 用 label 当 key 会重复 -->
            <el-breadcrumb-item v-for="(b, i) in breadcrumbs" :key="i">
              <a v-if="b.to" :href="b.to" @click.prevent="router.push(b.to!)">{{ b.label }}</a>
              <span v-else>{{ b.label }}</span>
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="user-area">
          <el-dropdown @command="(c: string) => c === 'logout' && handleLogout()">
            <span class="trigger">
              <el-avatar :size="32" :src="auth.profile?.pic || undefined">
                {{ auth.profile?.name?.charAt(0) ?? '管' }}
              </el-avatar>
              <span class="name">{{ auth.profile?.name || '管理员' }}</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="admin-main">
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </el-main>
      <el-footer class="admin-footer">影院管理后台 ©2026 · Renovated</el-footer>
    </el-container>
  </el-container>
</template>

<style scoped lang="scss">
.admin {
  height: 100vh;
}

.admin-aside {
  background: var(--cx-bg-elevated);
  color: var(--cx-text-primary);
  border-right: 1px solid var(--cx-border);
  transition: width 220ms var(--cx-ease);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .brand {
    height: var(--cx-header-h);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
    border-bottom: 1px solid var(--cx-border);
    flex-shrink: 0;
  }
  .brand-logo {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }
  .brand-text {
    font-weight: 700;
    background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    white-space: nowrap;
  }

  .menu {
    border-right: 0;
    flex: 1;
    background: transparent;
    --el-menu-hover-bg-color: rgba(255, 255, 255, 0.04);
    --el-menu-bg-color: transparent;
  }
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--cx-bg-elevated);
  border-bottom: 1px solid var(--cx-border);
  height: var(--cx-header-h);
  padding: 0 var(--cx-space-6);

  .left {
    display: flex;
    align-items: center;
    gap: var(--cx-space-4);
  }

  .collapse-btn {
    color: var(--cx-text-secondary);
    padding: 8px;

    &:hover {
      color: var(--cx-color-primary);
    }
  }

  .crumb {
    color: var(--cx-text-secondary);
    font-size: 14px;

    :deep(a) {
      color: var(--cx-text-secondary);
      cursor: pointer;

      &:hover {
        color: var(--cx-color-primary);
      }
    }

    :deep(.el-breadcrumb__item__inner) {
      color: var(--cx-text-secondary);
    }

    :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
      color: var(--cx-text-primary);
      font-weight: 500;
    }
  }

  .user-area {
    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--cx-radius-full);
      transition: background var(--cx-duration-fast) var(--cx-ease);

      &:hover {
        background: rgba(255, 255, 255, 0.06);
      }

      .name {
        font-size: 13px;
        color: var(--cx-text-primary);
      }
    }
  }
}

.admin-main {
  background: var(--cx-bg-base);
  padding: var(--cx-space-6);
  overflow: auto;
}

.admin-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--cx-text-muted);
  background: var(--cx-bg-elevated);
  border-top: 1px solid var(--cx-border);
  height: 40px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms var(--cx-ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.aside-backdrop {
  position: fixed;
  inset: 0;
  z-index: 49;
  background: rgba(0, 0, 0, 0.55);
}

@media (max-width: 768px) {
  .admin-aside {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 50;
  }
  .admin-main {
    padding: var(--cx-space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
