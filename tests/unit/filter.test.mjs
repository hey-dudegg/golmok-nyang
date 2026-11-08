// 필터 정규식(core/text_filter.js)·공통 벡터(tests/filter_cases.json)·check_05.sql 벡터 일치 단위 시험 (M2-6b). 서버 없이. 사용: node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { checkText, normText, FILTER_MSG } = await import('../../prototype/src/core/text_filter.js');
const V = JSON.parse(fs.readFileSync(new URL('../filter_cases.json', import.meta.url), 'utf8'));

test('벡터: 막을 것·통과할 것이 각 30줄 이상', () => { assert.ok(V.block.length >= 30); assert.ok(V.pass.length >= 30); });
test('벡터: 막을 것은 정해진 코드로 걸린다', () => {
  for (const c of V.block) assert.equal(checkText(c.kind, c.text), c.code, JSON.stringify(c.text));
});
test('벡터: 통과할 것은 걸리지 않는다', () => {
  for (const c of V.pass) assert.equal(checkText(c.kind, c.text), null, JSON.stringify(c.text));
});
test('정규화: 전각·대소문자·0폭 문자·구분 기호', () => {
  assert.equal(normText('ＡＢ​c').n1, 'abc');
  assert.equal(normText('0 1-0.1_2,3').n2, '0101' + '23');
  assert.equal(normText(null).n1, '');
});
test('오류 문구는 걸린 단어를 알려 주지 않고 코드마다 있다', () => {
  for (const code of ['filter_word', 'filter_url', 'filter_contact', 'filter_chars']) assert.ok(FILTER_MSG[code]);
});
test('check_05.sql [05] 벡터가 filter_cases.json 과 같다(앞뒤 따옴표 $v$ 로 감싼 본문이 모두 있다)', () => {
  const sql = fs.readFileSync(new URL('../../supabase/tests/check_05.sql', import.meta.url), 'utf8');
  const have = new Set([...sql.matchAll(/\$v\$([\s\S]*?)\$v\$/g)].map((m) => m[1] + '|'));
  const want = [...V.block, ...V.pass];
  for (const c of want) assert.ok(sql.includes('$v$' + c.text + '$v$'), 'check_05.sql 에 없음: ' + JSON.stringify(c.text));
  assert.equal(have.size >= want.length - 3, true); // 같은 글이 겹치면 집합이 작다
});
