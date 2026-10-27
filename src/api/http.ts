import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import type { R } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

/**
 * 集中管理的 axios 实例.
 *
 * 设计要点:
 * 1. 通过模块扩展将拦截器返回的 {@link R}<T> 直接作为泛型 T,
 *    调用方写 `http.get<Movie>(...)` 后 `r` 就是 `Movie`,无需再 `.data`.
 * 2. 401 用 SPA 内 router 跳转,保留 redirect 查询参数,避免 location.href 丢失状态.
 * 3. 流式 SSE 不用 axios(浏览器侧 axios 不支持真流),单独暴露 {@link streamFetch}.
 */
export const http = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
});

http.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = auth.token;
  }
  return config;
});

http.interceptors.response.use(
  async (resp) => {
    if (resp.config.responseType === 'blob' && resp.data instanceof Blob) {
      const type = String(resp.headers['content-type'] ?? resp.data.type);
      if (type.includes('application/json') || type.includes('+json')) {
        try { resp.data = JSON.parse(await resp.data.text()); }
        catch { resp.data = { msg: '下载响应格式异常' }; }
        const failure = { msg: resp.data?.msg ?? '未收到有效的 Excel 文件，请重试' };
        if (!resp.config.quiet) ElMessage.error(failure.msg);
        return Promise.reject(failure);
      } else if (type.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
        return resp.data;
      } else {
        const failure = { msg: '未收到有效的 Excel 文件，请重试' };
        if (!resp.config.quiet) ElMessage.error(failure.msg);
        return Promise.reject(failure);
      }
    }
    const data = resp.data as R;
    // 后端约定: code=1 为成功,data 字段才是真正的业务数据.
    // 必须返回 data.data —— 否则调用方拿到的就是 {code,msg,data} 整个 R 包装,
    // 例如登录接口会把 JSON 对象当 JWT 字符串塞进 Authorization,后续 401 自动掉线.
    if (data && data.code === 1) {
      return data.data as unknown as typeof resp.data;
    }
    if (!resp.config.quiet) ElMessage.error(data?.msg ?? '服务异常');
    return Promise.reject(data);
  },
  async (err) => {
    if (err.response?.data instanceof Blob) {
      try { err.response.data = JSON.parse(await err.response.data.text()); }
      catch { err.response.data = { msg: '下载失败，请稍后重试' }; }
    }
    if (err.config?.quiet && err.response?.status !== 401) return Promise.reject(err);
    if (err.response?.status === 401) {
      const auth = useAuthStore();
      // 先保存 role,reset() 会清掉 role.
      const currentRole = auth.role;
      const fromAdminArea = currentRole === 'ADMIN';
      auth.reset();
      ElMessage.warning('登录已过期,请重新登录');
      // 动态 import 避免循环依赖
      const { default: router } = await import('@/router');
      const current = router.currentRoute.value;
      const inManage = current.path.startsWith('/manage');
      const target = fromAdminArea || inManage ? 'admin-login' : 'login';
      if (current.name !== target) {
        router.replace({ name: target, query: { redirect: current.fullPath } });
      }
    } else if (err.response?.status === 429) {
      const seconds = Number(err.response.headers?.['retry-after']) || 2;
      ElMessage.warning(`访问人数较多，请在${seconds}秒后重试；订单结果可在“我的订单”中查询`);
    } else if (err.response?.status === 503) {
      ElMessage.warning(err.response.data?.msg ?? '服务暂不可用，请稍后重试');
    } else if (!axios.isCancel(err)) {
      ElMessage.error(err.response?.data?.msg ?? err.message ?? '网络异常');
    }
    return Promise.reject(err);
  },
);

/**
 * 让 axios 的链式方法直接返回泛型 T,而不是 AxiosResponse<T>.
 * 拦截器里我们返回的就是 R<T>,所以 T 应该理解为"已经被剥壳的 data".
 */
declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Caller renders recovery/fallback state instead of a global toast. Authentication still applies. */
    quiet?: boolean;
  }
  export interface AxiosInstance {
    request<T = unknown>(config: AxiosRequestConfig): Promise<T>;
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
    delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
    head<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
    options<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
    post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
    put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
    patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  }
}

/**
 * 流式对话(SSE)专用:不走 axios(浏览器 axios 无法真正流式).
 * 调用方拿到 ReadableStream<Uint8Array>,自行按事件解析.
 *
 * 契约(2026-10-19 定稿): `POST /ai/chat`,body `{question, chatId}`,
 * 响应 `text/event-stream`. 每条事件 `data: "<JSON 字符串字面量>"` ——
 * JSON.parse 得到一个 token(换行/引号已被转义,不会撕开 SSE 帧);
 * type=error对象报告失败；type=done对象携带服务单快照，表示本轮已收尾。
 * 缺少done的连接关闭按中断处理，不将不完整回复标记成成功。
 */
export async function streamFetch(
  question: string,
  chatId: string,
  token: string | undefined,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const resp = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify({ question, chatId }),
    signal,
  });
  if (!resp.ok) {
    const data = (await resp.json().catch(() => null)) as { msg?: string } | null;
    const error = new Error(data?.msg ?? '客服连接失败') as Error & { status?: number };
    error.status = resp.status;
    throw error;
  }
  if (!resp.body) {
    throw new Error(`SSE connect failed: ${resp.status}`);
  }
  if (!resp.headers.get('content-type')?.includes('text/event-stream')) {
    const data = (await resp.json().catch(() => null)) as { msg?: string } | null;
    throw new Error(data?.msg ?? '客服暂不可用，请稍后重试');
  }
  return resp.body;
}
