// 함께 보기 (M0-2): 보는 사람 수(Live)·홍보하기(Promo) (R-12, R-08)
import * as THREE from 'three';
import { clamp, fmtCount } from '../core/util.js';
import { Caps } from '../adapters/caps.js';
import { REGIONS } from '../adapters/regions_data.js';
import { store } from '../adapters/store.js';
import { PROMO, adminPowers } from '../state/gate.js';
import { $, h, toast } from './dom.js';

// ───────────────────────── 함께 보기 (M0-2): 보는 사람 수 · 홍보하기 · 공유하기 (R-12, R-08, R-11) ─────────────────────────
// 사람 수와 홍보는 Caps.room / Caps.lock 위에서만 동작한다. 로컬에서는 모의 어댑터(D-21), 배포 후에는 Supabase Presence·Broadcast·RPC가 같은 자리에 들어온다.
export const Live = {
  app: null, region: null, fake: null, shown: 1,
  init(app) {
    this.app = app;
    if (Caps.room) { Caps.room.onCount(() => this.render()); Caps.room.on((kind, data) => { if (kind === 'promo') Promo.receive(data); }); }
    this.setRegion(app.dong.c);
  },
  setRegion(code) { this.region = code; if (Caps.room) Caps.room.join('r:' + code); this.render(); },
  real() { return Caps.room ? Caps.room.count('r:' + this.region) : 1; }, // 이 지역을 지금 보고 있는 사람(나 포함)
  value() { return this.fake != null ? this.fake : this.real(); },
  render() {
    const n = this.value(), el = $('#viewers'); if (!el) return;
    $('#viewersN').textContent = fmtCount(n);
    el.setAttribute('aria-label', `지금 보고 있는 사람 ${n.toLocaleString('ko-KR')}명`);
    el.title = `이 지역을 지금 보고 있는 사람 ${n.toLocaleString('ko-KR')}명`;
    if (n > this.shown) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    this.shown = n;
  },
};

export const Promo = {
  timer: null, lastAt: +store.get('promoAt', 0) || 0,
  // 지금 장면에서 고양이 쪽을 160px 정사각으로 잘라 작은 사진으로 만든다 (약 10KB)
  thumb(app) {
    const R = app.s.renderer, cv = R.domElement, a = app.selected || app.mascot;
    R.render(app.s.scene, app.s.camera);
    const sz = Math.round(Math.min(cv.width, cv.height) * 0.5);
    let cx = cv.width / 2, cy = cv.height / 2;
    if (a) { const v = new THREE.Vector3(); a.v.rig.chest.getWorldPosition(v); v.project(app.s.camera); if (v.z < 1) { cx = (v.x * 0.5 + 0.5) * cv.width; cy = (-v.y * 0.5 + 0.5) * cv.height; } }
    const sx = clamp(cx - sz / 2, 0, cv.width - sz), sy = clamp(cy - sz / 2, 0, cv.height - sz);
    const c = document.createElement('canvas'); c.width = c.height = 160;
    c.getContext('2d').drawImage(cv, sx, sy, sz, sz, 0, 0, 160, 160);
    return c.toDataURL('image/jpeg', 0.7);
  },
  left() { return PROMO.cooldownMs - (Date.now() - this.lastAt); },
  async press(app) {
    if (app.away) return toast('고양이가 인근 지역에 놀러 가서 지금은 홍보할 수 없어요');
    if (!adminPowers() && this.left() > 0) return toast(`홍보는 1분에 한 번만 할 수 있어요 (${Math.ceil(this.left() / 1000)}초 뒤)`);
    if (!Caps.room || !Caps.lock) return toast('이 화면에서는 홍보를 내보낼 수 없어요');
    const m = app.selected && !app.selected.guest ? app.selected : app.mascot; if (!m) return;
    const data = { code: app.dong.c, name: m.cat.name, where: app.dong.n, thumb: this.thumb(app), at: Date.now() };
    const ok = await Caps.lock.acquire('promo', { holder: Caps.room.id, ttlMs: PROMO.lockMs });
    if (!ok) return toast('지금은 다른 동네 홍보가 나가는 중이라 이번엔 묻혔어요', 3600);
    this.lastAt = Date.now(); store.set('promoAt', this.lastAt);
    Caps.room.send('promo', data);
    const b = $('#promo'); b.classList.add('blast'); setTimeout(() => b.classList.remove('blast'), 900);
    toast('구경 오세요! 사이트 전체에 홍보를 내보냈어요');
  },
  // 다른 사람의 홍보가 도착. 이미 그 지역을 보고 있으면 띄우지 않는다
  receive(d) {
    const app = Live.app;
    if (!app || !d || typeof d.code !== 'string' || !REGIONS.unitOf(d.code) || d.code === app.dong.c) return;
    this.show(d);
  },
  show(d) {
    const app = Live.app; if (!app) return;
    this.hide();
    const name = String(d.name || '').slice(0, 20), where = String(d.where || '').slice(0, 20);
    const thumb = typeof d.thumb === 'string' && d.thumb.startsWith('data:image/jpeg') ? d.thumb : '';
    const b = h('button', { id: 'promoBanner', type: 'button', 'aria-label': `${name} 구경 오세요, ${where}. 누르면 그 지역으로 이동해요`, style: `--dur:${PROMO.showMs}ms`, onclick: () => { this.hide(); app.visit(d.code); } },
      thumb ? h('img', { src: thumb, alt: '' }) : null,
      h('div', {}, h('div', { class: 't1' }, h('b', { text: name }), ' 구경 오세요!'), h('div', { class: 't2', text: `${where} · 눌러서 가 보기` })),
      h('i', { class: 'timebar' }));
    document.body.append(b);
    this.timer = setTimeout(() => this.hide(), PROMO.showMs);
  },
  hide() { clearTimeout(this.timer); const b = $('#promoBanner'); if (b) b.remove(); },
};
