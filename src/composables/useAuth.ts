import { storeToRefs } from 'pinia';
import router from '@/router';
import { http } from '@/api/http';
import { adminApi, userApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import type { LoginPayload, Role, UserProfile } from '@/types';

/**
 * 统一的认证相关行为.
 *
 * 设计要点:
 * - login 接受 role 参数,由调用方明确告诉我们要登录"哪种角色",
 *   避免组件直接 mutate store.role.
 * - register 不再写假 token,只返回后端结果,由组件决定后续动作.
 * - bootstrap 10s 内复用本地 profile,避免每次进入页面都拉一次.
 * - logout 使用 router.replace 而非 location.href,保留 SPA 状态.
 */
export function useAuth() {
  const auth = useAuthStore();
  const { token, role, profile, isAdmin, isLogin, lastFetchedAt } = storeToRefs(auth);

  /** 拉一次当前登录信息(10s 内不会重复). */
  async function bootstrap(force = false): Promise<void> {
    if (!auth.token) return;
    if (!force && Date.now() - auth.lastFetchedAt < 10_000) return;
    try {
      const r = await http.get<UserProfile>(auth.isAdmin ? '/admin/info' : '/user/info');
      auth.setProfile(r);
    } catch {
      /* 拦截器已处理 401;此处吞掉其它业务错误 */
    }
  }

  /**
   * 登录.
   * @param role  'USER' 走 /user/login; 'ADMIN' 走 /admin/login
   * @param remember 暂未启用,留口给后续接入 remember-me.
   */
  async function login(form: LoginPayload, role: Role): Promise<{ ok: boolean; msg?: string }> {
    try {
      const tokenStr =
        role === 'ADMIN'
          ? await adminApi.login(form)
          : await userApi.login(form);
      auth.login({ token: tokenStr, role });
      // 这里不调用 bootstrap: 若 /user/info 因 race / 临时网络异常返回 401,
      // 拦截器会 auth.reset() 把刚写入的 token 清掉,用户表现为"登录后立刻掉线".
      // profile 留给后续受保护页 / App.vue 挂载时拉取,失败再处理.
      return { ok: true };
    } catch (err) {
      const msg = (err as { msg?: string })?.msg ?? '登录失败';
      return { ok: false, msg };
    }
  }

  /**
   * 注册. 后端不返回 token,前端引导用户到登录页.
   * @param form 可选携带 captchaTicket/captchaCode,后端会原子校验
   */
  async function register(
    form: LoginPayload & { age?: number; captchaTicket?: string; captchaCode?: string },
  ): Promise<{ ok: boolean; msg?: string }> {
    try {
      await userApi.register(form);
      return { ok: true };
    } catch (err) {
      return { ok: false, msg: (err as { msg?: string })?.msg ?? '注册失败' };
    }
  }

  /** 修改密码. */
  async function resetPassword(form: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    try {
      await userApi.reset(form);
      auth.reset();
      return { ok: true };
    } catch (err) {
      return { ok: false, msg: (err as { msg?: string })?.msg ?? '修改失败' };
    }
  }

  /** 退出登录. 使用 router.replace 保留 SPA 状态. */
  function logout(redirect: string = '/') {
    auth.reset();
    router.replace(redirect).catch(() => {
      /* 重复跳转会被 router 拒绝 */
    });
  }

  return {
    token,
    role,
    profile,
    isAdmin,
    isLogin,
    lastFetchedAt,
    login,
    register,
    resetPassword,
    logout,
    bootstrap,
  };
}
