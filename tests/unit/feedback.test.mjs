// 의견 보내기(R-16) 순수 규칙 단위 시험: 악의적 입력·길이·링크·쿨다운. 사용: node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, cpLen, hasLink, linkKind, validateFeedback, checkCooldown, pruneSent, pruneBox, mailPreview, FB_LIMIT, FB_COOL } from '../../prototype/src/core/feedback_rules.js';

const okIn = (o = {}) => ({ title: '제목이에요', from: '', body: '내용이에요', ...o });
const V = (o, ctx) => validateFeedback(okIn(o), ctx);
const noCtrl = (s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(s);
const noInvis = (s) => !/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/.test(s) && !/[\u{E0000}-\u{E007F}]/u.test(s);

test('정상 입력은 통과하고 정리된 값이 나온다', () => {
  const r = V({ title: '  지도 글자가   작아요 ', from: ' 별명 ', body: '첫 줄\n\n\n\n둘째 줄  ' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.clean, { title: '지도 글자가 작아요', from: '별명', body: '첫 줄\n\n둘째 줄' });
});

// 악의적 입력 20종 이상 (정리 결과 또는 거부 사유를 확인)
const CLEAN_CASES = [
  ['HTML 태그는 글자 그대로 남는다(표시는 textContent)', '<b>굵게</b>', (s) => s === '<b>굵게</b>'],
  ['script 태그', '<script>alert(1)</script>안녕', (s) => s.includes('<script>') && s.endsWith('안녕')],
  ['img onerror', '<img src=x onerror=alert(1)>', (s) => s === '<img src=x onerror=alert(1)>'],
  ['따옴표·앰퍼샌드', '"\'&amp;&lt;', (s) => s === '"\'&amp;&lt;'],
  ['null 문자', 'a\u0000b\u0000c', (s) => s === 'abc'],
  ['제어문자 모음', 'a\u0001\u0002\u0007\u001Bb\u007Fc\u0090d\u009Fe', (s) => s === 'abcde'],
  ['제로폭 공백/비접합', '제\u200B로\u200C폭\u200D글\u2060자\uFEFF', (s) => s === '제로폭글자'],
  ['BiDi 덮어쓰기', 'abc\u202Edef\u202C', (s) => s === 'abcdef'],
  ['BiDi 고립', '\u2066x\u2067y\u2068z\u2069', (s) => s === 'xyz'],
  ['아랍 글자 표지·좌우 표시', 'a\u061Cb\u200Ec\u200Fd', (s) => s === 'abcd'],
  ['소프트 하이픈·한글 채움', 'a\u00ADb\u3164c\u115Fd', (s) => s === 'abcd'],
  ['태그 문자(보이지 않는 글자 밀반입)', 'hi\u{E0041}\u{E0042}\u{E007F}', (s) => s === 'hi'],
  ['변이 선택자', 'a\uFE00b\u{E0100}c', (s) => s === 'abc'],
  ['짝 없는 서로게이트', 'a\uD800b\uDC00c', (s) => s === 'abc'],
  ['이모지는 보존', '고마워요 \u{1F43E}\u{1F431}', (s) => s === '고마워요 \u{1F43E}\u{1F431}'],
  ['이모지 하트(FE0F) 보존', '\u2764\uFE0F', (s) => s === '\u2764\uFE0F'],
  ['탭·CR·줄 구분자', 'a\tb\r\nc\u2028d', (s) => s === 'a b\nc\nd'],
  ['전각 공백', '가\u3000\u3000나', (s) => s === '가 나'],
  ['아주 긴 공백', '가' + ' '.repeat(10000) + '나', (s) => s === '가 나'],
  ['줄바꿈 폭탄', '가' + '\n'.repeat(5000) + '나', (s) => s === '가\n\n나'],
];
for (const [name, input, check] of CLEAN_CASES) {
  test('정리: ' + name, () => {
    const s = cleanText(input, true);
    assert.ok(check(s), JSON.stringify(s));
    assert.ok(noCtrl(s) && noInvis(s));
  });
}
test('정리: 한 줄 칸은 줄바꿈도 공백으로', () => assert.equal(cleanText('가\n나\r\n다', false), '가 나 다'));
test('정리: null·undefined·숫자도 죽지 않는다', () => { assert.equal(cleanText(null), ''); assert.equal(cleanText(undefined), ''); assert.equal(cleanText(123), '123'); assert.equal(cleanText({}), '[object Object]'); });

const LINKS = [
  'http://example.invalid', 'https://example.invalid/a?b=1', 'HTTP://EXAMPLE.INVALID', 'h\u200Bttp://x.invalid', 'www.example.invalid',
  'WWW . example', 'spam-shop.com', 'abc.co.kr', 'bit.ly/xx', '골목냥.com', 'abc dot com', 'javascript:alert(1)', 'data:text/html,hi',
  'ftp://x', 'mailto:a@b', '192.168.0.1', 'example\u3002com', 'e\uFF58ample\uFF0Ecom', 'xx[.]com', 'file:///etc/passwd', 'a://b',
];
for (const l of LINKS) {
  test('링크 차단: ' + JSON.stringify(l).slice(0, 40), () => {
    const r = V({ body: '보세요 ' + l });
    assert.equal(r.ok, false, JSON.stringify(l));
    assert.equal(r.reason, 'link');
  });
}
test('링크 아님: 일반 글은 통과', () => {
  for (const t of ['안녕하세요. 잘 쓰고 있어요', '버전 1.2 가 좋아요', '3.5점 드려요', 'com 이라는 글자 하나', '시간: 오후 3시', 'Note: 글자가 작아요', '고양이가 귀여워요!!!']) assert.equal(V({ body: t }).ok, true, t);
});
test('링크: 제목에도 적용', () => { const r = V({ title: 'www.x.invalid' }); assert.equal(r.ok, false); assert.equal(r.field, 'title'); });
test('보내는 이: 이메일 모양은 허용(연락처 문자열), 주소 모양은 거부', () => {
  assert.equal(V({ from: 'someone@example.invalid' }).ok, true);
  assert.equal(V({ from: '010-0000-0000' }).ok, true);
  assert.equal(V({ from: 'http://x.invalid' }).ok, false);
  assert.equal(V({ from: 'www.x.invalid' }).reason, 'link');
});
test('hasLink: null 안전', () => { assert.equal(hasLink(null), false); assert.equal(hasLink(undefined), false); });

test('길이: 경계값', () => {
  assert.equal(V({ body: '가'.repeat(500) }).ok, true);
  assert.equal(V({ body: '가'.repeat(501) }).reason, 'too_long');
  assert.equal(V({ title: '가'.repeat(40) }).ok, true);
  assert.equal(V({ title: '가'.repeat(41) }).reason, 'too_long');
  assert.equal(V({ from: '가'.repeat(41) }).reason, 'too_long');
  assert.equal(V({ body: '가'.repeat(100000) }).reason, 'too_long');
});
test('길이: 이모지는 한 글자로 센다', () => {
  assert.equal(cpLen('\u{1F43E}'.repeat(500)), 500);
  assert.equal(V({ body: '\u{1F43E}'.repeat(500) }).ok, true);
  assert.equal(V({ body: '\u{1F43E}'.repeat(501) }).reason, 'too_long');
});
test('길이: 제로폭만 늘린 긴 글은 정리 뒤 길이로 판단', () => {
  const r = V({ body: '가\u200B'.repeat(400) });
  assert.equal(r.ok, true); assert.equal(cpLen(r.clean.body), 400);
});
test('길이: 세 칸을 모두 가득 채워도(580자) 통과', () => {
  assert.equal(FB_LIMIT.total, 600);
  assert.equal(V({ title: '가'.repeat(40), from: '나'.repeat(40), body: '다'.repeat(500) }).ok, true); // 최대 580자라 합계 600은 안전망
});
test('빈 값', () => {
  assert.equal(V({ title: '' }).reason, 'empty_title');
  assert.equal(V({ title: '   \n ' }).reason, 'empty_title');
  assert.equal(V({ body: '' }).reason, 'empty_body');
  assert.equal(V({ body: '\u200B\u200B\u0000 \n' }).reason, 'empty_body');
  assert.equal(V({ body: '!!! ... ???' }).reason, 'empty_body');
  assert.equal(validateFeedback({}).ok, false);
  assert.equal(validateFeedback(null).ok, false);
  assert.equal(V({ body: '\u{1F43E}' }).ok, true);
});
test('허니팟: 채워지면 조용히 거부', () => {
  const r = V({ honey: 'http://bot.invalid' });
  assert.equal(r.ok, false); assert.equal(r.silent, true); assert.equal(r.reason, 'honeypot');
  assert.equal(V({ honey: '' }).ok, true);
  assert.equal(V({ honey: undefined }).ok, true);
});
test('입력 시간: 열고 3초 안이면 거부', () => {
  assert.equal(V({}, { now: 1000, openedAt: 0 }).reason, 'too_fast');
  assert.equal(V({}, { now: FB_COOL.minOpenMs, openedAt: 0 }).ok, true);
  assert.equal(V({}).ok, true);
});
test('중복: 같은 제목·본문(대소문자 무시)은 거부', () => {
  const first = V({ title: 'Hello', body: 'World' });
  const keys = [first.clean.title.toLowerCase() + '\u0001' + first.clean.body.toLowerCase()];
  assert.equal(V({ title: 'hello', body: 'WORLD' }, { recentKeys: keys }).reason, 'duplicate');
  assert.equal(V({ title: 'hello', body: 'other' }, { recentKeys: keys }).ok, true);
});
test('거부 메시지는 항상 있다(허니팟 제외)', () => {
  for (const o of [{ title: '' }, { body: '' }, { body: 'x'.repeat(600) }, { body: 'http://a.b' }]) { const r = V(o); assert.ok(r.message && r.message.length > 3, r.reason); }
});
test('메일 미리보기는 글자만(태그도 그대로 글자)', () => {
  const m = mailPreview({ title: '<b>x</b>', from: '', body: '<script>1</script>' });
  assert.equal(m.subject, '[골목냥 의견] <b>x</b>'); assert.equal(m.name, '(이름 없음)'); assert.equal(m.message, '<script>1</script>');
});

test('쿨다운: 60초 1회', () => {
  const t = 10_000_000;
  assert.equal(checkCooldown([], t).ok, true);
  const a = checkCooldown([t - 1000], t); assert.equal(a.ok, false); assert.equal(a.reason, 'gap'); assert.equal(a.waitMs, 59000);
  assert.equal(checkCooldown([t - 59999], t).ok, false);
  assert.equal(checkCooldown([t - 60000], t).ok, true);
});
test('쿨다운: 하루 5회', () => {
  const t = 100_000_000, h = 3600000;
  const five = [1, 2, 3, 4, 5].map((i) => t - i * h);
  const r = checkCooldown(five, t); assert.equal(r.ok, false); assert.equal(r.reason, 'daily'); assert.equal(r.waitMs, 24 * h - 5 * h);
  assert.equal(checkCooldown(five.slice(1), t).ok, true); // 4회
  assert.equal(checkCooldown([...five.slice(0, 4), t - 25 * h], t).ok, true); // 하루 지난 기록은 센 적 없음
});
test('쿨다운: 이상한 기록(NaN·미래·문자열·null)에도 죽지 않는다', () => {
  assert.equal(checkCooldown(null, 1).ok, true);
  assert.equal(checkCooldown('x', 1).ok, true);
  assert.equal(checkCooldown([NaN, 'a', null, undefined, Infinity], 1000).ok, true);
  assert.equal(checkCooldown([1e15], 1000).ok, true);
});
test('pruneSent·pruneBox: 오래된 것을 버린다', () => {
  const t = 1e12, d = 86400000;
  assert.deepEqual(pruneSent([t - 25 * 3600000, t - 1000], t), [t - 1000]);
  const box = [{ id: 'a', at: t - 91 * d }, { id: 'b', at: t - 89 * d }, null, { id: 'c' }];
  assert.deepEqual(pruneBox(box, t, 90).map((x) => x.id), ['b']);
  assert.deepEqual(pruneBox(undefined, t), []);
});

// ── R-16 보강: 이메일·도메인 꼼수·숫자 주소 (tester 지적). 완벽히 막지는 못하며 나머지는 서버 한도(M4)에 맡긴다
const BYPASS = [
  't.co/abc', 'x.com', 'a.io', 'spam.fr', 'spam.in', 'is.gd/abc', 'naver.me/abc', 'tinyurl.com/abc',
  'e v i l . c o m', 'evil [dot] com', 'evil (dot) com', 'evil {dot} com', 'evil dot com', 'evil .com', 'evil . com',
  'evil%2ecom', 'evil%2Ecom', 'evil&#46;com', 'evil&#x2e;com', 'evil&period;com', 'evil。com', 'evil．com',
  '1 9 2 . 1 6 8 . 0 . 1', '192 . 168 . 0 . 1', '0x7f000001', '0X7F000001', '3232235777', '2130706433', '16777216',
  'java\tscript:alert(1)', 'jav​ascript:1',
];
for (const l of BYPASS) {
  for (const f of ['title', 'body']) test('우회 차단(' + f + '): ' + JSON.stringify(l).slice(0, 36), () => {
    const r = V({ [f]: '보세요 ' + l });
    assert.equal(r.ok, false); assert.equal(r.reason, 'link'); assert.equal(r.field, f);
  });
}
const EMAILS = ['someone@example.invalid', 'a@b.com', 'A.B+c@Sub.Example.Kr', 'a＠b.com', 'a @ b.com', 'a [at] b dot com', 'a(at)b.co.kr', 'a%40b.com', 'a&#64;b.com'];
for (const e of EMAILS) {
  for (const f of ['title', 'body']) test('이메일 차단(' + f + '): ' + JSON.stringify(e), () => {
    const r = V({ [f]: '연락은 ' + e });
    assert.equal(r.ok, false); assert.equal(r.reason, 'email'); assert.equal(r.field, f);
    assert.match(r.message, /보내는 이 칸/);
  });
}
test('이메일: 보내는 이 칸은 연락처로 허용 유지', () => {
  for (const e of ['a@b.com', 'a＠b.com']) { const r = V({ from: e }); assert.equal(r.ok, true, e); }
});
test('링크 종류: scheme 이 든 메일 주소는 link, 이메일만이면 email', () => {
  assert.equal(linkKind('mailto:a@b.com'), 'link'); assert.equal(linkKind('a@b.com'), 'email'); assert.equal(linkKind('안녕'), null);
});
test('오탐 방지: 일반 문장·숫자·문장 부호는 통과', () => {
  const OK = ['3.5점 드려요', '버전 1.2.3 이에요', '평점 4.75 점', '문장 끝.이어서', '고양이.좋아요 ㅎㅎ', 'e.g. 지도가 느려요', 'i.e. 이런 뜻', '2.5 배 느려요',
    'It is fine. In my view', '좋아요. Co 라는 말', '1. 사과 2. 배 3. 감', '20261019 에 샀어요', '12,000,000원', '01012345678', '4294967296 번', '1234567 번',
    '나는 e v i l 이 싫어', '화면에 dot 이 보여요', 'I like polka dot common', '5시@카페', '안녕하세요. 잘 쓰고 있어요', '$100.50', 'a.m. 9시', 'U.S.A 여행'];
  for (const t of OK) assert.equal(V({ body: t }).ok, true, t);
});
test('오탐 판단(문서화): 진짜 주소와 구분 못 하는 것은 거부한다', () => {
  assert.equal(V({ body: '버전 1.2.3.4 에서 고장나요' }).reason, 'link'); // 4 마디 숫자는 IP 와 같아서 거부(3 마디 1.2.3 은 허용)
  assert.equal(V({ body: 'ok.Com 아님' }).reason, 'link'); // 붙여 쓴 ok.Com 은 도메인과 같아서 거부
});

// ── 저장값 변조: 쿨다운 계산이 배열 아닌 값에도 죽지 않는다 (어댑터 정규화는 tests/feedback_ui.js 가 실제 화면에서 시험)
test('변조 값: validateFeedback 의 recentKeys 가 배열이 아니어도 죽지 않는다', () => {
  for (const k of ['문자열', 5, {}, null, { includes: 1 }]) assert.equal(V({}, { recentKeys: k }).ok, true);
});
