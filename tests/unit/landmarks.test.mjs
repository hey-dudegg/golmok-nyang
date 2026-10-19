// 명소 배경(R-17) 순수 규칙 단위 시험: 주차 순환(D-27)·경계·상속·폴백·예비 제외·자료 스키마. 사용: node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LM_KINDS, PART_NAMES, PART_SCHEMA, activeCandidates, backdropVariant, landmarkFor, landmarkLabel, phaseFromSunDeg, sanitizeLandmarks,
  seasonOf, validateLandmarks, validatePart, weatherFor, weekIndexKST, weekStartKST } from '../../prototype/src/core/landmarks.js';

const DATA = JSON.parse(readFileSync(new URL('../../prototype/data/landmarks.json', import.meta.url), 'utf8'));
const SIDO16 = ['11', '26', '27', '28', '12', '30', '31', '36', '41', '51', '43', '44', '47', '48', '50', '52'];
const kst = (y, mo, d, hh = 0, mi = 0) => Date.UTC(y, mo - 1, d, hh - 9, mi); // KST 시각 -> UTC ms

test('자료 스키마: 검증 오류 0, 허용 kind·부품 이름·필수 필드', () => {
  assert.deepEqual(validateLandmarks(DATA), []);
  for (const list of Object.values(DATA.places)) for (const p of list) {
    assert.ok(LM_KINDS.includes(p.kind), p.id + ' kind');
    assert.ok(['verified', 'unverified'].includes(p.status), p.id + ' status');
    for (const pt of p.parts) assert.ok(PART_NAMES.includes(pt.type), p.id + ' part ' + pt.type);
  }
  assert.equal(PART_NAMES.length, 15, '부품 어휘 15종');
  assert.deepEqual([...DATA.kinds].sort(), [...LM_KINDS].sort());
});
test('16곳 전부 후보가 있고 세종은 2곳, 나머지는 3곳', () => {
  assert.deepEqual(Object.keys(DATA.places).sort(), [...SIDO16].sort());
  for (const c of SIDO16) assert.equal(activeCandidates(DATA.places[c]).length, c === '36' ? 2 : 3, c);
  let n = 0; for (const c of SIDO16) n += activeCandidates(DATA.places[c]).length;
  assert.equal(n, 47);
});
test('신뢰도 낮은 3곳은 unverified, 서울 명동은 예비(순환 제외)', () => {
  const all = Object.values(DATA.places).flat();
  assert.deepEqual(all.filter((p) => p.status === 'unverified').map((p) => p.name).sort(), ['서문시장', '속리산 법주사', '정부세종청사'].sort());
  const md = DATA.places['11'].find((p) => p.name === '명동');
  assert.equal(md.reserve, true);
  for (let w = 0; w < 6; w++) assert.notEqual(landmarkFor('11', kst(2026, 10, 19) + w * 7 * 86400000, { data: DATA }).place.name, '명동');
});
test('주차 번호: 일요일 23:59 KST 와 월요일 00:00 KST 사이에서 바뀐다', () => {
  const sun = kst(2026, 10, 25, 23, 59), mon = kst(2026, 10, 26, 0, 0); // 2026-10-26 은 월요일
  assert.equal(new Date(mon + 9 * 3600000).getUTCDay(), 1);
  assert.equal(weekIndexKST(mon) - weekIndexKST(sun), 1);
  assert.equal(weekIndexKST(mon), weekIndexKST(kst(2026, 11, 1, 23, 59)));
  assert.equal(weekStartKST(weekIndexKST(mon)), mon);
  const a = landmarkFor('26', sun, { data: DATA }), b = landmarkFor('26', mon, { data: DATA });
  assert.notEqual(a.place.id, b.place.id);
  assert.equal((a.index + 1) % 3, b.index);
});
test('결정성: 같은 주에는 언제 물어도 같은 명소, 3주마다 한 바퀴', () => {
  const t0 = kst(2026, 10, 19, 0, 0);
  for (const c of SIDO16) {
    const id = landmarkFor(c, t0, { data: DATA }).place.id;
    for (const dt of [1, 3600000, 3 * 86400000, 7 * 86400000 - 60000]) assert.equal(landmarkFor(c, t0 + dt, { data: DATA }).place.id, id, c);
    const n = activeCandidates(DATA.places[c]).length, seen = new Set();
    for (let w = 0; w < n; w++) seen.add(landmarkFor(c, t0 + w * 7 * 86400000, { data: DATA }).place.id);
    assert.equal(seen.size, n, c + ' 순환');
    assert.equal(landmarkFor(c, t0 + n * 7 * 86400000, { data: DATA }).place.id, id);
  }
});
test('주차 오프셋·후보 강제(어드민 미리보기)', () => {
  const t = kst(2026, 10, 19);
  const base = landmarkFor('11', t, { data: DATA });
  assert.equal(landmarkFor('11', t, { data: DATA, weekOffset: 1 }).index, (base.index + 1) % 3);
  assert.equal(landmarkFor('11', t, { data: DATA, weekOffset: -1 }).index, (base.index + 2) % 3);
  assert.equal(landmarkFor('11', t, { data: DATA, pick: 2 }).place.name, '북촌한옥마을');
});
test('상속: 동·시군구 코드는 시/도 명소를 물려받고 표시는 "근처 명소"', () => {
  const t = kst(2026, 10, 19);
  const s = landmarkFor('1111054000', t, { data: DATA });
  assert.equal(s.source, 'sido'); assert.equal(s.key, '11'); assert.equal(s.inherited, true);
  assert.match(landmarkLabel(s), /근처 명소/);
  const own = { ...DATA, places: { ...DATA.places, '11110': [{ id: 'x-sgg', name: '시험 명소', kind: 'park', status: 'draft' }] } };
  const g = landmarkFor('1111054000', t, { data: own });
  assert.equal(g.source, 'sgg'); assert.equal(g.place.id, 'x-sgg'); assert.ok(g.parts.length > 0, '부품이 없으면 유형 기본 부품');
  assert.equal(landmarkLabel(landmarkFor('11', t, { data: DATA })), '배경: ' + landmarkFor('11', t, { data: DATA }).place.name);
});
test('폴백: 시/도 자료 없음 -> 자동 지형, 지형도 없음 -> 기본 테마, 자료 없음 -> 기본 테마', () => {
  const t = kst(2026, 10, 19);
  const noSejong = { ...DATA, places: { ...DATA.places } }; delete noSejong.places['36'];
  const a = landmarkFor('36', t, { data: noSejong });
  assert.equal(a.source, 'auto'); assert.equal(a.place.terrain, 'mixed'); assert.ok(a.parts.length > 0); assert.equal(landmarkLabel(a), '');
  const b = landmarkFor('99', t, { data: DATA });
  assert.equal(b.source, 'theme'); assert.equal(b.parts, null);
  assert.equal(landmarkFor('11', t, { data: null }).source, 'theme');
  assert.equal(landmarkFor('11', t, { data: DATA, noData: true }).source, 'theme');
  const onlyReserve = { ...DATA, places: { '11': [{ id: 'r', name: '예비', kind: 'park', status: 'draft', reserve: true }] }, terrain: {} };
  assert.equal(landmarkFor('11', t, { data: onlyReserve }).source, 'theme');
  const one = { ...DATA, places: { '11': [DATA.places['11'][1]] } };
  for (let w = 0; w < 4; w++) assert.equal(landmarkFor('11', t + w * 7 * 86400000, { data: one }).index, 0, '후보 1개면 고정');
});
test('검증: 모르는 kind·부품·변수, 범위 밖, 필수 필드 누락을 잡는다', () => {
  const bad = { version: 1, places: { '11': [
    { id: 'a', name: 'A', kind: 'castle', status: 'verified' },
    { id: 'b', name: 'B', kind: 'tower', status: 'ok', parts: [{ type: 'ufo' }, { type: 'tower', h: 99 }, { type: 'ridge', peaks: 2.5 }, { type: 'ridge', color: 'red' }, { type: 'ridge', foo: 1 }] },
    { id: 'b', kind: 'tower', status: 'verified' },
  ], 'x1': [] }, terrain: { '11': 'moon' } };
  const e = validateLandmarks(bad).join('\n');
  for (const s of ['kind castle', 'status ok', '모르는 부품 ufo', 'h=99', 'peaks=2.5', '색 형식', 'foo 모르는 변수', 'name 없음', 'id 중복', 'x1', 'terrain 11=moon']) assert.ok(e.includes(s), s);
  const { data, errors } = sanitizeLandmarks(bad);
  assert.ok(errors.length > 0);
  assert.deepEqual(data.places, {}, '틀린 후보는 모두 빠진다');
  assert.equal(sanitizeLandmarks(null).data, null);
  assert.deepEqual(validatePart({ type: 'tower', style: 'nseoul', h: 3, base: 1 }), []);
  for (const [name, sc] of Object.entries(PART_SCHEMA)) assert.ok(typeof sc === 'object', name);
});
test('시즌·시간대·날씨 변주는 결정적', () => {
  assert.equal(seasonOf(kst(2026, 10, 19)), 'autumn'); assert.equal(seasonOf(kst(2026, 1, 5)), 'winter');
  assert.equal(seasonOf(kst(2026, 4, 1)), 'spring'); assert.equal(seasonOf(kst(2026, 7, 1)), 'summer');
  assert.equal(seasonOf(kst(2026, 3, 1, 0, 0)), 'spring'); assert.equal(seasonOf(kst(2026, 2, 28, 23, 59)), 'winter');
  assert.equal(phaseFromSunDeg(40).phase, 'day'); assert.equal(phaseFromSunDeg(3).phase, 'dusk'); assert.equal(phaseFromSunDeg(-20).phase, 'night');
  assert.ok(phaseFromSunDeg(-20).lights > 0.9 && phaseFromSunDeg(40).lights < 0.01);
  const t = kst(2026, 10, 19, 13);
  assert.deepEqual(weatherFor('11', t), weatherFor('11', t + 3600000), '같은 날 같은 날씨');
  assert.deepEqual(backdropVariant('26', t, 30), backdropVariant('26', t, 30));
  assert.equal(backdropVariant('26', t, 30).tint.snow, 0);
  assert.ok(backdropVariant('26', kst(2026, 1, 10), 30).tint.snow > 0);
});
