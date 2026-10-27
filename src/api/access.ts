import { http } from './http';

export interface AdminAccess {
  roles: string[];
  permissions: string[];
}
export interface AdminRole {
  code: string;
  name: string;
  permissions: string[];
}
export const accessApi = {
  mine: () => http.get<AdminAccess>('/admin/access'),
  roles: () => http.get<AdminRole[]>('/admin/rbac/roles'),
  assignments: (ids: number[]) =>
    http.get<Record<string, string[]>>('/admin/rbac/assignments', {
      params: { ids: ids.join(',') },
    }),
  assign: (id: number, roles: string[]) =>
    http.put<AdminAccess>(`/admin/rbac/admins/${id}`, { roles }),
};

export function managementPermission(path: string): string | undefined {
  if (/^\/manage\/halls\/[^/]+\/seats\/?$/.test(path)) return 'venue:write';
  const page = path.split('/')[2];
  return (
    {
      overview: 'dashboard:read',
      users: 'user:manage',
      admins: 'admin:manage',
      halls: 'venue:read',
      movies: 'catalog:read',
      schedules: 'schedule:read',
      orders: 'order:read',
      governance: 'governance:manage',
      benefits: 'benefit:read',
      revenue: 'report:read',
    } as Record<string, string>
  )[page ?? ''];
}
