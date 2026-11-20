// core/box.js·core/props.js giftSpot 단위 시험 (M6-2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxActive, boxRemainMs, serverNow, boxRemainText, boxNameOk, boxLabel, validateBoxPayload } from '../../prototype/src/core/box.js';
import { giftSpot, giftInView, giftXMax, GIFT_BOX, GIFT_GAP, PROP_KINDS, shapesOverlap, footOf } from '../../prototype/src/core/props.js';
import { BOUNDS } from '../../prototype/src/core/behavior.js';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const good = { code: '11', id: ID, placed: 1000, until: 1000 + 3600000, seed: 42, name: '민지', at: 1005 };

test('만료 경계: until 과 같으면 만료', () => {
  const b = { until: 5000 };
  assert.equal(boxActive(b, 4999), true);
  assert.equal(boxActive(b, 5000), false);
  assert.equal(boxActive(b, 5001), false);
  assert.equal(boxActive(null, 0), false);
  assert.equal(boxRemainMs(b, 4000), 1000);
  assert.equal(boxRemainMs(b, 9000), 0);
});
test('offset 보정', () => {
  assert.equal(serverNow(2000, 10000), 12000);
  assert.equal(serverNow(-2000, 10000), 8000);
  assert.equal(serverNow(undefined, 10000), 10000);
  const b = { until: 11000 };
  assert.equal(boxActive(b, 10000), true);
  assert.equal(boxActive(b, serverNow(1500, 10000)), false); // 기기 시계가 느려도 서버 기준으로 만료
});
test('남은 시간 문구', () => {
  assert.equal(boxRemainText(59999), '곧 사라져요');
  assert.equal(boxRemainText(60000), '약 1분 남음');
  assert.equal(boxRemainText(3599000), '약 59분 남음');
});
test('나쁜 페이로드 버림', () => {
  assert.ok(validateBoxPayload(good));
  assert.equal(validateBoxPayload({ ...good, name: null }).name, null);
  assert.equal(validateBoxPayload({ ...good, name: '가나다라마바사아자차카' }), null, '11자');
  assert.ok(validateBoxPayload({ ...good, name: '가나다라마바사아자차' }), '10자');
  assert.equal(validateBoxPayload({ ...good, name: '<b>x</b>' }), null, '허용 밖 글자');
  assert.equal(validateBoxPayload({ ...good, name: '' }), null);
  assert.equal(validateBoxPayload({ ...good, id: 'abc' }), null);
  assert.equal(validateBoxPayload({ ...good, id: ID + 'x' }), null);
  assert.equal(validateBoxPayload({ ...good, code: '99' }), null);
  assert.equal(validateBoxPayload({ ...good, until: good.placed }), null);
  assert.equal(validateBoxPayload({ ...good, until: good.placed + 2 * 3600000 + 1 }), null);
  assert.equal(validateBoxPayload({ ...good, seed: 1.5 }), null);
  assert.equal(validateBoxPayload(null), null);
});
test('이름 표시 문구', () => {
  assert.equal(boxLabel('민지'), '민지의 상자');
  assert.equal(boxLabel(null), '이웃님의 상자');
  assert.equal(boxLabel(undefined), '이웃님의 상자');
  assert.equal(boxLabel('<b>'), '이웃님의 상자');
  assert.equal(boxNameOk('민지 1'), true);
});

const crate = PROP_KINDS.crate;
const near = (g, o) => shapesOverlap({ hx: crate.hx, hz: crate.hz, rot: 0, x: g.x, z: g.z }, { ...footOf(o.kind), x: o.x, z: o.z, rot: o.rot || 0 }, GIFT_GAP);
test('giftSpot 결정성·BOUNDS·겹침 0', () => {
  const props = [{ kind: 'car', x: 0, z: -1.1, rot: 0 }, { kind: 'lowwall', x: 1.0, z: -1.0, rot: 0 }];
  for (let seed = 0; seed < 50; seed++) {
    const a = giftSpot({ code: '11', seed, props }), b = giftSpot({ code: '11', seed, props });
    assert.deepEqual(a, b);
    assert.ok(a, 'seed ' + seed);
    assert.equal(a.kind, 'crate'); assert.equal(a.look, 'gift');
    assert.ok(a.x >= GIFT_BOX.x0 && a.x <= GIFT_BOX.x1 && a.z >= -0.5 && a.z <= GIFT_BOX.z1);
    const az = a.z + crate.slots[0].approach[1];
    assert.ok(a.x >= BOUNDS.x0 && a.x <= BOUNDS.x1 && az <= BOUNDS.z1 && az >= BOUNDS.z0);
    for (const o of props) assert.equal(near(a, o), false);
    assert.ok(giftInView(a.x, a.z, 390 / 800) && giftInView(a.x, a.z, 1280 / 800), 'seed ' + seed + ' 시야 안');
  }
  assert.notDeepEqual(giftSpot({ code: '11', seed: 1 }), giftSpot({ code: '26', seed: 1 }));
});
test('giftSpot 실패 시 null', () => {
  const full = [{ x: 0, z: 0.4, hx: 5, hz: 5, rot: 0 }]; // 화면 앞쪽을 모두 덮는 장애물
  assert.equal(giftSpot({ code: '11', seed: 1, obstacles: full }), null);
});
test('giftSpot 기본 시야 안(390x800·1280x800), 모든 상자 꼭짓점 포함 (M6-9)', () => {
  for (const code of ['11', '26', '27', '41', '36', '48', '1111053000']) for (let seed = 0; seed < 30; seed++) {
    const a = giftSpot({ code, seed, props: [{ kind: 'car', x: 0, z: -0.3, rot: 0 }] });
    assert.ok(a, code + ' seed ' + seed + ' 자리');
    for (const asp of [390 / 800, 1280 / 800]) assert.ok(giftInView(a.x, a.z, asp), code + ' ' + seed + ' asp ' + asp);
  }
  assert.ok(giftXMax(0, 390 / 800) < GIFT_BOX.x1, '좁은 화면은 x 범위가 줄어든다');
  assert.equal(giftInView(1.2, 0.4, 390 / 800), false, '시야 밖은 거부');
});
test('giftSpot 자동차가 중앙에 있어도(지역 26) 자리가 잡힌다', () => {
  for (let seed = 1; seed <= 10; seed++) assert.ok(giftSpot({ code: '26', seed, props: [{ kind: 'car', x: 0, z: -0.3, rot: 0 }] }));
});
