import { ElMessageBox } from 'element-plus';

export interface ConfirmOptions {
  type?: 'warning' | 'error' | 'info' | 'success';
  confirmButtonText?: string;
  cancelButtonText?: string;
}

/**
 * ElMessageBox.confirm 的 boolean 封装: 确认 → true, 取消/ESC/点遮罩 → false.
 * 替代各页面重复的 `.then(() => true).catch(() => false)`.
 */
export async function confirmAction(
  message: string,
  title = '操作确认',
  opts: ConfirmOptions = {},
): Promise<boolean> {
  return await ElMessageBox.confirm(message, title, {
    type: opts.type ?? 'warning',
    confirmButtonText: opts.confirmButtonText ?? '确定',
    cancelButtonText: opts.cancelButtonText ?? '取消',
  })
    .then(() => true)
    .catch(() => false);
}
