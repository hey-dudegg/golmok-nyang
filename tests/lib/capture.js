// 시험용 촬영 도구(M15-1). 앱 코드는 고치지 않고 window.__app만 쓴다.
// 문제: 앱 루프(main.js frame)가 매 프레임 controls.target·camAnim·controls.update로 카메라를 덮어쓰고,
//       ?still=N 이면 루프가 멈춰 바꾼 카메라가 그려지지도 않는다. 그래서 controls.update를 갈아 끼워 고정하고, 직접 한 번 그린다.
// 사용: await fixCamera(page,{target:[x,y,z] 또는 생략(마스코트 따라가기), dist, yaw, pitch}) → await hidePanels(page) → await shoot(page, 'out.png')
//   yaw: 도(0이면 +z쪽에서 바라봄, 90이면 +x쪽), pitch: 도(위에서 내려다볼수록 +). 어느 순서든 shoot 전에 fixCamera.
// hideObjects(page,['car']): 차 등 가리기(촬영 전용)
const { wait } = require('./common');

async function fixCamera(page, { target, dist = 1.2, yaw = 0, pitch = 15, fov } = {}) {
  return page.evaluate((target, dist, yaw, pitch, fov) => {
    const app = window.__app, s = app.s, cam = s.camera, ct = s.controls, R = Math.PI / 180;
    // target 'cat'(기본)이면 마스코트의 화면 위치(v.root, 그리기 직전 값)를 매 프레임 따라간다. 숫자 3개면 그 점에 고정.
    const follow = !Array.isArray(target), T = [0, 0, 0], P = [0, 0, 0], root = app.mascot.v.root.position;
    const calc = () => {
      const t = follow ? [root.x, root.y + 0.2, root.z] : target;
      for (let i = 0; i < 3; i++) T[i] = t[i];
      P[0] = T[0] + dist * Math.cos(pitch * R) * Math.sin(yaw * R); P[1] = T[1] + dist * Math.sin(pitch * R); P[2] = T[2] + dist * Math.cos(pitch * R) * Math.cos(yaw * R);
    };
    app.camAnim = null; app.selected = null; app.stepFindCat = null; ct.enabled = false;
    if (fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (cam.view && cam.view.enabled) cam.clearViewOffset();
    const apply = () => { calc(); ct.target.set(...T); cam.position.set(...P); cam.lookAt(ct.target); };
    ct.update = apply; apply(); // 앱 루프는 target을 건드려도 update 직후 여기서 되돌린다
    if (!window.__fixedCam) window.__fixedCam = true;
    return { pos: P.map((v) => +v.toFixed(2)), target: T.map((v) => +v.toFixed(2)) };
  }, target, dist, yaw, pitch, fov);
}

// 어드민 패널·명단·카드·토스트 등 캔버스 밖 화면 요소를 숨긴다(말풍선은 남긴다).
async function hidePanels(page) {
  return page.evaluate(() => {
    let n = 0;
    for (const el of document.body.children) {
      if (/^(CANVAS|SCRIPT|STYLE)$/.test(el.tagName) || el.id === 'loading' || el.id === 'stage' || el.contains(document.querySelector('canvas')) || /bubble/.test(el.className)) continue;
      if (getComputedStyle(el).position === 'fixed' || el.classList.contains('ui') || el.id) { el.style.visibility = 'hidden'; n++; }
    }
    return n;
  });
}

// 촬영용 그리기 루프를 돌리고(?still 로 앱 루프가 멈춰 있어도 되고, 그리기 버퍼가 비워져 흰/회색 화면이 되는 것도 막는다) 사진을 저장한다.
async function shoot(page, path, { settle = 400 } = {}) {
  await page.evaluate(() => {
    if (window.__shootLoop) return; window.__shootLoop = true;
    const a = window.__app, go = () => { a.s.renderer.render(a.s.scene, a.s.camera); requestAnimationFrame(go); }; go();
  });
  await wait(settle);
  await page.screenshot({ path });
  return path;
}

// 촬영할 때만 장면의 정적 소품(차 등)을 가린다. kinds: 'car'·'crate' 등 종류 이름 또는 id 앞부분(정규식 문자열 가능). 충돌·행동은 그대로.
async function hideObjects(page, kinds) {
  return page.evaluate((kinds) => {
    const a = window.__app, re = new RegExp('^(' + [].concat(kinds).join('|') + ')'), hit = [];
    a.s.scene.traverse((o) => { if (o.userData && o.userData.propId && re.test(String(o.userData.propId))) { o.visible = false; hit.push(o.userData.propId); } });
    return hit;
  }, kinds);
}

module.exports = { fixCamera, hidePanels, hideObjects, shoot };
