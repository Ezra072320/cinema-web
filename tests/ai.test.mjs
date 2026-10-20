import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAiEvent, safeAiPath, actionDeadline } from '../src/utils/ai.ts';

test('SSE preserves escaped newlines, quotes and CRLF frames', () => {
  assert.deepEqual(decodeAiEvent('data: "你\\n好\\"电影\\""\r\n'), { text: '你\n好"电影"' });
  assert.deepEqual(decodeAiEvent('data: [DONE]\n'), {});
  assert.deepEqual(decodeAiEvent(': heartbeat\n'), {});
});
test('SSE failure is surfaced separately from the assistant answer', () => {
  assert.deepEqual(decodeAiEvent('data: {"type":"error","message":"网络中断"}'), { error: '网络中断' });
  assert.deepEqual(decodeAiEvent('data: {"type":"unknown"}'), {});
});
test('only real portal routes can be followed', () => {
  for (const path of ['/movie/12','/hall/8','/seats/18','/pay/10','/order/10','/score/3/10','/me/orders/5','/me/wants','/auth/reset'])
    assert.equal(safeAiPath(path), path);
  for (const path of ['javascript:alert(1)','https://evil.example','//evil.example','/manage/users','/coupons','/movie/0','/movie/1\\evil','/movie/%2f%2fevil'])
    assert.equal(safeAiPath(path), null);
});
test('confirmation deadline interprets server wall clock as China time', () => {
  assert.equal(actionDeadline('2026-10-19 20:00:00'), Date.parse('2026-10-19T12:00:00Z'));
  assert.equal(actionDeadline('2026-10-19T20:00:00'), Date.parse('2026-10-19T12:00:00Z'));
});
