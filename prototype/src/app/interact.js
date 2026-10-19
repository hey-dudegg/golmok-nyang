// App 의 교감·말풍선·캡쳐 부분. main.js 가 App.prototype 에 붙인다
import * as THREE from 'three';
import { REACTIONS } from '../core/behavior.js';
import { regionFull } from '../core/regions.js';
import { PET_PARTS } from '../core/touch_rules.js';
import { clamp } from '../core/util.js';
import { Clock } from '../state/clock.js';
import { Bonds } from '../state/members.js';
import { askCat } from '../sim/ask_cat.js';
import { openCapture } from '../ui/board.js';
import { renderCard } from '../ui/card.js';
import { $, h, toast } from '../ui/dom.js';
import { requireGate } from '../ui/signup.js';

export class AppInteract {
  // ── 교감 ──
  interact(act) {
    const gateKey = act.kind === 'churu' ? 'churu' : act.kind === 'pet' ? 'pet' : 'cat_words';
    requireGate(this, gateKey, null, async () => {
      const a = this.selected;
      if (this.away) return toast('고양이가 인근 지역에 놀러 가서 지금은 만날 수 없어요');
      if (a && a.guest) return toast('손님 고양이는 구경만 할 수 있어요');
      if (!a || this.busy) return;
      this.busy = true; renderCard(this);
      a.lookAtYou = 1; a.earTwitch(0); a.earTwitch(1);
      if (act.kind === 'pet') this.showHand(a, act.part);
      if (act.kind === 'churu') this.showChuru();
      if (act.kind === 'word') this.youSay(act.text);
      const t0 = performance.now();
      const res = await askCat(a, act);
      const wait = 700 - (performance.now() - t0); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.busy = false;
      if (!this.agents.includes(a)) { renderCard(this); return; }
      a.react(res.reaction);
      Clock.markTouch(a.cat); if (res.reaction === 'eat_churu') Clock.markFed(a.cat); // 표시용 상태에만 반영 (일정은 모두에게 같게 유지)
      this.thought = { id: a.cat.id, text: res.thought, by: res.by, emo: res.emo };
      const what = act.kind === 'pet' ? `${PET_PARTS.find((x) => x[0] === act.part)[1]} 쓰다듬기` : act.kind === 'churu' ? '츄르' : `"${act.text}"`;
      await Bonds.bump(a.cat.id, res.trust_delta, `${what} → ${REACTIONS[res.reaction].label}`);
      renderCard(this);
    });
  }
  // 쓰다듬는 부위의 월드 좌표: 뼈대(머리·가슴·엉덩이)에 붙은 자리에서 계산해 앉음·누움·걷기 어느 자세에서도 그 부위를 따라간다
  petPoint(a, part, out) {
    const R = a.v.rig; a.v.root.updateWorldMatrix(true, true);
    // 뼈대 로컬 좌표(앞이 +z, 위가 +y). 머리는 머리 크기만큼 배율이 걸려 있다
    if (part === 'chin') return R.head.localToWorld(out.set(0, -0.07, 0.07));
    if (part === 'back') return R.chest.localToWorld(out.set(0, 0.09, -0.04));
    if (part === 'belly') return R.chest.localToWorld(out.set(0, -0.07, -0.02));
    return R.head.localToWorld(out.set(0, 0.075, 0));
  }
  showHand(a, part = 'head') {
    const el = $('#hand'); const v = new THREE.Vector3(); const t0 = performance.now();
    el.style.opacity = '1';
    const tick = () => {
      const k = (performance.now() - t0) / 1700; if (k > 1 || !this.agents.includes(a)) { el.style.opacity = '0'; return; }
      this.petPoint(a, part, v); v.project(this.s.camera);
      const sx = (v.x * 0.5 + 0.5) * innerWidth + Math.sin(k * 14) * 16, sy = (-v.y * 0.5 + 0.5) * innerHeight - 10;
      el.style.left = sx + 'px'; el.style.top = sy + 'px'; el.style.transform = `translate(-50%,-50%) rotate(${Math.sin(k * 14) * 8 - 10}deg)`;
      requestAnimationFrame(tick);
    };
    tick();
  }
  showChuru() {
    if (!this.churu) {
      const g = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.15, 12), new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.6 }));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.05, 12), new THREE.MeshStandardMaterial({ color: '#c44b6a', roughness: 0.5 }));
      band.position.y = 0.02; const goo = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshStandardMaterial({ color: '#d9a066', roughness: 0.4 }));
      goo.position.y = -0.08; g.add(tube, band, goo); g.rotation.z = 2.3; this.churu = g;
    }
    const y = this.youPoint(); this.churu.position.set(y.x, 0.14, y.z); this.churu.rotation.y = Math.atan2(this.s.camera.position.x - y.x, this.s.camera.position.z - y.z);
    this.s.scene.add(this.churu); clearTimeout(this.churuT); this.churuT = setTimeout(() => this.s.scene.remove(this.churu), 9000);
  }
  youSay(text) {
    const el = h('div', { class: 'bubble', style: `left:50%;top:${innerHeight * 0.74}px;background:var(--lamp-soft);color:var(--ink)`, text: '나: ' + text });
    $('#bubbles').append(el); setTimeout(() => { el.style.opacity = '0'; }, 1800); setTimeout(() => el.remove(), 2300);
  }
  dropBubble(a) { this.bubbles = this.bubbles.filter((b) => { if (b.a === a) { b.el.remove(); return false; } return true; }); }
  say(a, text) {
    const old = this.bubbles.find((b) => b.a === a); if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = h('div', { class: 'bubble', text });
    $('#bubbles').append(el);
    this.bubbles.push({ a, el, t: 2.6 });
  }
  // ── 캡쳐 ──
  capture() {
    const R = this.s.renderer, cv = R.domElement;
    const pr = R.getPixelRatio(), w = innerWidth, hgt = innerHeight;
    const k = clamp(2000 / (w * pr), 1, 2);
    R.setPixelRatio(pr * k); R.setSize(w, hgt, false);
    R.render(this.s.scene, this.s.camera);
    const W0 = cv.width, H0 = cv.height;
    const c = document.createElement('canvas'); const strip = Math.round(H0 * 0.07);
    c.width = W0; c.height = H0 + strip;
    const x = c.getContext('2d'); x.drawImage(cv, 0, 0);
    R.setPixelRatio(pr); R.setSize(w, hgt, false);
    R.render(this.s.scene, this.s.camera);
    // 이름표 띠
    x.fillStyle = '#1f3d78'; x.fillRect(0, H0, c.width, strip);
    const a = this.selected;
    const kst = new Date(Date.now() + 9 * 3600000);
    const ds = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
    x.fillStyle = '#f2f5fb'; x.textBaseline = 'middle';
    x.font = `700 ${Math.round(strip * 0.42)}px "Gowun Batang","Noto Serif KR",serif`;
    const title = a ? a.cat.name : this.dong.n;
    x.fillText(title, strip * 0.45, H0 + strip / 2);
    const tw = x.measureText(title).width;
    x.font = `400 ${Math.round(strip * 0.28)}px "Gowun Dodum","Noto Sans KR",sans-serif`;
    x.globalAlpha = 0.85;
    x.fillText(`${regionFull(this.dong)} · ${ds}`, strip * 0.45 + tw + strip * 0.4, H0 + strip / 2);
    x.textAlign = 'right'; x.fillText('골목냥', c.width - strip * 0.45, H0 + strip / 2);
    x.globalAlpha = 1;
    const url = c.toDataURL('image/png');
    openCapture(this, url, { catId: a ? a.cat.id : null, catName: a ? a.cat.name : null, pattern: a ? a.cat.g.pattern : null, dongName: this.dong.n });
  }
}
