import type { AiAction } from '../types';

export interface AiEvent {
  text?: string;
  error?: string;
  completion?: { completed: boolean; actions: AiAction[] };
}

/** SSE 支持分包、CRLF、JSON转义换行及显式错误帧。 */
export function decodeAiEvent(raw: string): AiEvent {
  const data = raw.split(/\r?\n/).filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).replace(/^ /, '')).join('\n');
  if (!data || data === '[DONE]') return {};
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'string') return { text: parsed };
    if (parsed && typeof parsed === 'object' && 'type' in parsed && parsed.type === 'error')
      return { error: 'message' in parsed && typeof parsed.message === 'string' ? parsed.message : '回复未完成，请重试' };
    if (parsed && typeof parsed === 'object' && 'type' in parsed && parsed.type === 'done') {
      if (!('completed' in parsed) || typeof parsed.completed !== 'boolean' || !('actions' in parsed)
        || !Array.isArray(parsed.actions) || !parsed.actions.every(isAction))
        return { error: '服务单状态暂未同步，请刷新状态核对。' };
      return { completion: { completed: parsed.completed, actions: parsed.actions } };
    }
    return {};
  } catch {
    return { text: data };
  }
}

function isAction(value: unknown): value is AiAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  return ['id', 'type', 'title', 'summary', 'status', 'expiresAt'].every(key => typeof action[key] === 'string')
    && ['PENDING', 'DONE', 'DISMISSED', 'EXPIRED'].includes(String(action.status));
}

/** Consume the actual byte stream, including UTF-8 characters split between packets. */
export async function readAiStream(
  source: ReadableStream<Uint8Array>,
  onEvent: (event: AiEvent) => void,
): Promise<void> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  const consume = (raw: string) => {
    const event = decodeAiEvent(raw);
    if (event.completion) completed = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!completed) throw new Error('连接已中断，回复可能不完整；请核对服务单状态后重试。');
  } finally {
    reader.releaseLock();
  }
}

/** 模型文字不拥有任意跳转能力。只接受项目真实用户端路径。 */
export function safeAiPath(path: string | null | undefined): string | null {
  // 下一行正则就是要拦控制字符(\x00-\x20), no-control-regex 是误报
  // eslint-disable-next-line no-control-regex
  if (!path || /[\\\u0000-\u0020]/.test(path) || path.startsWith('//')) return null;
  const [pathname] = path.split(/[?#]/);
  return /^\/(?:main|movie(?:\/[1-9]\d*)?|hall(?:\/[1-9]\d*)?|seats\/[1-9]\d*|pay\/[1-9]\d*|order\/[1-9]\d*|score\/[1-9]\d*\/[1-9]\d*|me\/(?:info|wants|reviews|orders\/[1-6])|auth\/(?:login|register|reset))$/.test(pathname)
    ? path : null;
}

export function actionDeadline(value: string): number {
  const normalized = value.replace(' ', 'T');
  return Date.parse(/[Zz]$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + '+08:00');
}

/**
 * 多张服务单的展示顺序：待确认优先，其次已办理，最后过期/撤销。
 *
 * 后端按最新在前返回；这里只做“可操作的先看到”的稳定分组，
 * 不合并、不去重 —— 同一会话里的多张服务单必须全部保留。
 */
/**
 * 合并同一会话的服务单快照：按 id 去重，后到的服务单数据覆盖旧状态，
 * 但不会因为晚到的旧快照缺少新服务单，就把已经显示的卡片删掉。
 */
export function mergeAiActions<T extends { id: string; status?: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const a of current) byId.set(a.id, a);
  for (const a of incoming) {
    const previous = byId.get(a.id);
    // A request begun before confirmation can return a stale PENDING snapshot.
    // Completed and dismissed operations never transition back to pending.
    if (previous && previous.status !== 'PENDING' && a.status === 'PENDING') continue;
    byId.set(a.id, a);
  }
  return [...byId.values()];
}

export function orderAiActions<T extends { status: string; expiresAt: string }>(
  actions: readonly T[],
  now = Date.now(),
): T[] {
  const rank = (a: T) => {
    if (a.status === 'PENDING' && actionDeadline(a.expiresAt) > now) return 0;
    if (a.status === 'DONE') return 1;
    return 2;
  };
  return [...actions].sort((a, b) => rank(a) - rank(b));
}
