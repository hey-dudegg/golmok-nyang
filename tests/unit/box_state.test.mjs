// state/box.js 상태 전이 단위 시험 (M6-4)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeBox, boxView, boxErrText, Box } from '../../prototype/src/state/box.js';

const ID = '123e4567-e89b-42d3-a456-426614174000', ID2 = '223e4567-e89b-42d3-a456-426614174000';
const mk = (o = {}) => ({ code: '11', id: ID, placed: 1000, until: 1000 + 3600000, seed: 7, name: '나비', mine: false, ...o });
const T0 = 1000;

test('mergeBox: 같은 id 는 이름만, 다른 id 는 늦게 놓은 쪽', () => {
  assert.equal(mergeBox(null, mk()).id, ID);
  assert.equal(mergeBox(mk(), mk({ name: null })).name, null);
  assert.equal(mergeBox(mk({ mine: true }), mk({ name: '다른' })).mine, true);
  assert.equal(mergeBox(mk(), mk({ id: ID2, placed: 5000 })).id, ID2);
  assert.equal(mergeBox(mk({ placed: 9000 }), mk({ id: ID2, placed: 5000 })).id, ID);
  assert.equal(mergeBox(mk(), null).id, ID);
});

test('boxView: 상태표 9가지', () => {
  assert.equal(boxView(null, T0).phase, 'empty');
  assert.equal(boxView(null, T0, { editing: true }).phase, 'editing');
  assert.equal(boxView(null, T0, { pending: true }).text, '놓는 중…');
  assert.equal(boxView(null, T0, { live: false }).phase, 'offline');
  assert.equal(boxView(null, T0, { live: false }).canPlace, false);
  const mine = boxView(mk({ mine: true }), T0 + 120000);
  assert.deepEqual([mine.phase, mine.canReport, mine.text], ['mine', false, '나비의 상자 · 58분 남음']);
  const other = boxView(mk(), T0 + 120000);
  assert.deepEqual([other.phase, other.canReport], ['other', true]);
  const hid = boxView(mk({ name: null }), T0);
  assert.deepEqual([hid.phase, hid.canReport, hid.text.startsWith('이웃님의 상자')], ['hidden', false, true]);
  const soon = boxView(mk(), T0 + 3600000 - 30000);
  assert.deepEqual([soon.phase, soon.text], ['soon', '나비의 상자 · 곧 사라져요']);
  assert.equal(boxView(mk(), T0 + 3600000).phase, 'empty'); // 만료
  assert.equal(boxView(mk(), T0 + 3600000, { live: false }).phase, 'offline');
  assert.equal(boxView(mk(), T0, { live: false }).phase, 'other'); // 받아 둔 상자는 그대로
});

test('boxErrText 문구', () => {
  assert.equal(boxErrText({ code: 'rate_limit' }), '상자는 하루에 6번까지 놓을 수 있어요');
  assert.equal(boxErrText({ code: 'filter_phone' }), '쓸 수 없는 이름이에요');
  assert.equal(boxErrText(new Error('x')), '연결이 끊겨 상자를 놓지 못했어요');
});

test('Box 상태: 방송·내가 놓음·지역 필터·만료', async () => {
  const now = Date.now();
  const caps = { room: null, box: {
    list: async () => ({ now, boxes: [] }),
    place: async (code) => ({ now, box: { code, id: ID, placed: now, until: now + 3600000, seed: 3, name: '나비', mine: true } }),
    clear: async () => {}, report: async () => {},
  } };
  Box.caps = caps; Box.started = true; Box.region = '11';
  const seen = []; const off = Box.on((b, why) => seen.push([b && b.id, why]));
  await Box.place('나비');
  assert.equal(Box.get().mine, true);
  Box.set(null, 'sync');
  Box.receive({ code: '26', id: ID2, placed: now, until: now + 3600000, seed: 1, name: '고양', at: now });
  assert.equal(Box.get(), null); // 다른 지역 방송은 무시
  Box.receive({ code: '11', id: ID2, placed: now, until: now + 3600000, seed: 1, name: '<b>x</b>', at: now });
  assert.equal(Box.get(), null); // 나쁜 이름은 버림
  Box.receive({ code: '11', id: ID2, placed: now, until: now + 3600000, seed: 1, name: '고양', at: now });
  assert.equal(Box.get().name, '고양');
  Box.receive({ code: '11', id: ID2, placed: now, until: now + 3600000, seed: 1, name: null, at: now });
  assert.equal(Box.get().name, null);
  Box.receive({ code: '11', id: ID2, placed: now, until: now + 1, seed: 1, name: null, at: now + 10 });
  assert.equal(Box.get(), null); // 치움·만료 방송
  off(); clearTimeout(Box.timer);
  assert.ok(seen.some((s) => s[1] === 'place') && seen.some((s) => s[1] === 'recv'));
});
