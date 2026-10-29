// 고양이 찾기 판정 단위 시험 (D-68, M1-10)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOutside, shouldShow, easeInOut, findTargets } from '../../prototype/src/core/find_cat.js';

test('가운데는 안, 가장자리 여백과 화면 밖은 밖', () => {
  assert.equal(isOutside({ x: 0, y: 0, z: 0.5 }), false);
  assert.equal(isOutside({ x: 0.69, y: 0, z: 0.5 }), false);
  assert.equal(isOutside({ x: 0.71, y: 0, z: 0.5 }), true);
  assert.equal(isOutside({ x: 0, y: -0.8, z: 0.5 }), true);
  assert.equal(isOutside({ x: 1.5, y: 0, z: 0.5 }), true);
  assert.equal(isOutside({ x: 0, y: 0, z: 1.2 }), true); // 카메라 뒤
});
test('히스테리시스: 떠 있는 동안은 더 안쪽으로 들어와야 숨김', () => {
  const n = { x: 0.67, y: 0, z: 0.5 };
  assert.equal(isOutside(n, false), false);
  assert.equal(isOutside(n, true), true);
  assert.equal(isOutside({ x: 0.6, y: 0, z: 0.5 }, true), false);
});
test('한 마리라도 안에 있으면 숨김, 고양이가 없으면 숨김', () => {
  assert.equal(shouldShow([{ x: 2, y: 0, z: 0.5 }, { x: 0, y: 0, z: 0.5 }]), false);
  assert.equal(shouldShow([{ x: 2, y: 0, z: 0.5 }]), true);
  assert.equal(shouldShow([]), false);
});
test('ease 는 0..1 로 고정', () => {
  assert.equal(easeInOut(-1), 0); assert.equal(easeInOut(2), 1); assert.equal(easeInOut(0.5), 0.5);
});
test('기준 고양이: 선택이 있으면 그 고양이만, 없거나 숨김이면 보이는 전부', () => {
  const a = { id: 1 }, b = { id: 2 }, c = { id: 3, hidden: true };
  assert.deepEqual(findTargets([a, b, c], b), [b]);
  assert.deepEqual(findTargets([a, b, c], null), [a, b]);
  assert.deepEqual(findTargets([a, b, c], c), [a, b]);
});
