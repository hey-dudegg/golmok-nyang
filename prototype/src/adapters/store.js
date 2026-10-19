// 브라우저 저장(localStorage, 키 앞에 golmok:) 도우미와 로컬 회원·게시판·유대 저장 (D-21)

// ───────────────────────── util ─────────────────────────
export const store = {
  get(k, d) { try { const v = localStorage.getItem('golmok:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('golmok:' + k, JSON.stringify(v)); } catch (e) {} },
};
export const Local = {
  member: () => store.get('member', null),
  setMember: (m) => store.set('member', m),
  posts: () => store.get('posts', []),
  // 게시판 글 보관 상한 60개(이전 12). 글마다 사진이 최대 약 190KB라 브라우저 저장 한도(약 5MB)를 넘으면 오래된 글부터 덜어 내고 다시 저장한다
  POSTS_MAX: 60,
  setPosts(p) {
    let n = Math.min(p.length, this.POSTS_MAX);
    for (;;) { // n=0(빈 목록)도 반드시 저장한다. 저장 실패 시에만 덜어 내고 다시 시도
      try { localStorage.setItem('golmok:posts', JSON.stringify(p.slice(0, n))); return n; } catch (e) { if (n < 1) return 0; n = Math.floor(n * 0.7); }
    }
  },
  bonds: () => store.get('bonds', {}),
  setBonds: (b) => store.set('bonds', b),
};
