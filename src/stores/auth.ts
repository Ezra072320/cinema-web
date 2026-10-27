import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Role, UserProfile } from '@/types';

/**
 * 统一认证 store — 替代原项目三套 token store:
 * - userToken.js / adminToken.js  → 合并为 auth.token + auth.role
 * - userInfo.js / adminInfo.js    → 合并为 auth.profile
 *
 * 持久化策略:
 * - token / role / profile 写入 localStorage,刷新可恢复登录态.
 * - lastFetchedAt 不持久化,仅用于 bootstrap 去重.
 */
export const useAuthStore = defineStore(
  'auth',
  () => {
    const token = ref<string>('');
    const role = ref<Role | null>(null);
    const profile = ref<UserProfile | null>(null);
    const permissions = ref<string[]>([]);
    const adminRoles = ref<string[]>([]);
    const accessLoaded = ref(false);
    let accessRequest: Promise<void> | undefined;

    function can(permission: string) {
      return role.value === 'ADMIN' && accessLoaded.value && permissions.value.includes(permission);
    }

    async function refreshAccess() {
      if (role.value !== 'ADMIN' || !token.value) return;
      if (accessRequest) return accessRequest;
      const requestedToken = token.value;
      accessRequest = (async () => {
        try {
          const { accessApi } = await import('@/api/access');
          const access = await accessApi.mine();
          if (token.value !== requestedToken) return;
          permissions.value = access.permissions;
          adminRoles.value = access.roles;
          accessLoaded.value = true;
        } catch (e) {
          permissions.value = [];
          adminRoles.value = [];
          accessLoaded.value = false;
          throw e;
        } finally {
          accessRequest = undefined;
        }
      })();
      return accessRequest;
    }
    /** 最近一次 bootstrap 时间(ms),用于 10s 内去重 */
    const lastFetchedAt = ref<number>(0);

    const isLogin = computed(() => !!token.value);
    const isAdmin = computed(() => role.value === 'ADMIN');

    function login(payload: { token: string; role: Role; profile?: UserProfile }) {
      permissions.value = [];
      adminRoles.value = [];
      accessLoaded.value = false;
      token.value = payload.token;
      role.value = payload.role;
      if (payload.profile) profile.value = payload.profile;
    }

    /** 单独设置角色,避免组件直接 mutate. */
    function setRole(r: Role | null) {
      role.value = r;
    }

    function setProfile(p: UserProfile | null) {
      profile.value = p;
      lastFetchedAt.value = Date.now();
    }

    function reset() {
      token.value = '';
      role.value = null;
      profile.value = null;
      lastFetchedAt.value = 0;
      permissions.value = [];
      adminRoles.value = [];
      accessLoaded.value = false;
    }

    return {
      token,
      role,
      profile,
      permissions,
      adminRoles,
      accessLoaded,
      can,
      refreshAccess,
      lastFetchedAt,
      isLogin,
      isAdmin,
      login,
      setRole,
      setProfile,
      reset,
    };
  },
  {
    persist: {
      key: 'cinema-auth',
      storage: localStorage,
      pick: ['token', 'role', 'profile'],
    },
  },
);
