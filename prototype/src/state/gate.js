// 회원 범위 설정표(GATE, D-16)·어드민 상태(Admin)·공유 채널(D-17)·홍보 설정(D-15)
import { Member } from './members.js';

// 회원 범위 설정표 (D-16). 버튼마다 흩어진 확인을 이 표 하나로 모은다. '회원' | '누구나'. 어드민은 이 표를 무시한다.
export const GATE = {
  promo: '회원', churu: '회원',
  board_write: '회원', board_comment: '회원', // 게시판은 관리 편의상 회원
  pet: '누구나', cat_words: '누구나', drop_item: '누구나',
  name_suggest: '누구나', name_like: '누구나', name_report: '누구나', board_like: '누구나',
  capture: '누구나', share: '누구나', feedback: '누구나', // 의견 보내기는 비회원도 (R-16)
};
export const GATE_LABEL = { promo: '홍보하기', churu: '츄르 주기', board_write: '게시판 글쓰기', board_comment: '게시판 댓글', pet: '쓰다듬기', cat_words: '고양이 말', drop_item: '물건 놓기',
  name_suggest: '이름 제안', name_like: '이름 좋아요·싫어요', name_report: '이름 신고', board_like: '게시판 좋아요', capture: '캡쳐', share: '공유', feedback: '의견 보내기' };
export const Admin = { active: false, wantsPage: new URLSearchParams(location.search).has('admin'), view: 'admin' }; // active는 소유자 확인 뒤 켜진다. view: 어드민 | 회원 | 비회원 화면 (설계 9장 이벤트 시험)
export const adminPowers = () => Admin.active && Admin.view === 'admin'; // 어드민 화면에서만 설정표를 무시한다
export const isMemberNow = () => (Admin.active && Admin.view === 'member') || (!(Admin.active && Admin.view === 'guest') && !!Member.me);
export const gateNeedsMember = (key) => !adminPowers() && GATE[key] === '회원' && !isMemberNow();
export const nickOf = () => (Member.me ? Member.me.nick : Admin.active ? '어드민' : '이웃');
// 공유 채널 켜짐 설정 (D-17). 카카오톡·인스타는 만들어 두고 비활성. 어드민이 화면 확인용으로 켜 볼 수 있다
export const SHARE_ENABLED = { link: true, x: true, threads: true, kakao: false, insta: false };
export const PROMO = { lockMs: 10000, showMs: 5000, cooldownMs: 60000 }; // D-15
export function gatedList() { return Object.keys(GATE).filter((k) => GATE[k] === '회원').map((k) => GATE_LABEL[k]).join(', ') || '일부 기능'; }
