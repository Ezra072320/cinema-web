<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router';
import {
  House,
  Film,
  Calendar,
  ChatDotRound,
  User,
  Search,
  SwitchButton,
  Menu,
} from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/composables/useAuth';
import AiAssistantLauncher from '@/components/AiAssistantLauncher.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { logout } = useAuth();

const searchQuery = ref('');
const creditsVisible = ref(false);
const mobileNavVisible = ref(false);

interface MenuItem {
  name: string;
  idx: string;
  label: string;
  icon: typeof House;
  needLogin?: boolean;
}

const menus: MenuItem[] = [
  { name: 'home', idx: '/main', label: '首页', icon: House },
  { name: 'movie-list', idx: '/movie', label: '电影', icon: Film },
  { name: 'hall-list', idx: '/hall', label: '影厅', icon: Calendar },
  { name: 'ai-chat', idx: '/ai', label: 'AI 客服', icon: ChatDotRound },
  { name: 'me-info', idx: '/me/info', label: '我的', icon: User, needLogin: true },
];

const activeName = computed(() => {
  const name = route.name as string | undefined;
  if (!name) return 'home';
  if (name.startsWith('movie') || name.startsWith('hall') || name.startsWith('seats'))
    return name === 'hall-by-movie' ? 'hall-list' : name;
  if (name.startsWith('me')) return 'me-info';
  if (name === 'order-info' || name === 'pay' || name === 'score') return 'movie-list';
  return name;
});

function submitSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  router.push({ name: 'movie-list', query: { q } });
}

function handleLogout() {
  logout('/main');
}
</script>

<template>
  <AiAssistantLauncher v-if="route.name !== 'score' && route.name !== 'me-reviews'" />
  <el-container class="portal">
    <el-affix :offset="0">
      <el-header class="portal-header">
        <!-- 用 RouterLink 而不是 role="link" 的 div: 原生可聚焦, Enter 可激活 -->
        <RouterLink to="/main" class="brand">
          <img src="/logo.svg" alt="" class="brand-logo" />
          <span class="brand-text">猫头鹰影院</span>
        </RouterLink>

        <el-menu
          mode="horizontal"
          :ellipsis="false"
          :default-active="activeName"
          class="nav"
          :router="false"
        >
          <template v-for="m in menus" :key="m.name">
            <el-menu-item
              v-if="!m.needLogin || auth.token"
              :index="m.name"
              @click="router.push(m.idx)"
            >
              <el-icon><component :is="m.icon" /></el-icon>
              <span>{{ m.label }}</span>
            </el-menu-item>
          </template>
        </el-menu>

        <form class="search" role="search" @submit.prevent="submitSearch">
          <el-input
            v-model="searchQuery"
            placeholder="搜索电影、演员、导演"
            aria-label="搜索电影、演员、导演"
            clearable
            size="default"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </form>

        <div class="user-area">
          <template v-if="auth.token">
            <el-dropdown @command="(c: string) => c === 'logout' ? handleLogout() : router.push(c)">
              <span class="user-trigger">
                <el-avatar :size="36" :src="auth.profile?.pic || undefined">
                  {{ auth.profile?.name?.charAt(0) ?? '?' }}
                </el-avatar>
                <span class="name">{{ auth.profile?.name || '已登录' }}</span>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="/me/info">个人资料</el-dropdown-item>
                  <el-dropdown-item command="/me/orders/0">我的订单</el-dropdown-item>
                  <el-dropdown-item command="/me/wants">想看清单</el-dropdown-item>
                  <el-dropdown-item v-if="auth.role === 'USER'" command="/me/notifications">消息通知</el-dropdown-item>
                  <el-dropdown-item divided command="logout">
                    <el-icon><SwitchButton /></el-icon>
                    退出登录
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <template v-else>
            <el-button text @click="router.push('/auth/login')">登录</el-button>
            <el-button type="primary" round @click="router.push('/auth/register')">
              注册
            </el-button>
          </template>
        </div>

        <!-- 移动端: 导航与搜索收进抽屉 -->
        <el-button class="mobile-nav-btn" text aria-label="打开导航菜单" @click="mobileNavVisible = true">
          <el-icon :size="20"><Menu /></el-icon>
        </el-button>
      </el-header>
    </el-affix>

    <el-drawer
      v-model="mobileNavVisible"
      title="导航"
      direction="rtl"
      size="min(280px, 82vw)"
      class="mobile-nav-drawer"
    >
      <nav class="mobile-nav-list" aria-label="主导航">
        <template v-for="m in menus" :key="m.name">
          <RouterLink
            v-if="!m.needLogin || auth.token"
            :to="m.idx"
            class="mobile-nav-item"
            :class="{ active: activeName === m.name }"
            @click="mobileNavVisible = false"
          >
            <el-icon><component :is="m.icon" /></el-icon>
            <span>{{ m.label }}</span>
          </RouterLink>
        </template>
      </nav>

      <form class="mobile-search" role="search" @submit.prevent="submitSearch(); mobileNavVisible = false">
        <el-input
          v-model="searchQuery"
          placeholder="搜索电影、演员、导演"
          aria-label="搜索电影、演员、导演"
          clearable
        />
      </form>

      <div class="mobile-actions">
        <template v-if="auth.token">
          <el-button @click="router.push('/me/info'); mobileNavVisible = false">个人资料</el-button>
          <el-button @click="handleLogout(); mobileNavVisible = false">退出登录</el-button>
        </template>
        <template v-else>
          <el-button @click="router.push('/auth/login'); mobileNavVisible = false">登录</el-button>
          <el-button type="primary" @click="router.push('/auth/register'); mobileNavVisible = false">注册</el-button>
        </template>
      </div>
    </el-drawer>

    <el-main class="portal-main">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </el-main>

    <el-footer class="portal-footer">
      <span>猫头鹰影院 ©2026 · Cinema Web · 选座购票一步到位</span>
      <el-button link size="small" @click="creditsVisible = true">关于与资料来源</el-button>
    </el-footer>
    <el-dialog v-model="creditsVisible" title="关于与资料来源" width="min(460px, 90vw)">
      <p>影片资料来自猫眼、豆瓣和 TMDB，具体来源以影片页面标注为准。本店排片由影院自行安排。</p>
      <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
        <img src="/tmdb-logo.svg" alt="TMDB" width="112" height="20" />
      </a>
      <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </el-dialog>
  </el-container>
</template>

<style scoped lang="scss">
.portal {
  min-height: 100vh;
}

.portal-header {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--cx-space-6);
  height: var(--cx-header-h);
  padding: 0 var(--cx-space-6);
  background: rgba(15, 20, 25, 0.7);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid var(--cx-border);
  z-index: 100;

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    outline: none;

    &:focus-visible {
      outline: 2px solid var(--cx-color-primary);
      outline-offset: 4px;
      border-radius: var(--cx-radius-sm);
    }
  }

  .brand-logo {
    height: 32px;
    width: 32px;
  }

  .brand-text {
    font-weight: 700;
    font-size: 16px;
    background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    white-space: nowrap;
  }

  .nav {
    border-bottom: 0;
    background: transparent;
    --el-menu-hover-bg-color: transparent;
    --el-menu-bg-color: transparent;

    :deep(.el-menu-item) {
      color: var(--cx-text-secondary);
      font-weight: 500;
      transition: color var(--cx-duration-fast) var(--cx-ease);

      &:hover {
        color: var(--cx-text-primary);
      }

      &.is-active {
        color: var(--cx-color-primary);
        background: transparent;

        &::after {
          background: var(--cx-color-primary);
          height: 2px;
          border-radius: 2px;
        }
      }
    }
  }

  .mobile-nav-btn {
    display: none;
    color: var(--cx-text-secondary);
  }

  .search {
    width: 260px;

    :deep(.el-input__wrapper) {
      background: rgba(255, 255, 255, 0.06);
      border-radius: var(--cx-radius-full);
      box-shadow: 0 0 0 1px var(--cx-border) inset;
    }
  }

  .user-area {
    display: flex;
    align-items: center;
    gap: var(--cx-space-2);

    .user-trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 4px 10px 4px 4px;
      border-radius: var(--cx-radius-full);
      transition: background var(--cx-duration-fast) var(--cx-ease);

      &:hover {
        background: rgba(255, 255, 255, 0.06);
      }

      .name {
        font-size: 13px;
        color: var(--cx-text-primary);
        font-weight: 500;
      }
    }
  }
}

.portal-main {
  /* el-main 是列向 flex 的子项, margin: 0 auto 会让它退化成 fit-content,
     页面宽度就跟着内容走(内容一窄整页跟着缩)。显式 width: 100% 撑满后再居中。 */
  width: 100%;
  max-width: var(--cx-content-max-w);
  margin: 0 auto;
  padding: var(--cx-space-6) var(--cx-space-4);
  min-height: calc(100vh - var(--cx-header-h) - 60px);
}

.portal-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--cx-space-3);
  font-size: 12px;
  color: var(--cx-text-muted);
  border-top: 1px solid var(--cx-border);
  letter-spacing: 0.05em;
  padding: var(--cx-space-4);
}

/* 路由过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms var(--cx-ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}

/* 移动端导航抽屉 */
.mobile-nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mobile-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-radius: var(--cx-radius-md);
  color: var(--cx-text-secondary);
  font-size: 14px;

  &:hover {
    background: var(--cx-bg-card-hover);
    color: var(--cx-text-primary);
  }

  &.active {
    color: var(--cx-color-primary);
    background: color-mix(in srgb, var(--cx-color-primary) 10%, transparent);
  }
}

.mobile-search {
  margin: var(--cx-space-4) 0;
}

.mobile-actions {
  display: flex;
  gap: var(--cx-space-2);
  flex-wrap: wrap;
  border-top: 1px solid var(--cx-border);
  padding-top: var(--cx-space-4);
}

/* 响应式: 窄屏隐藏搜索框与横向导航, 收进抽屉 */
@media (max-width: 768px) {
  .portal-header {
    grid-template-columns: auto 1fr auto;
    gap: var(--cx-space-3);
    padding: 0 var(--cx-space-4);

    .search,
    .nav {
      display: none;
    }

    .user-area {
      justify-self: end;
    }

    .mobile-nav-btn {
      display: inline-flex;
      justify-self: end;
    }
  }
}
</style>
