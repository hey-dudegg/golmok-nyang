// core/name_rules.js: 이름 짓기 규칙값 (원래 index.html 66_names 구역, D-31·D-33 단계 2). 저장·투표(Names)는 index.html 에 남는다.
export const NAME_BAD = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202f\\u2060-\\u206f\\ufeff]', 'g'); // 제어문자·보이지 않는 글자
export const NAME_RULE = { PER_SESSION: 5, CAP: 40, REPORT_DEL: 5, MAXLEN: 8, SHOW: 10 };
