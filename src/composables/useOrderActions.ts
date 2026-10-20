import { reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { userApi } from '@/api';
import type { OrderInfo } from '@/types';
import { minutesToReadable, refundPreview } from '@/utils/order';
import { confirmAction } from './useConfirm';

export interface UseOrderActionsOptions {
  /** 退款成功后回调(通常是重新加载). */
  onRefunded?: () => void | Promise<void>;
  /** 取消成功后回调(列表页重新加载; 详情页跳回订单列表). */
  onCancelled?: () => void | Promise<void>;
}

/**
 * 订单操作: 退款 / 取消. me/Orders 与 OrderInfo 共用(原来两处逐字重复).
 *
 * 退款确认弹窗里的金额预览只是"预览", 规则以后端为准
 * (3h 内不可退 / 3~6h 退 70% / 6h+ 全退), 改规则要同步 utils/order.ts.
 */
export function useOrderActions(opts: UseOrderActionsOptions = {}) {
  /** 进行中的订单 id → 按钮 loading. Set 兼容列表页多单各自 loading. */
  const refunding = reactive(new Set<number>());
  const cancelling = reactive(new Set<number>());

  async function refund(o: OrderInfo) {
    const preview = refundPreview(o.startTime || '', o.totalAmount);
    let detail: string;
    if (preview.kind === 'deny') detail = '距开场不足 3 小时, 不可退款';
    else if (preview.kind === 'full') detail = `全额退款 ¥${o.totalAmount.toFixed(2)}（距开场 ${minutesToReadable(preview.minutesLeft)}）`;
    else detail = `退 70% ¥${preview.amount.toFixed(2)}（距开场 ${minutesToReadable(preview.minutesLeft)}, 3~6h 档）`;

    const ok = await confirmAction(
      `确认退款订单 ${o.number}？\n${detail}\n退款金额将原路退回（模拟）`,
      '申请退款',
      { confirmButtonText: '确认退款' },
    );
    if (!ok) return;

    refunding.add(o.id);
    try {
      const msg = await userApi.refund(o.id);
      ElMessage.success(msg || '退款已提交');
      await opts.onRefunded?.();
    } catch {
      // 业务错误由 http 拦截器统一弹 toast(D8)
    } finally {
      refunding.delete(o.id);
    }
  }

  async function cancelOrder(o: OrderInfo) {
    const ok = await confirmAction(
      '确定取消该订单？取消后座位将释放，无法恢复。',
      '取消订单',
      { confirmButtonText: '确认取消' },
    );
    if (!ok) return;

    cancelling.add(o.id);
    try {
      await userApi.cancelOrder(o.id);
      ElMessage.success('订单已取消，座位已释放');
      await opts.onCancelled?.();
    } catch {
      // 同上, 拦截器已弹
    } finally {
      cancelling.delete(o.id);
    }
  }

  return { refunding, cancelling, refund, cancelOrder };
}
