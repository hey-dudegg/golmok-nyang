// 자세 전환 확인판 (M4-6, D-129): 모든 자세 전환을 격자로 나란히 반복 재생한다.
// 시뮬레이션(CatAgent·away)과 분리: PoseQueue 로 자세를 직접 구동하고 CatView 만 쓴다.
// 주소: pose_check.html  [?cols=4&rows=3&from=stand&to=belly&page=0&speed=1&shells=8&still]
import { isTestHost } from '../core/test_host.js';
import { makeGenome } from '../core/genome.js';
import { PoseQueue, blendPose, BODY_KEYS } from '../core/pose_plan.js';
import { damp, makeRng } from '../core/util.js';
import { CatView } from '../render/cat_model.js';
import { POSES, PARAM_KEYS, poseTarget } from '../render/poses.js';
import { Scene3D } from '../render/scene.js';

// 지역 이름이 다른 모듈의 전역 사용 검사(check_imports)와 겹치지 않게 함수 안에 둔다
function main() {

if (!isTestHost(location.hostname)) { document.body.textContent = '로컬에서만 열려요'; throw new Error('not test host'); }
const qp = new URLSearchParams(location.search);
const qnum = (k, d) => (qp.has(k) && isFinite(+qp.get(k)) ? +qp.get(k) : d);
const ncol = qnum('cols', 4), nrow = qnum('rows', 3), speed = qnum('speed', 1), shells = qnum('shells', 8);
const stillMode = qp.has('still'); // 시험·캡쳐용: 시간을 멈추고 __posecheck.advance(초)로만 진행
const poseNames = Object.keys(POSES);
let pairList = [];
for (const a of poseNames) for (const b of poseNames) if (a !== b && (!qp.get('from') || qp.get('from') === a) && (!qp.get('to') || qp.get('to') === b)) pairList.push([a, b]);
const perPage = ncol * nrow, pageN = Math.max(1, Math.ceil(pairList.length / perPage));
let pageNo = qnum('page', 0) % pageN;

const pcs = new Scene3D(document.getElementById('c3d'));
pcs.scene.fog = null; pcs.scene.background = null; pcs.renderer.setClearColor(0x1c1f26, 1);
pcs.renderer.shadowMap.enabled = false; pcs.sky.visible = false; pcs.env.visible = false;
const catView = new CatView(makeGenome(makeRng('posecheck'), { sex: 'f', months: 24 }), shells);
pcs.scene.add(catView.root);
const pcam = pcs.camera; pcam.fov = 28; pcam.updateProjectionMatrix();
const gridEl = document.getElementById('grid'), barEl = document.getElementById('bar');
gridEl.style.gridTemplate = `repeat(${nrow}, 1fr) / repeat(${ncol}, 1fr)`;

let cellList = [];
function buildCells() {
  gridEl.replaceChildren(); cellList = [];
  const set = pairList.slice(pageNo * perPage, pageNo * perPage + perPage);
  for (let i = 0; i < perPage; i++) {
    const div = document.createElement('div'), b = document.createElement('b'), t = document.createElement('i');
    div.append(b, t); gridEl.append(div);
    const p = set[i]; b.textContent = p ? `${p[0]} → ${p[1]}` : '';
    const P = p ? poseTarget(catView.dim, p[0]) : poseTarget(catView.dim, 'stand');
    cellList.push({ div, t, pair: p, P, pq: new PoseQueue(P), clock: stillMode ? 0 : -0.4 * i, phase: 0, maxRoll: 0 });
  }
  barEl.textContent = `쪽 ${pageNo + 1}/${pageN} · 전환 ${pairList.length}개 · 자세 ${poseNames.length}개 · 표시: 몸 회전 최대 속도(도/초)  [?pageNo=n ?from= ?to= ?speed= ?ncol= ?nrow=]`;
}
// 한 칸의 사이클: 출발 자세 0.8초 → 전환과 도착 자세 4.5초 → 처음으로 되돌려 반복
function tickCell(c, dt) {
  if (!c.pair) return;
  c.clock += dt;
  if (c.phase === 0 && c.clock >= 0.8) { c.phase = 1; c.clock = 0; c.pq.set(poseTarget(catView.dim, c.pair[1])); c.vmax = 0; c.prev = BODY_KEYS.map((k) => c.P[k]); }
  else if (c.phase === 1 && c.clock >= 4.5) { c.phase = 0; c.clock = 0; c.pq.set(poseTarget(catView.dim, c.pair[0])); c.pq.snap(); c.t.textContent = ''; }
  c.pq.tick(dt); blendPose(c.P, c.pq.T, PARAM_KEYS, dt, false, damp);
  if (c.phase === 1 && dt > 0) {
    let d = 0; BODY_KEYS.forEach((k, i) => { const e = Math.abs(c.P[k] - c.prev[i]); if (Number.isFinite(e)) d = Math.max(d, e); c.prev[i] = c.P[k]; }); // 값이 없는 키(NaN)는 건너뛴다
    c.vmax = Math.max(c.vmax, d / dt); c.t.textContent = Math.round(c.vmax * 57.3) + '°/s';
  }
}
function loop(now) {
  const dt = stillMode ? 0 : Math.min(0.1, (now - (loop.last || now)) / 1000) * speed; loop.last = now;
  const W = innerWidth, H = innerHeight, pr = Math.min(devicePixelRatio || 1, qnum("pr", 1));
  pcs.renderer.setPixelRatio(pr); pcs.renderer.setSize(W, H, false);
  pcs.renderer.setScissorTest(true); pcs.renderer.setClearColor(0x1c1f26, 1); pcs.renderer.clear();
  for (const c of cellList) {
    tickCell(c, dt);
    const r = c.div.getBoundingClientRect();
    pcam.aspect = r.width / r.height; pcam.position.set(0.9, 0.55, 1.9); pcam.lookAt(0, 0.12, 0); pcam.updateProjectionMatrix();
    Object.assign(catView.pose, c.P);
    catView.plant = c.pq.T.plant; catView.root.rotation.y = 0;
    catView.update(loop.t = (loop.t || 0) + dt / Math.max(1, cellList.length), dt);
    pcs.renderer.setViewport(r.left, H - r.bottom, r.width, r.height); pcs.renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
    pcs.renderer.render(pcs.scene, pcam);
  }
  requestAnimationFrame(loop);
}
buildCells(); requestAnimationFrame(loop);
window.__posecheck = { advance: (sec) => { for (let t = 0; t < sec; t += 1 / 60) for (const c of cellList) tickCell(c, 1 / 60); }, cells: () => cellList, names: poseNames, pairs: pairList, page: (n) => { pageNo = ((n % pageN) + pageN) % pageN; buildCells(); } };
}
main();
