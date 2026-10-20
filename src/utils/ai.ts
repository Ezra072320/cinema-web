/** SSE 支持分包、CRLF、JSON转义换行及显式错误帧。 */
export function decodeAiEvent(raw: string): { text?: string; error?: string } {
  const data = raw.split(/\r?\n/).filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).replace(/^ /, '')).join('\n');
  if (!data || data === '[DONE]') return {};
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'string') return { text: parsed };
    if (parsed && typeof parsed === 'object' && 'type' in parsed && parsed.type === 'error')
      return { error: 'message' in parsed && typeof parsed.message === 'string' ? parsed.message : '回复未完成，请重试' };
    return {};
  } catch {
    return { text: data };
  }
}

/** 模型文字不拥有任意跳转能力。只接受项目真实用户端路径。 */
export function safeAiPath(path: string | null | undefined): string | null {
  // 下一行正则就是要拦控制字符(\x00-\x20), no-control-regex 是误报
  // eslint-disable-next-line no-control-regex
  if (!path || /[\\\u0000-\u0020]/.test(path) || path.startsWith('//')) return null;
  const [pathname] = path.split(/[?#]/);
  return /^\/(?:main|movie(?:\/[1-9]\d*)?|hall(?:\/[1-9]\d*)?|seats\/[1-9]\d*|pay\/[1-9]\d*|order\/[1-9]\d*|score\/[1-9]\d*\/[1-9]\d*|me\/(?:info|wants|orders\/[1-6])|auth\/(?:login|register|reset))$/.test(pathname)
    ? path : null;
}

export function actionDeadline(value: string): number {
  const normalized = value.replace(' ', 'T');
  return Date.parse(/[Zz]$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + '+08:00');
}
