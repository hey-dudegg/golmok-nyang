// core/box.js: 선물 상자 순수 규칙 (M6-2, 설계 docs/design/상자_놓기_설계.md 2·3장). three·DOM·네트워크 없음.
import { NAME_RULE } from './name_rules.js';
import { checkText } from './text_filter.js';

export const BOX_SIDO_CODES = ['11', '12', '26', '27', '28', '30', '31', '36', '41', '43', '44', '47', '48', '50', '51', '52']; // 시/도 16곳 (weather_data 와 같은 목록)
export const BOX_MAX_MS = 2 * 3600 * 1000; // 받을 때 until - placed 상한(2시간)
export const BOX_FALLBACK_NAME = '이웃님';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 서버 시각 추정: offset = 응답.now - Date.now()
export const serverNow = (offset, localNowMs) => localNowMs + (Number(offset) || 0);
// 만료 판정: until <= 서버시각이면 만료 (서버 box_list 의 until > now() 와 같다)
export const boxActive = (box, serverNowMs) => !!box && Number.isFinite(box.until) && box.until > serverNowMs;
export const boxRemainMs = (box, serverNowMs) => (box && Number.isFinite(box.until) ? Math.max(0, box.until - serverNowMs) : 0);
// 남은 시간 문구: 1분 단위 내림, 1분 미만은 "곧 사라져요"
export function boxRemainText(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return m < 1 ? '곧 사라져요' : '약 ' + m + '분 남음';
}
// 이름 글자 검사: 1~10자, 이름 짓기와 같은 글자(한글·영문·숫자·띄어쓰기)·연락처/URL 정규식
export function boxNameOk(name) {
  if (typeof name !== 'string') return false;
  const n = [...name].length;
  return n >= 1 && n <= NAME_RULE.SHOW && checkText('name', name) === null;
}
// 표시 문구: 이름이 있으면 "○○님의 상자", 없으면(null·숨김) "이웃님의 상자" (D-119). 화면에는 textContent 로만 넣는다
export const boxLabel = (name) => (boxNameOk(name) ? name.trim() : BOX_FALLBACK_NAME) + '의 상자';
// 받은 방송/응답 검사. 올바르면 정리한 { code, id, placed, until, seed, name, at }, 아니면 null (버린다)
export function validateBoxPayload(p) {
  if (!p || typeof p !== 'object') return null;
  const { code, id, placed, until, seed, name, at } = p;
  if (!BOX_SIDO_CODES.includes(code) || typeof id !== 'string' || !UUID_RE.test(id)) return null;
  if (!Number.isFinite(placed) || !Number.isFinite(until) || until <= placed || until - placed > BOX_MAX_MS) return null;
  if (!Number.isInteger(seed)) return null;
  if (name !== null && name !== undefined && !boxNameOk(name)) return null;
  return { code, id, placed, until, seed, name: name == null ? null : name.trim(), at: Number.isFinite(at) ? at : null };
}
