<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { Bell, EditPen, Star, SwitchButton, Tickets, User } from '@element-plus/icons-vue';
import { orderApi } from '@/api';
import { useAuth } from '@/composables/useAuth';
import { isAccountNormal, joinText, totalOrderCount } from '@/utils/user';

const router = useRouter();
const route = useRoute();

const { profile, bootstrap, logout } = useAuth();

const counts = ref<Record<string, number>>({});

async function loadCounts() {
  try {
    counts.value = await orderApi.countByStatus();
  } catch {
    /* 后端未实现就静默 */
  }
}

onMounted(async () => {
  await bootstrap();
  loadCounts();
});

// 各状态订单数,status 1 待支付 / 2 已支付 / 3 已退款 / 4 已关闭 / 5 全部
const totalOrders = computed(() => totalOrderCount(counts.value));
const unpaidCount = computed(() => Number(counts.value['1'] || 0));

const menus = computed(() => [
  { idx: 'info', label: '我的资料', desc: '头像、昵称、年龄', icon: User, to: '/me/info' },
  // badge 显示待支付数, 对应订单状态 1; 跳转落在「全部」tab(5)
  {
    idx: 'orders',
    label: '我的订单',
    desc: '查看全部购票记录',
    icon: Tickets,
    to: '/me/orders/5',
    badge: unpaidCount.value,
  },
  { idx: 'wants', label: '想看清单', desc: '关注的待映影片', icon: Star, to: '/me/wants' },
  {
    idx: 'reviews',
    label: '我的评价',
    desc: '查看与管理观影短评',
    icon: EditPen,
    to: '/me/reviews',
  },
  { idx: 'coupons', label: '我的优惠券', desc: '领券与观影抵扣', icon: Tickets, to: '/me/coupons' },
  {
    idx: 'notifications',
    label: '消息通知',
    desc: '订单与售后办理结果',
    icon: Bell,
    to: '/me/notifications',
  },
]);

const activeMenu = computed(() => {
  const name = route.name as string;
  if (name === 'me-info') return 'info';
  if (name === 'me-orders') return 'orders';
  if (name === 'me-wants') return 'wants';
  if (name === 'me-reviews') return 'reviews';
  if (name === 'me-coupons') return 'coupons';
  if (name === 'me-notifications') return 'notifications';
  return 'info';
});

function goEdit() {
  router.push('/me/info');
}
</script>

<template>
  <div class="me-wrap cx-page">
    <aside class="sidebar">
      <!-- 资料卡:头像 / 名字 / 加入时间 / 编辑入口 -->
      <section class="profile-card">
        <div class="profile-cover" aria-hidden="true" />
        <div class="profile-body">
          <div class="avatar-wrap">
            <el-avatar :size="84" :src="profile?.pic" class="avatar">
              {{ profile?.name?.charAt(0) ?? '?' }}
            </el-avatar>
            <span class="status-dot" :class="isAccountNormal(profile?.status) ? 'on' : 'off'" />
          </div>
          <h2 class="profile-name">{{ profile?.name || '未登录' }}</h2>
          <p class="profile-meta">
            <span>{{ profile?.age ?? '-' }} 岁</span>
            <span class="dot" />
            <span>{{ joinText(profile?.createTime) }}</span>
          </p>
          <button class="edit-btn" type="button" @click="goEdit">
            <el-icon><EditPen /></el-icon>
            <span>编辑资料</span>
          </button>
        </div>

        <!-- 数据概览 -->
        <div class="stats">
          <div class="stat">
            <span class="stat-num">{{ totalOrders }}</span>
            <span class="stat-label">累计订单</span>
          </div>
          <div class="stat-sep" />
          <div class="stat" :class="{ alert: unpaidCount > 0 }">
            <span class="stat-num">{{ unpaidCount }}</span>
            <span class="stat-label">待支付</span>
          </div>
        </div>
      </section>

      <!-- 导航 -->
      <nav class="nav" aria-label="我的导航">
        <button
          v-for="m in menus"
          :key="m.idx"
          type="button"
          class="nav-item"
          :class="{ active: activeMenu === m.idx }"
          @click="router.push(m.to)"
        >
          <span class="nav-icon">
            <el-icon><component :is="m.icon" /></el-icon>
          </span>
          <span class="nav-text">
            <span class="nav-label">{{ m.label }}</span>
            <span class="nav-desc">{{ m.desc }}</span>
          </span>
          <span v-if="m.badge" class="nav-badge">{{ m.badge }}</span>
          <span v-else class="nav-arrow">›</span>
        </button>
      </nav>

      <button class="logout" type="button" @click="logout('/main')">
        <el-icon><SwitchButton /></el-icon>
        <span>退出登录</span>
      </button>
    </aside>

    <main class="content">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped lang="scss">
.me-wrap {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: var(--cx-space-6);
  padding-top: var(--cx-space-6);
  align-items: start;
}

.sidebar {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
  position: sticky;
  top: calc(var(--cx-header-h) + 16px);
}

/* ===== 资料卡 ===== */
.profile-card {
  position: relative;
  background: var(--cx-bg-glass);
  border: 1px solid var(--cx-border);
  border-radius: var(--cx-radius-lg);
  overflow: hidden;
  backdrop-filter: blur(14px) saturate(140%);
}

.profile-cover {
  height: 84px;
  background:
    radial-gradient(
      circle at 18% 30%,
      color-mix(in srgb, var(--cx-color-primary) 55%, transparent) 0%,
      transparent 55%
    ),
    radial-gradient(
      circle at 80% 70%,
      color-mix(in srgb, var(--cx-color-accent) 55%, transparent) 0%,
      transparent 60%
    ),
    linear-gradient(135deg, #1a1208 0%, #1a1f2e 60%, #26121e 100%);
}

.profile-body {
  padding: 0 var(--cx-space-5) var(--cx-space-4);
  margin-top: -42px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar-wrap {
  position: relative;
  padding: 4px;
  border-radius: 50%;
  background: var(--cx-bg-base);
  box-shadow: 0 0 0 1px var(--cx-border-strong);
}

.avatar {
  font-weight: 700;
  background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
  color: var(--cx-color-primary-contrast);
}

.status-dot {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--cx-bg-base);
  background: var(--cx-text-muted);

  &.on {
    background: var(--cx-success);
    box-shadow: 0 0 8px color-mix(in srgb, var(--cx-success) 60%, transparent);
  }
  &.off {
    background: var(--cx-text-muted);
  }
}

.profile-name {
  margin: var(--cx-space-3) 0 6px;
  font-size: 18px;
  font-weight: 700;
  color: var(--cx-text-primary);
  letter-spacing: -0.01em;
}

.profile-meta {
  margin: 0 0 var(--cx-space-4);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cx-text-muted);

  .dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--cx-text-muted);
    opacity: 0.6;
  }
}

.edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--cx-radius-full);
  background: color-mix(in srgb, var(--cx-color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cx-color-primary) 35%, transparent);
  color: var(--cx-color-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all var(--cx-duration-fast) var(--cx-ease);

  &:hover {
    background: color-mix(in srgb, var(--cx-color-primary) 22%, transparent);
    border-color: var(--cx-color-primary);
  }
}

.stats {
  display: flex;
  align-items: stretch;
  padding: var(--cx-space-4) var(--cx-space-5);
  border-top: 1px solid var(--cx-divider);
  background: rgba(0, 0, 0, 0.18);
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;

  &.alert .stat-num {
    color: var(--cx-warning);
  }
}

.stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--cx-text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 11px;
  color: var(--cx-text-muted);
  letter-spacing: 0.04em;
}

.stat-sep {
  width: 1px;
  background: var(--cx-divider);
  margin: 0 var(--cx-space-3);
}

/* ===== 导航 ===== */
.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--cx-space-3);
  background: var(--cx-bg-glass);
  border: 1px solid var(--cx-border);
  border-radius: var(--cx-radius-lg);
  backdrop-filter: blur(14px) saturate(140%);
}

.nav-item {
  position: relative;
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: var(--cx-space-3);
  padding: 10px 12px;
  border: 0;
  background: transparent;
  border-radius: var(--cx-radius-md);
  cursor: pointer;
  color: var(--cx-text-secondary);
  text-align: left;
  transition:
    background var(--cx-duration-fast) var(--cx-ease),
    color var(--cx-duration-fast) var(--cx-ease),
    transform var(--cx-duration-fast) var(--cx-ease);

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--cx-text-primary);
  }

  &.active {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--cx-color-primary) 16%, transparent),
      color-mix(in srgb, var(--cx-color-accent) 10%, transparent)
    );
    color: var(--cx-text-primary);

    .nav-icon {
      background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
      color: var(--cx-color-primary-contrast);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--cx-color-primary) 35%, transparent);
    }
    .nav-label {
      color: var(--cx-text-primary);
    }
    .nav-arrow {
      color: var(--cx-color-primary);
    }
  }
}

.nav-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--cx-color-primary);
  font-size: 18px;
  transition: all var(--cx-duration-fast) var(--cx-ease);
}

.nav-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.nav-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--cx-text-primary);
}

.nav-desc {
  font-size: 11px;
  color: var(--cx-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--cx-color-primary-contrast);
  background: var(--cx-warning);
  border-radius: var(--cx-radius-full);
  font-variant-numeric: tabular-nums;
}

.nav-arrow {
  font-size: 22px;
  color: var(--cx-text-muted);
  line-height: 1;
  font-weight: 300;
  transition: transform var(--cx-duration-fast) var(--cx-ease);
}

.nav-item:hover .nav-arrow {
  transform: translateX(2px);
}

/* ===== 退出 ===== */
.logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  background: transparent;
  border: 1px solid var(--cx-border);
  border-radius: var(--cx-radius-md);
  color: var(--cx-text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--cx-duration-fast) var(--cx-ease);

  &:hover {
    color: var(--cx-danger);
    border-color: color-mix(in srgb, var(--cx-danger) 50%, transparent);
    background: color-mix(in srgb, var(--cx-danger) 6%, transparent);
  }
}

/* ===== 内容 ===== */
.content {
  min-width: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms var(--cx-ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ===== 响应式 ===== */
@media (max-width: 960px) {
  .me-wrap {
    grid-template-columns: minmax(0, 1fr);
  }
  .sidebar {
    position: static;
  }
  .nav {
    flex-direction: row;
    overflow-x: auto;
    .nav-item {
      flex-shrink: 0;
      min-width: auto;
      padding: 10px 12px;
    }
    /* 横滑导航里 220px 宽卡片一屏只能露 1.5 个, 移动端隐藏描述行 */
    .nav-desc {
      display: none;
    }
  }
  .logout {
    align-self: stretch;
  }
}
</style>
