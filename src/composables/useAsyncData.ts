import { onMounted, ref, type Ref } from 'vue';

export interface UseAsyncDataOptions {
  /** 默认 onMounted 自动加载; 传 false 则由调用方手动触发. */
  immediate?: boolean;
}

/**
 * 单资源加载骨架: loading / error / 竞态保护.
 *
 * 竞态: 快速连续触发(切筛选、切日期)时旧请求后返回会盖掉新数据,
 * 用自增 seq 只认最后一次 —— 这个模式之前在 Hall / Score / Reviews /
 * MovieReviews 四处各手写了一遍.
 *
 * 错误 toast 不用管: http 拦截器已统一弹; 这里的 error 用于页面渲染
 * ErrorState 重试入口.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, opts: UseAsyncDataOptions = {}) {
  const data: Ref<T | null> = ref(null);
  const loading = ref(true);
  const error = ref<unknown>(null);
  let seq = 0;

  async function load() {
    const my = ++seq;
    loading.value = true;
    error.value = null;
    try {
      const r = await fetcher();
      if (my === seq) data.value = r;
    } catch (err) {
      if (my === seq) error.value = err;
    } finally {
      if (my === seq) loading.value = false;
    }
  }

  if (opts.immediate !== false) onMounted(load);

  return { data, loading, error, load };
}
