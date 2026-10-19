// core/feedback_rules.js: 의견 보내기(R-16) 순수 규칙. 글자 정리·길이·링크 차단·쿨다운 계산 (DOM·저장소 없음)
// core 규칙: three·DOM·window 에 닿지 않는다. 화면은 이 결과를 textContent 로만 보여 준다(XSS 방지).

export const FB_LIMIT = { title: 40, from: 40, body: 500, total: 600 };
export const FB_COOL = { gapMs: 60000, perDay: 5, dayMs: 24 * 3600000, minOpenMs: 3000, dupKeep: 5 };

export const FB_TEXT = {
  empty_title: '한 줄 제목을 적어 주세요',
  empty_body: '내용을 적어 주세요. 불편했던 점, 바라는 점 모두 좋아요',
  too_long: '글이 너무 길어요. 줄여서 다시 보내 주세요',
  link: '링크는 보낼 수 없어요. 글로만 적어 주세요',
  email: '연락처는 보내는 이 칸에만 적어 주세요',
  too_fast: '냥! 너무 빨라요. 잠깐 뒤에 다시 눌러 주세요',
  duplicate: '같은 내용은 이미 받았어요. 고마워요',
  gap: '방금 보내 주셨어요. 1분 뒤에 또 만나요',
  daily: '오늘은 여기까지만 받을 수 있어요. 내일 또 들려 주세요',
  fail: '앗, 가는 길에 길을 잃었어요. 잠시 뒤 다시 눌러 주세요',
  ok: '잘 도착했어요! 고마워요',
};

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g; // 줄바꿈(\n)은 따로 다룬다
// 안 보이는 글자: 소프트 하이픈, 결합 그래프 조각, 아랍 글자 표지, 한글 채움, 몽골 자유 변이, 제로폭(200B-200F, ZWJ 포함), BiDi(202A-202E, 2066-2069), 2060-206F, 한글 채움 문자, BOM, 대체 문자
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0E\uFEFF\uFFA0\uFFF9-\uFFFF]|[\u{E0000}-\u{E01EF}]/gu;

export const cpLen = (s) => [...String(s)].length; // 이모지를 한 글자로 센다
export const cpCut = (s, n) => [...String(s)].slice(0, n).join('');

// 글자 정리. multiline=false 면 한 줄로 합친다. 길이는 자르지 않는다(길이 검사는 validateFeedback)
export function cleanText(v, multiline = false) {
  let s = v == null ? '' : String(v);
  s = s.replace(LONE_SURROGATE, '');
  try { s = s.normalize('NFC'); } catch (e) {}
  s = s.replace(/\r\n?|\u2028|\u2029|\u0085/g, '\n').replace(/\t/g, ' ');
  s = s.replace(CONTROL, '').replace(INVISIBLE, '');
  if (multiline) {
    s = s.split('\n').map((l) => l.replace(/[ \u00A0\u3000]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  } else {
    s = s.replace(/\s+/g, ' ').replace(/[\u00A0\u3000]/g, ' ').trim();
  }
  return s;
}

const TLD = 'com|net|org|kr|io|co|me|xyz|info|biz|app|dev|gg|ly|gl|link|site|top|shop|store|online|club|vip|ru|cn|jp|tv|cc|us|uk|de|to|ws|tk|ml|ga|cf|gq|pw|click|live|ai|so|page|cloud|bet|fr|in|gd|ee|ch|nl|es|eu|tw|hk|sg|vn|au|ca|br|pl|se|it|be|at|id|la|fm|sh';
const SCHEME = /(?:^|[^a-z0-9])(?:https?|ftps?|file|javascript|vbscript|data|mailto|sms|tel|intent|market|blob|ws|wss)\s*:/;
const SCHEME_SQUEEZED = /(?:javascript|vbscript)\s*:/; // java script: 처럼 사이에 공백을 낀 꼼수 (공백을 모두 지운 글로 검사)
const SLASHES = /:\s*\/\s*\//;
const WWW = /(?:^|[^a-z0-9])www\s*[.。]/;
const IPV4 = /(?:^|[^0-9])\d{1,3}(?:\s*\.\s*\d{1,3}){3}(?![0-9])/;
const IP_HEX = /(?<![0-9a-z])0x[0-9a-f]{6,8}(?![0-9a-z])|(?<![0-9a-z])0x[0-9a-f]{1,2}(?:\s*\.\s*(?:0x)?[0-9a-f]{1,3}){3}(?![0-9a-z])/;
const BIGNUM = /(?<![0-9])[1-9]\d{7,9}(?![0-9])/g; // 10진 정수 IP 후보(8~10자리). IP 범위(1.0.0.0 이상 ~ 2^32-1)인 것만 막는다
// 이메일: 글자@글자.글자 (전각 @ 는 NFKC 로 @ 가 된다). 공백을 낀 'a @ b.com' 도 막는다
const EMAIL = /[\p{L}\p{N}._%+-]\s{0,2}@\s{0,2}[\p{L}\p{N}-]+(?:\s{0,2}\.\s{0,2}[\p{L}\p{N}-]+)+/u;
// 도메인: 앞 글자는 2자 이상(영문 1자도 허용: t.co·x.com), 점 앞에만 공백이 낀 'evil .com'·'evil . com' 도 막는다.
//  점 뒤에만 공백이 있는 'it. In' 같은 문장 부호는 막지 않는다(오탐 방지). 'ok.Com' 처럼 붙여 쓴 것은 도메인과 구분할 수 없어 막는다
const DOMAIN = new RegExp(String.raw`(?:(?<![\p{L}\p{N}-])[a-z]|[\p{L}\p{N}-]{2,})(?:\s+\.\s*|\.)(?:${TLD})(?![a-z0-9])`, 'iu');
const decodeEnt = (m, h, d) => { const c = h != null ? parseInt(h, 16) : parseInt(d, 10); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m; };
const decodePct = (m) => { try { return decodeURIComponent(m); } catch (e) { return m; } };
// 검사용으로만 글을 풀어 쓴다(저장하는 글은 바뀌지 않는다): %2e·&#46; 해제, 점·골뱅이 변형 정리
function linkForms(v) {
  let s = '';
  try { s = cleanText(v, true).normalize('NFKC').toLowerCase(); } catch (e) { s = String(v).toLowerCase(); }
  for (let i = 0; i < 2; i++) s = s.replace(/(?:%[0-9a-f]{2})+/gi, decodePct).replace(/&#(?:x([0-9a-f]{1,6})|(\d{1,7}));/gi, decodeEnt).replace(/&(?:period|commat);/gi, (m) => (/p/i.test(m) ? '.' : '@'));
  s = s.replace(/[。｡․]/g, '.');
  s = s.replace(/\s*[[({<]\s*at\s*[\])}>]\s*/g, '@');
  s = s.replace(/\s*[[({<]\s*(?:dot|period|\.)\s*[\])}>]\s*/g, '.');
  s = s.replace(new RegExp(String.raw`\s+dot\s+(?=(?:${TLD})(?![a-z0-9]))`, 'g'), '.');
  // 'e v i l . c o m'·'1 9 2 . 1 6 8 . 0 . 1': 한 글자씩 띄운 줄을 붙인 글도 함께 검사
  const sq = s.replace(/(?<![\p{L}\p{N}])[a-z0-9.](?:\s+[a-z0-9.](?![\p{L}\p{N}])){3,}/gu, (m) => m.replace(/\s+/g, ''));
  return sq === s ? [s] : [s, sq];
}
const inIpRange = (n) => n >= 16777216 && n <= 4294967295;
const looksLikeDate = (t) => { // 20261019 같은 날짜는 숫자 IP 로 보지 않는다
  if (t.length !== 8) return false;
  const y = +t.slice(0, 4), m = +t.slice(4, 6), d = +t.slice(6);
  return y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
};
const bigIp = (s) => (s.match(BIGNUM) || []).some((t) => inIpRange(+t) && !looksLikeDate(t));
// 링크 모양이 무엇인가: 'link' | 'email' | null. strict=false 면(보내는 이 칸: 연락처 문자열) 주소 모양(scheme·www)만 막고 이메일·도메인 모양은 허용
// 완벽히 막을 수는 없다. 우회는 서버 쪽 한도(M4)에 맡긴다(클라이언트 검사는 친절한 1차 거름망).
export function linkKind(v, strict = true) {
  const forms = linkForms(v);
  for (const s of forms) if (SCHEME.test(s) || SLASHES.test(s) || WWW.test(s)) return 'link';
  if (SCHEME_SQUEEZED.test(forms[0].replace(/\s+/g, ''))) return 'link';
  if (!strict) return null;
  for (const s of forms) if (EMAIL.test(s)) return 'email';
  for (const s of forms) if (IPV4.test(s) || IP_HEX.test(s) || bigIp(s) || DOMAIN.test(s)) return 'link';
  return null;
}
export const hasLink = (v, strict = true) => linkKind(v, strict) !== null;

const hasSubstance = (s) => /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(s);
export function feedbackKey(clean) { return (clean.title + '\u0001' + clean.body).toLowerCase(); }

// 검증: raw {title, from, body, honey}, ctx {now, openedAt, recentKeys}. 반환 {ok, reason, field, silent, clean}
//  honeypot 은 silent(화면에는 성공처럼 보이고 보내지 않는다). 길이를 넘으면 자르지 않고 거부한다(too_long)
export function validateFeedback(raw = {}, ctx = {}) {
  const r = raw || {};
  const clean = { title: cleanText(r.title), from: cleanText(r.from), body: cleanText(r.body, true) };
  const no = (reason, field, extra) => ({ ok: false, reason, field, clean, message: FB_TEXT[reason], ...extra });
  if (r.honey != null && String(r.honey) !== '') return no('honeypot', null, { silent: true, message: '' });
  if (ctx.now != null && ctx.openedAt != null && ctx.now - ctx.openedAt < FB_COOL.minOpenMs) return no('too_fast', null);
  if (!hasSubstance(clean.title)) return no('empty_title', 'title');
  if (!hasSubstance(clean.body)) return no('empty_body', 'body');
  const L = { title: cpLen(clean.title), from: cpLen(clean.from), body: cpLen(clean.body) };
  if (L.title > FB_LIMIT.title) return no('too_long', 'title');
  if (L.from > FB_LIMIT.from) return no('too_long', 'from');
  if (L.body > FB_LIMIT.body) return no('too_long', 'body');
  if (L.title + L.from + L.body > FB_LIMIT.total) return no('too_long', 'body');
  const kt = linkKind(clean.title), kb = linkKind(clean.body);
  if (kt || kb) return no(kt || kb, kt ? 'title' : 'body');
  if (clean.from && hasLink(clean.from, false)) return no('link', 'from');
  if (Array.isArray(ctx.recentKeys) && ctx.recentKeys.includes(feedbackKey(clean))) return no('duplicate', null);
  return { ok: true, reason: null, field: null, clean };
}

// 쿨다운: sentAt = 성공한 전송 시각(ms) 목록. 실패한 전송은 넣지 않는다. 반환 {ok, reason:'gap'|'daily', waitMs}
export function checkCooldown(sentAt, now) {
  const recent = (Array.isArray(sentAt) ? sentAt : []).filter((t) => Number.isFinite(t) && t <= now + 60000 && now - t < FB_COOL.dayMs).sort((a, b) => a - b);
  const last = recent[recent.length - 1];
  if (last != null && now - last < FB_COOL.gapMs) return { ok: false, reason: 'gap', waitMs: FB_COOL.gapMs - (now - last) };
  if (recent.length >= FB_COOL.perDay) return { ok: false, reason: 'daily', waitMs: FB_COOL.dayMs - (now - recent[0]) };
  return { ok: true, reason: null, waitMs: 0 };
}
export const pruneSent = (sentAt, now) => (Array.isArray(sentAt) ? sentAt : []).filter((t) => Number.isFinite(t) && now - t < FB_COOL.dayMs);

// 보관 기간(D-25, 90일)이 지난 의견을 거른다
export const pruneBox = (box, now, days = 90) => (Array.isArray(box) ? box : []).filter((x) => x && Number.isFinite(x.at) && now - x.at < days * 86400000);

// 메일에 담길 모양(글자만). Web3Forms 필드 이름 subject·name·message
export function mailPreview(clean) {
  return { subject: '[골목냥 의견] ' + clean.title, name: clean.from || '(이름 없음)', message: clean.body };
}
