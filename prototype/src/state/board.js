// 자유게시판 글 목록(Board): Caps.db 또는 브라우저 저장, 다른 탭 변경 반영
import { Caps } from '../adapters/caps.js';
import { Local } from '../adapters/store.js';
import { Member } from './members.js';

export const Board = {
  posts: [], listeners: [], unsub: null,
  on(fn) { this.listeners.push(fn); },
  emit() { for (const f of this.listeners) f(this.posts); },
  start() {
    if (Caps.db) {
      try {
        this.unsub = Caps.db.collection('posts').orderBy('createdAt', 'desc').limit(60).onSnapshot((snap) => {
          this.posts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); this.emit();
        }, () => { this.posts = []; this.emit(); });
      } catch (e) { this.posts = []; this.emit(); }
    } else {
      this.posts = Local.posts(); this.emit();
      // 로컬 모드: 다른 탭이 올린 글·좋아요·댓글이 새로고침 없이 보이게 저장소 변경을 듣는다
      if (!this.storageOn) { this.storageOn = true; addEventListener('storage', (e) => { if (!Caps.db && (e.key === 'golmok:posts' || e.key === null)) { this.posts = Local.posts(); this.emit(); } }); }
    }
  },
  async add(post) {
    if (Caps.db) { const ref = await Caps.db.collection('posts').add(post); return ref.id; }
    const id = 'l' + Date.now(); this.posts = [{ id, ...post }, ...Local.posts()]; Local.setPosts(this.posts); this.emit(); return id;
  },
  async like(post, on) {
    const me = Caps.uid || 'local';
    if (Caps.db) await Caps.db.doc('posts/' + post.id).update({ likes: { [me]: on } });
    else { this.posts = Local.posts(); const p = this.posts.find((x) => x.id === post.id); if (!p) return; p.likes = { ...(p.likes || {}), [me]: on }; Local.setPosts(this.posts); this.emit(); }
  },
  async comment(post, text) {
    const cid = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const c = { uid: Caps.uid || 'local', nick: Member.me ? Member.me.nick : '이웃', text, at: Date.now() };
    if (Caps.db) await Caps.db.doc('posts/' + post.id).update({ comments: { [cid]: c } });
    else { this.posts = Local.posts(); const p = this.posts.find((x) => x.id === post.id); if (!p) return; p.comments = { ...(p.comments || {}), [cid]: c }; Local.setPosts(this.posts); this.emit(); }
  },
  async remove(post) {
    if (Caps.db) await Caps.db.doc('posts/' + post.id).delete();
    else { this.posts = Local.posts().filter((x) => x.id !== post.id); Local.setPosts(this.posts); this.emit(); }
  },
};
