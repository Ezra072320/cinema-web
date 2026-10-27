import { http } from './http';
export interface CouponTemplate {
  id: number;
  name: string;
  discount: number;
  minimum: number;
  remaining: number;
  validDays: number;
}
export interface Coupon {
  id: number;
  name: string;
  discount: number;
  minimum: number;
  status: 'AVAILABLE' | 'FROZEN' | 'USED' | 'EXPIRED';
  expiresAt: string;
  orderId?: number;
}
export interface TemplateInput {
  name: string;
  discount: number;
  minimum: number;
  stock: number;
  validDays: number;
}
export const benefitApi = {
  templates: () => http.get<CouponTemplate[]>('/benefit/templates'),
  coupons: () => http.get<Coupon[]>('/benefit/coupons', { quiet: true }),
  claim: (id: number) => http.post<number>(`/benefit/templates/${id}/claim`, {}),
  adminTemplates: () => http.get<CouponTemplate[]>('/admin/benefit/templates'),
  create: (input: TemplateInput) => http.post<number>('/admin/benefit/templates', input),
};
