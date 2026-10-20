import test from 'node:test';
import assert from 'node:assert/strict';
import { changePercent, csvText, dateOffset, revenueCsv, revenuePreset } from '../src/utils/revenue.ts';

test('date presets include today and handle leap months and year boundaries', () => {
  assert.deepEqual(revenuePreset('7','2024-03-01'), ['2024-02-24','2024-03-01']);
  assert.deepEqual(revenuePreset('30','2024-03-01'), ['2024-02-01','2024-03-01']);
  assert.deepEqual(revenuePreset('lastMonth','2024-03-20'), ['2024-02-01','2024-02-29']);
  assert.deepEqual(revenuePreset('lastMonth','2024-01-01'), ['2023-12-01','2023-12-31']);
  assert.equal(dateOffset('2024-01-01',-1), '2023-12-31');
});
test('zero comparison base has no misleading infinite percentage', () => {
  assert.equal(changePercent(100,0), undefined);
  assert.equal(changePercent(0,100), -100);
  assert.equal(changePercent(12.5,10), 25);
});
test('CSV preserves Chinese newlines quotes and prevents spreadsheet formulas', () => {
  const text = csvText([['中文,"换行\n文字', '=1+1', ' \t@SUM(A1)', -10.12]]);
  assert.ok(text.startsWith('\uFEFF'));
  assert.ok(text.includes('"中文,""换行\n文字"'));
  assert.ok(text.includes("\"'=1+1\""));
  assert.ok(text.includes("\"' \t@SUM(A1)\""));
  assert.ok(text.includes('"-10.12"'));
  assert.ok(text.endsWith('\r\n'));
});
test('daily export covers all returned days with cents and unknown refunds, independent of pagination', () => {
  const metrics = { grossRevenue: 100.01, refundAmount: 70, netRevenue: 30.01, totalOrders: 3, paidOrders: 1,
    refundOrders: 1, pendingOrders: 0, closedOrders: 0, unknownRefundOrders: 2, unknownRefundOrderAmount: 120 };
  const report = { startDate:'2024-02-28',endDate:'2024-02-29',generatedAt:'2024-03-01 10:00:00',
    daily:[{startDate:'2024-02-28',metrics},{startDate:'2024-02-29',metrics}], movies:[], halls:[] };
  const text = revenueCsv(report,'daily');
  assert.ok(text.includes('"2024-02-28","100.01","70.00","30.01"'));
  assert.ok(text.includes('"2024-02-29","100.01","70.00","30.01"'));
  assert.ok(text.includes('"120.00"'));
});
