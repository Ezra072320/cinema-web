import { ref, type Ref } from 'vue';
import { streamFetch } from '@/api/http';
import { readAiStream } from '@/utils/ai';
import type { AiAction } from '@/types';

export interface AiStreamHandlers {
  /** 每个 SSE 事件解析出的文本片段(逐段追加到回复). */
  onText: (text: string) => void;
  /** 服务端显式错误帧. */
  onErrorFrame: (message: string) => void;
  onDone: (actions: AiAction[], completed: boolean) => void;
}

/**
 * AI SSE 流式接收: AbortController 生命周期 + 帧切分 + 解码.
 *
 * 分工: 解析纯函数在 utils/ai(decodeAiEvent), 传输与连接在 api/http(streamFetch),
 * 这里管"一次流式会话"的状态流转. 错误**原样抛出**(AbortError / 带 status 的 Error),
 * 文案组装依赖调用方的回复状态(已收到一半内容时提示"回复可能不完整"), 留在调用方.
 */
export function useAiStream(): {
  stream: (question: string, chatId: string, token: string | undefined, handlers: AiStreamHandlers) => Promise<void>;
  abort: () => void;
  connected: Ref<boolean>;
} {
  let controller: AbortController | null = null;

  /** 本次尝试是否已建立流(成功收完或中途断都算 true; 连不上才是 false). */
  const connected = ref(false);

  /** 中断当前流(用户点停止). */
  function abort() {
    controller?.abort();
    controller = null;
  }

  async function stream(
    question: string,
    chatId: string,
    token: string | undefined,
    handlers: AiStreamHandlers,
  ): Promise<void> {
    const request = new AbortController();
    controller = request;
    connected.value = false;
    try {
      const s = await streamFetch(question, chatId, token, request.signal);
      connected.value = true;
      await readAiStream(s, event => {
        // An old request can finish after the user has switched conversations.
        if (request.signal.aborted || controller !== request) return;
        if (event.text) handlers.onText(event.text);
        if (event.error) handlers.onErrorFrame(event.error);
        if (event.completion) handlers.onDone(event.completion.actions, event.completion.completed);
      });
    } finally {
      if (controller === request) controller = null;
    }
  }

  return { stream, abort, connected };
}
