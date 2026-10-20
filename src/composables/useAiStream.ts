import { ref, type Ref } from 'vue';
import { streamFetch } from '@/api/http';
import { decodeAiEvent } from '@/utils/ai';

export interface AiStreamHandlers {
  /** 每个 SSE 事件解析出的文本片段(逐段追加到回复). */
  onText: (text: string) => void;
  /** 服务端显式错误帧. */
  onErrorFrame: (message: string) => void;
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
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const consume = (raw: string) => {
      const event = decodeAiEvent(raw);
      if (event.text) handlers.onText(event.text);
      if (event.error) handlers.onErrorFrame(event.error);
    };
    try {
      const s = await streamFetch(question, chatId, token, request.signal);
      connected.value = true;
      reader = s.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE 帧以空行分隔; 服务端可能分包, 缓冲到完整帧再解析
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          consume(buffer.slice(0, boundary.index));
          buffer = buffer.slice(boundary.index + boundary[0].length);
        }
      }
      buffer += decoder.decode();
      consume(buffer);
    } finally {
      reader?.releaseLock();
    }
  }

  return { stream, abort, connected };
}
