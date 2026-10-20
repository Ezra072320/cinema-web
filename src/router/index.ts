import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    /** 是否需要登录才能访问 */
    auth?: boolean;
    /** 限定角色 */
    role?: 'USER' | 'ADMIN';
    /** 标题 */
    title?: string;
    /** 布局 */
    layout?: 'portal' | 'admin' | 'auth' | 'minimal';
  }
}

const routes: RouteRecordRaw[] = [
  // 用户门户
  {
    path: '/',
    component: () => import('@/layouts/PortalLayout.vue'),
    redirect: '/main',
    children: [
      { path: 'main', name: 'home', component: () => import('@/views/portal/Home.vue'), meta: { title: '首页', layout: 'portal' } },
      { path: 'movie', name: 'movie-list', component: () => import('@/views/portal/Movie.vue'), meta: { title: '电影', layout: 'portal' } },
      { path: 'movie/:id', name: 'movie-detail', component: () => import('@/views/portal/MovieInfo.vue'), meta: { title: '电影详情', layout: 'portal' } },
      { path: 'hall', name: 'hall-list', component: () => import('@/views/portal/Hall.vue'), meta: { title: '影厅排期', layout: 'portal' } },
      { path: 'hall/:movieId', name: 'hall-by-movie', component: () => import('@/views/portal/Hall.vue'), meta: { title: '影厅排期', layout: 'portal' } },
      { path: 'seats/:scheduleId', name: 'seats', component: () => import('@/views/portal/SelectSeats.vue'), meta: { title: '选座', layout: 'portal' } },
      { path: 'pay/:orderId', name: 'pay', component: () => import('@/views/portal/PayOrder.vue'), meta: { title: '支付', layout: 'portal' } },
      { path: 'order/:orderId', name: 'order-info', component: () => import('@/views/portal/OrderInfo.vue'), meta: { title: '订单详情', layout: 'portal' } },
      { path: 'score/:movieId/:orderId', name: 'score', component: () => import('@/views/portal/Score.vue'), meta: { title: '观影评价', layout: 'portal', auth: true, role: 'USER' } },
      { path: 'ai', name: 'ai-chat', component: () => import('@/views/portal/AiChat.vue'), meta: { title: 'AI 客服', layout: 'portal' } },
      {
        path: 'me',
        component: () => import('@/views/portal/me/MeLayout.vue'),
        meta: { auth: true, role: 'USER' },
        children: [
          { path: '', redirect: '/me/info' },
          { path: 'info', name: 'me-info', component: () => import('@/views/portal/me/UserInfo.vue'), meta: { title: '我的资料', auth: true, role: 'USER' } },
          { path: 'orders/:status', name: 'me-orders', component: () => import('@/views/portal/me/Orders.vue'), meta: { title: '我的订单', auth: true, role: 'USER' } },
          { path: 'wants', name: 'me-wants', component: () => import('@/views/portal/me/Wants.vue'), meta: { title: '我的想看', auth: true, role: 'USER' } },
          { path: 'reviews', name: 'me-reviews', component: () => import('@/views/portal/me/Reviews.vue'), meta: { title: '我的评价', auth: true, role: 'USER' } },
        ],
      },
    ],
  },

  // 鉴权页(登录/注册/找回密码)
  {
    path: '/auth',
    component: () => import('@/layouts/AuthLayout.vue'),
    redirect: '/auth/login',
    children: [
      { path: 'login', name: 'login', component: () => import('@/views/auth/UserLogin.vue'), meta: { title: '用户登录', layout: 'auth' } },
      { path: 'register', name: 'register', component: () => import('@/views/auth/Register.vue'), meta: { title: '注册账号', layout: 'auth' } },
      { path: 'reset', name: 'reset', component: () => import('@/views/auth/Reset.vue'), meta: { title: '修改密码', layout: 'auth' } },
      { path: 'adminLogin', name: 'admin-login', component: () => import('@/views/auth/AdminLogin.vue'), meta: { title: '管理员登录', layout: 'auth' } },
    ],
  },

  // 兼容旧路径(避免破坏书签): /login /register /reset /adminLogin 直接跳 /auth/...
  { path: '/login', redirect: '/auth/login' },
  { path: '/register', redirect: '/auth/register' },
  { path: '/reset', redirect: '/auth/reset' },
  { path: '/adminLogin', redirect: '/auth/adminLogin' },

  // 管理后台
  {
    path: '/manage',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/manage/overview',
    meta: { auth: true, role: 'ADMIN' },
    children: [
      { path: 'overview', name: 'admin-overview', component: () => import('@/views/admin/Overview.vue'), meta: { title: '影院概览', auth: true, role: 'ADMIN' } },
      { path: 'users', name: 'admin-users', component: () => import('@/views/admin/UserManage.vue'), meta: { title: '用户管理', auth: true, role: 'ADMIN' } },
      // 影片只读 + 同步. 原「电影类型 / 演员 / 角色」三个手改页面已移除:
      // 它们改的是 actor / movie_role 老表, 而导入器写的是 person / movie_crew 新表,
      // 改了也不影响前台展示, 只会让人误以为能改.
      { path: 'movies', name: 'admin-movies', component: () => import('@/views/admin/MovieManage.vue'), meta: { title: '全部影片', auth: true, role: 'ADMIN' } },
      { path: 'halls', name: 'admin-halls', component: () => import('@/views/admin/HallManage.vue'), meta: { title: '影厅', auth: true, role: 'ADMIN' } },
      { path: 'halls/:id', name: 'admin-hall-info', component: () => import('@/views/admin/HallInfo.vue'), meta: { title: '影厅详情', auth: true, role: 'ADMIN' } },
      { path: 'halls/:id/seats', name: 'admin-hall-seats', component: () => import('@/views/admin/HallSeatEditor.vue'), meta: { title: '座位图编辑', auth: true, role: 'ADMIN' } },
      // 「座位模板」路由已下线: 模板功能孤立(见 AdminLayout 的说明), 页面文件保留但不再挂路由.
      // 直接访问 /manage/seat-templates 会落到 404, 这是预期.
      { path: 'schedules', name: 'admin-schedules', component: () => import('@/views/admin/ScheduleManage.vue'), meta: { title: '排片', auth: true, role: 'ADMIN' } },
      { path: 'orders', name: 'admin-orders', component: () => import('@/views/admin/OrderManage.vue'), meta: { title: '订单管理', auth: true, role: 'ADMIN' } },
      { path: 'revenue', name: 'admin-revenue', component: () => import('@/views/admin/Revenue.vue'), meta: { title: '营收报表', auth: true, role: 'ADMIN' } },
      { path: 'admins', name: 'admin-admins', component: () => import('@/views/admin/AdminList.vue'), meta: { title: '管理员', auth: true, role: 'ADMIN' } },
    ],
  },

  // 错误页
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/Forbidden.vue'),
    meta: { title: '无权访问', layout: 'minimal' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '页面不存在', layout: 'minimal' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // SPA 默认保留滚动位置: 从列表底部进详情页会从中间开始显示.
  // 浏览器前进/后退时恢复原位置, 其余跳转回到顶部.
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

router.beforeEach((to, _, next) => {
  const auth = useAuthStore();
  if (to.meta.title) document.title = `${to.meta.title} · 猫头鹰影院`;

  // 1) 需要登录但未登录 → 跳对应角色登录页
  if (to.meta.auth && !auth.token) {
    // 以目标路由的 role 为准,而不是已登录用户的 role
    // (未登录时 auth.role 必然为 null,无法据此判断该跳到哪个登录页)
    const target = to.meta.role === 'ADMIN' ? 'admin-login' : 'login';
    next({ name: target, query: { redirect: to.fullPath } });
    return;
  }

  // 2) 已登录但角色不对 → 跳 403 提示页(而不是粗暴回首页)
  if (to.meta.role && auth.role && to.meta.role !== auth.role) {
    next({ name: 'forbidden', query: { from: to.fullPath } });
    return;
  }

  next();
});

export default router;
