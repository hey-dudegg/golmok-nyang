// 날씨 규칙(core/weather_rules.js) 단위 시험: 종류 매핑·세기·배수·칸 id·wxAt (날씨_설계 1-2·4·5장)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kindFromCode, classify, amtOf, wxBias, WX_BIAS, SHELTER, pickShelter, needShelter, cellId, cellCenter, cellNeighbors, wxAt, KINDS } from '../../prototype/src/core/weather_rules.js';
const C = JSON.parse(fs.readFileSync(new URL('../wx_cases.json', import.meta.url), 'utf8'));
const H = 3600000;

test('WMO 코드 → 종류 표 전 경우', () => {
  for (const [kind, codes] of Object.entries(C.codes)) for (const c of codes) assert.equal(kindFromCode(c), kind, `code ${c}`);
});
test('알 수 없는 코드는 cloudy, null은 직접 판정으로', () => {
  for (const c of C.unknownCodes) assert.equal(kindFromCode(c), 'cloudy', `code ${c}`);
  assert.equal(kindFromCode(null), null);
  assert.equal(kindFromCode(undefined), null);
});
test('코드가 없을 때 직접 판정', () => {
  for (const d of C.direct) assert.equal(classify(d.in)?.kind ?? null, d.kind, JSON.stringify(d.in));
});
test('세기 amt', () => {
  for (const a of C.amt) assert.equal(amtOf(a.kind, a.precipitation, a.snowfall), a.amt, JSON.stringify(a));
  assert.equal(classify({ weather_code: 61, precipitation: 4 }).amt, 0.5);
});
test('배수: 없음·clear는 정확히 1, 이슬비는 약하게, 아기 눈', () => {
  assert.equal(wxBias(null, 'zoom'), 1);
  assert.equal(wxBias({ kind: 'clear', amt: 0 }, 'zoom'), 1);
  assert.equal(wxBias({ kind: 'rain', amt: 0.3 }, 'unknown'), 1);
  assert.equal(wxBias({ kind: 'rain', amt: 0.1 }, 'zoom'), 1 + (0.3 - 1) * 0.5);
  assert.ok(Math.abs(wxBias({ kind: 'rain', amt: 1 }, 'zoom') - 0.3) < 1e-9);
  assert.equal(wxBias({ kind: 'snow', amt: 1 }, 'zoom', true), 1.2);
  assert.equal(wxBias({ kind: 'snow', amt: 1 }, 'zoom', false), 1);
  for (const k of KINDS) assert.ok(k in WX_BIAS);
});
test('비 피할 자리: 조건·결정성·범위', () => {
  assert.equal(needShelter({ kind: 'rain', amt: 0.2 }), true);
  assert.equal(needShelter({ kind: 'rain', amt: 0.19 }), false);
  assert.equal(needShelter({ kind: 'snow', amt: 1 }), false);
  assert.equal(needShelter(null), false);
  for (const th of Object.keys(SHELTER)) {
    const a = pickShelter(th, 'cat1', 7), b = pickShelter(th, 'cat1', 7);
    assert.deepEqual(a, b);
    assert.ok(SHELTER[th].some(([x, z]) => x === a.x && z === a.z));
  }
  assert.equal(pickShelter('none', 'c', 1), null);
});
test('칸 id·중심·8칸', () => {
  assert.equal(cellId(37.75, 127), '755_2540');
  assert.deepEqual(cellCenter('755_2540'), { lat: 37.75, lng: 127 });
  assert.equal(cellCenter('x'), null);
  const n = cellNeighbors('100_200');
  assert.equal(n.length, 8); assert.ok(!n.includes('100_200')); assert.ok(n.includes('99_199') && n.includes('101_201'));
});
test('wxAt: 정시 값, 없으면 현재 값, 없으면 null', () => {
  const t0 = 1762560000000 - (1762560000000 % H);
  const pt = { t: 12, kind: 'rain', amt: 0.2, hours: [[t0 - H, 'cloudy', 0], [t0, 'rain', 0.4], [t0 + H, 'snow', 0.9]] };
  assert.deepEqual(wxAt(pt, t0 + 29 * 60000), { kind: 'rain', amt: 0.4 });
  assert.deepEqual(wxAt(pt, t0 - 1), { kind: 'cloudy', amt: 0 });
  assert.deepEqual(wxAt(pt, t0 + H + 5), { kind: 'snow', amt: 0.9 });
  assert.deepEqual(wxAt(pt, t0 + 9 * H), { kind: 'rain', amt: 0.2 });
  assert.equal(wxAt(null, t0), null);
  assert.equal(wxAt({ hours: [] }, t0), null);
});
