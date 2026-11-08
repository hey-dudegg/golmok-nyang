// core/text_filter.js: 글·이름 필터의 앱 쪽 정규식 검사 (설계 2차_연결_필터.md 3-2, M2-6b). 서버 gn_text_check 와 같은 결과를 내야 한다(tests/filter_cases.json).
// 앱은 정규식만 미리 검사해 빠르게 안내한다. 금칙어는 서버만 안다(저장소에 목록을 두지 않음). 어떤 단어가 걸렸는지는 알려 주지 않는다.
const ZW = /[​-‏⁠﻿]/g;
const SEP = /[\s.,·*~!/|_-]/g;

export const FILTER_MSG = {
  filter_word: '쓸 수 없는 말이 있어요', filter_url: '링크는 올릴 수 없어요', filter_contact: '연락처·메신저 아이디는 올릴 수 없어요', filter_chars: '한글·영문·숫자만 쓸 수 있어요',
};

// n1: NFKC 정규화·소문자·0폭 문자 제거. n2: n1 에서 공백·구분 기호까지 제거(단어를 띄어 써서 피하는 것 대비)
export function normText(txt) {
  const n1 = String(txt == null ? '' : txt).normalize('NFKC').toLowerCase().replace(ZW, '');
  return { n1, n2: n1.replace(SEP, '') };
}

const URL_RES = [/(https?:\/\/|www\.)/, /[a-z0-9-]+\.(com|net|org|kr|co|io|me|ly|gg|xyz|site|shop|link|app|to)(?![a-z0-9])/, /(닷컴|닷넷|점컴|open\.kakao)/];
const PHONE_RES = [/[0-9]{9,}/, /01[016789][0-9]{7,8}/, /공일공/];
const MAIL_RES = [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/, /골뱅이/];
// ㅋㅌ 는 NFKC 로 바뀌므로(호환 자모 -> 첫가끝 자모) 바뀐 모양(\u110f\u1110)으로 쓴다. 서버 정규식도 같다
const MSGR_RES = [/(카톡|카카오톡|\u110f\u1110|오픈채팅|오픈톡|텔레그램|텔레|디엠|인스타|\b(?:katalk|kakao|telegram|line|dm|insta))\s*(아이디|id)?\s*[:：]?\s*[a-z0-9._-]{4,}/, /@[a-z0-9_.]{4,}/];

// kind: 'post'|'comment'|'name'|'nick'. 걸리면 오류 코드('filter_chars'|'filter_url'|'filter_contact'), 아니면 null
export function checkText(kind, txt) {
  if ((kind === 'name' || kind === 'nick') && !/^[가-힣a-z0-9 ]+$/i.test(String(txt == null ? '' : txt).trim())) return 'filter_chars';
  const { n1, n2 } = normText(txt);
  if (URL_RES.some((r) => r.test(n1))) return 'filter_url';
  if (PHONE_RES.some((r) => r.test(n2)) || MAIL_RES.some((r) => r.test(n1)) || MSGR_RES.some((r) => r.test(n1))) return 'filter_contact';
  return null;
}
