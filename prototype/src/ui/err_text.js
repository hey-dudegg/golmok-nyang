// 서버 오류 코드 -> 화면 문구 (설계 2차_연결_필터.md 3-6). 어떤 단어가 걸렸는지는 알려 주지 않는다. 코드가 없으면 fallback.
const TEXT = {
  need_member: '로그인한 회원만 할 수 있어요', feature_off: '아직 준비 중인 기능이에요', filter_word: '쓸 수 없는 말이 있어요', filter_url: '링크는 올릴 수 없어요',
  filter_contact: '연락처·메신저 아이디는 올릴 수 없어요', filter_chars: '한글·영문·숫자만 쓸 수 있어요', rate_limit: '잠시 뒤에 다시 써 주세요', dup: '같은 내용이 이미 있어요',
  name_limit: '한 지역 고양이에게는 이름을 5개까지 제안할 수 있어요', network: '네트워크가 불안정해요. 잠시 뒤 다시 눌러 주세요',
};
export const errText = (ex, fallback) => (ex && ex.code && TEXT[ex.code]) || fallback;
