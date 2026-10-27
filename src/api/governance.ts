import { http } from './http';
export interface SeatRule {
  enabled: boolean;
  configuredQps: number | null;
  activeQps: number | null;
  synchronizedRule: boolean;
}
export const governanceApi = {
  state: () => http.get<SeatRule>('/admin/governance/seat-rule', { quiet: true }),
  save: (qps: number) => http.put<SeatRule>('/admin/governance/seat-rule', { qps }),
};
