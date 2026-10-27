import { http } from './http';
import type { PageResult } from '@/types';

export interface NotificationItem {
  id: number;
  orderId: number;
  title: string;
  body: string;
  eventKind: string;
  createdAt: string;
  readAt?: string;
}

export const notificationApi = {
  list: (page: number, unread: boolean) =>
    http.get<PageResult<NotificationItem>>('/notify/messages', {
      params: { page, size: 20, unread },
    }),
  unread: () => http.get<number>('/notify/unread-count'),
  read: (id: number) => http.put<void>(`/notify/messages/${id}/read`),
  readAll: () => http.put<void>('/notify/messages/read-all'),
  ticket: () => http.post<string>('/notify/socket-ticket'),
};

/** Browser WebSocket authentication uses an expiring one-time ticket, never a JWT in the URL. */
export function notificationSocketUrl(ticket: string): string {
  const base = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');
  const url = new URL(`${base}/notify/socket`, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
}
