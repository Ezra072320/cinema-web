import { ref } from 'vue';
import { captchaApi } from '@/api';

/** 兼容老浏览器: crypto.randomUUID() 不存在时降级. */
function makeTicket(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `tk-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * 票据制验证码(UserLogin / AdminLogin / Register 共用).
 *
 * 流程:
 *   1. 前端生成 UUID 作为 ticket.
 *   2. img src = `/api/captcha/image?ticket=<uuid>` 后端按 ticket 存答案并发图片.
 *   3. 点击图片刷新 = 重新生成 ticket.
 *   4. 提交时 payload() 把 captchaTicket + captchaCode 拼进请求体, 后端原子校验并消费.
 *   5. 图片加载失败(后端未实现该端点) → 静默降级, payload() 返回空对象.
 */
export function useCaptcha() {
  const ticket = ref(makeTicket());
  const url = ref(captchaApi.image(ticket.value));
  const available = ref(true);
  const code = ref('');

  function refresh() {
    ticket.value = makeTicket();
    url.value = captchaApi.image(ticket.value);
    code.value = '';
  }

  /** img onerror: 后端未实现验证码端点 → 降级跳过. */
  function onImageError() {
    available.value = false;
    code.value = '';
  }

  /** 拼进登录/注册请求体的 captcha 字段; 降级或没填时为空对象. */
  function payload(): { captchaTicket: string; captchaCode: string } | Record<string, never> {
    return available.value && code.value
      ? { captchaTicket: ticket.value, captchaCode: code.value }
      : {};
  }

  return { url, available, code, refresh, onImageError, payload };
}
