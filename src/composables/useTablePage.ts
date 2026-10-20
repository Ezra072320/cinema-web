import { onMounted, ref, type Ref } from 'vue';
import type { PageResult } from '@/types';

export interface UseTablePageOptions {
  limit?: number;
  /** 默认 onMounted 自动加载; 传 false 则由调用方手动触发(如需先拉字典). */
  immediate?: boolean;
}

/**
 * 后台表格页通用骨架: list / total / loading / page + load().
 * 五个管理页(用户/管理员/影片/排片/订单)之前各手写一遍, 连分页
 * layout 字符串都逐字相同.
 *
 * 错误 toast 不用管: http 拦截器已对业务失败和网络错误统一弹,
 * 页面再 catch 弹一次就是双 toast(D8 约定).
 */
export function useTablePage<R>(
  fetcher: (page: number, limit: number) => Promise<PageResult<R>>,
  opts: UseTablePageOptions = {},
) {
  const list: Ref<R[]> = ref([]);
  const total = ref(0);
  const loading = ref(false);
  const page = ref(1);
  const limit = opts.limit ?? 10;

  async function load() {
    loading.value = true;
    try {
      const r = await fetcher(page.value, limit);
      list.value = r.rows ?? [];
      total.value = r.total ?? 0;
    } catch {
      // 拦截器已弹
    } finally {
      loading.value = false;
    }
  }

  /**
   * 筛选条件变化时用 search() 而不是 load():
   * 先回第 1 页再拉 —— 停在第 3 页改筛选, 结果不足 3 页就会看到空表.
   */
  function search() {
    page.value = 1;
    void load();
  }

  if (opts.immediate !== false) onMounted(load);

  return { list, total, loading, page, limit, load, search };
}
