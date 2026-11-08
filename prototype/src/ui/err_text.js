// 서버 오류 코드 -> 화면 문구 (설계 2차_연결_필터.md 3-6). 어떤 단어가 걸렸는지는 알려 주지 않는다. 코드가 없으면 fallback.
import { FILTER_MSG } from '../core/text_filter.js';
const TEXT = {
  ...FILTER_MSG, need_member: '로그인한 회원만 할 수 있어요', feature_off: '아직 준비 중인 기능이에요', need_admin: '잠시 뒤 다시 시도해 주세요',
  rate_limit: '잠시 뒤에 다시 해 주세요', dup: '같은 내용이 이미 있어요',
  name_limit: '한 지역 고양이에게는 이름을 5개까지 제안할 수 있어요', network: '네트워크가 불안정해요. 잠시 뒤 다시 눌러 주세요',
};
// 홍보(8-5)는 같은 코드라도 문구가 달라 따로 둔다
export const PROMO_TEXT = { busy: '지금은 다른 동네 홍보가 나가는 중이라 이번엔 묻혔어요', rate_limit: '홍보는 1분에 한 번만 할 수 있어요', blocked: '홍보를 너무 자주 눌러서 잠시 쉬어요', bad_text: '이 이름으로는 홍보할 수 없어요', network: '연결이 끊겨 홍보를 보내지 못했어요', auth: '연결이 끊겨 홍보를 보내지 못했어요', not_sent: '홍보가 사이트에 전달되지 못했어요. 잠시 뒤 다시 해 주세요' };
export const errText = (ex, fallback) => (ex && ex.code && TEXT[ex.code]) || fallback;
