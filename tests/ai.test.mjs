import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAiEvent, readAiStream, safeAiPath, actionDeadline, orderAiActions, mergeAiActions } from '../src/utils/ai.ts';

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
  for (const path of ['/movie/12','/hall/8','/seats/18','/pay/10','/order/10','/score/3/10','/me/orders/5','/me/wants','/me/reviews','/auth/reset'])
    assert.equal(safeAiPath(path), path);
  for (const path of ['javascript:alert(1)','https://evil.example','//evil.example','/manage/users','/coupons','/movie/0','/movie/1\\evil','/movie/%2f%2fevil'])
    assert.equal(safeAiPath(path), null);
});
test('confirmation deadline interprets server wall clock as China time', () => {
  assert.equal(actionDeadline('2026-10-19 20:00:00'), Date.parse('2026-10-19T12:00:00Z'));
  assert.equal(actionDeadline('2026-10-19T20:00:00'), Date.parse('2026-10-19T12:00:00Z'));
});
test('a late stale snapshot cannot drop an already displayed service slip', () => {
  const current = [
    { id: 'new', status: 'PENDING', expiresAt: '2099-10-19 20:00:00' },
    { id: 'old', status: 'DONE', expiresAt: '2026-10-19 20:00:00' },
  ];
  const stale = [{ id: 'old', status: 'DONE', expiresAt: '2026-10-19 20:00:00' }];
  const merged = mergeAiActions(current, stale);
  assert.equal(merged.length, 2);
  assert.ok(merged.some(a => a.id === 'new'));
  const updated = mergeAiActions(current, [
    { id: 'old', status: 'EXPIRED', expiresAt: '2026-10-19 20:00:00' },
  ]);
  assert.equal(updated.find(a => a.id === 'old').status, 'EXPIRED');
});
test('multiple service slips are all kept and pending ones come first', () => {
  const actions = [
    { id: 'done', status: 'DONE', expiresAt: '2026-10-19 20:00:00' },
    { id: 'pending', status: 'PENDING', expiresAt: '2099-10-19 20:00:00' },
    { id: 'expired', status: 'PENDING', expiresAt: '2020-10-19 20:00:00' },
  ];
  const ordered = orderAiActions(actions, Date.parse('2026-01-01T00:00:00Z'));
  assert.deepEqual(ordered.map(a => a.id), ['pending', 'done', 'expired']);
  assert.equal(ordered.length, 3);
  assert.deepEqual(actions.map(a => a.id), ['done', 'pending', 'expired'], 'must not mutate input');
});

const slip = { id: 'new', type: 'SET_WANT', title: '加入想看', summary: '影片', status: 'PENDING', expiresAt: '2099-10-19 20:00:00' };

test('terminal event delivers the actual service slips separately from assistant prose', () => {
  assert.deepEqual(decodeAiEvent('data: ' + JSON.stringify({ type: 'done', completed: true, actions: [slip] })),
    { completion: { completed: true, actions: [slip] } });
  assert.ok(decodeAiEvent('data: {"type":"done","completed":true,"actions":[{}]}').error);
});

function bytes(text, chunkSize = 1) {
  const data = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    for (let i = 0; i < data.length; i += chunkSize) controller.enqueue(data.slice(i, i + chunkSize));
    controller.close();
  } });
}

test('actual stream handles one-byte UTF-8 packets, CRLF and terminal event without a trailing newline', async () => {
  const events = [];
  await readAiStream(bytes('data: "你\\n好"\r\n\r\n: heartbeat\r\n\r\ndata: '
    + JSON.stringify({ type: 'done', completed: true, actions: [slip] })), event => events.push(event));
  assert.equal(events.map(e => e.text ?? '').join(''), '你\n好');
  assert.deepEqual(events.at(-1).completion.actions, [slip]);
});

test('EOF without terminal confirmation is detected even after partial assistant text', async () => {
  await assert.rejects(readAiStream(bytes('data: "部分回复"\n\n'), () => {}), /连接已中断/);
});

test('model failure can still finish with service slips for user confirmation', async () => {
  const events = [];
  await readAiStream(bytes('data: {"type":"error","message":"模型超时"}\n\n'
    + 'data: ' + JSON.stringify({ type: 'done', completed: false, actions: [slip] }) + '\n\n', 13),
    event => events.push(event));
  assert.equal(events[0].error, '模型超时');
  assert.equal(events[1].completion.completed, false);
  assert.equal(events[1].completion.actions.length, 1);
});

test('late pending snapshots cannot resurrect a completed or dismissed slip', () => {
  for (const status of ['DONE', 'DISMISSED', 'EXPIRED']) {
    assert.equal(mergeAiActions([{ ...slip, status }], [slip])[0].status, status);
  }
});
