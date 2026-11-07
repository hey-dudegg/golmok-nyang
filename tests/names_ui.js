// M2-6a 화면 시험(모의 모드): 이름 짓기 안내 팝업 1회·입력칸 아래 안내문, 익명 제안·투표(가입 시트 없이), 게시판 글쓰기 '준비 중' 표시.
// 사용: node tests/names_ui.js   (스크린샷: tests/out/names_*.png)
const fs = require('fs');
const path = require('path');
const { launch, open, run, wait, OUT } = require('./lib/common');

run('names_ui (익명 이름 짓기·게시판 준비 중)', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await launch();
  const errs = [];
  const res = [];
  const t = (name, ok, info = '') => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
  const p = await open(b, '?still=30&pr=0.3&shells=2#11', { errs, settle: 2500, width: 390, height: 800 });
  const has = (sel) => p.evaluate((s) => !!document.querySelector(s), sel);
  const openNames = () => p.evaluate(() => { const a = window.__app; a.cardTab = 'names'; a.select(a.agents[0], false); return !!a.selected; });
  t('고양이를 골라 이름 탭을 열 수 있다', await openNames());
  await p.waitForSelector('#nameDraft', { timeout: 8000 }).catch(() => {});
  await wait(400);
  t('처음 열면 안내 팝업이 한 번 뜬다', await has('#namesNoticePop'));
  t('localStorage gn_names_notice = 1', await p.evaluate(() => localStorage.getItem('gn_names_notice') === '1'));
  t('입력칸 아래 안내문이 보인다', await p.evaluate(() => { const e = document.querySelector('#namesAnonNote'); return !!e && !e.hidden && e.textContent.includes('지금은 로그인 없이 할 수 있어요'); }));
  await p.screenshot({ path: path.join(OUT, 'names_popup.png') });
  await p.evaluate(() => document.querySelector('#namesNoticePop').closest('.scrim').querySelector('button').click());
  await openNames(); // 다시 그려도 팝업은 다시 안 뜬다
  await wait(400);
  t('다시 열어도 팝업은 다시 안 뜬다, 안내문은 남는다', !(await has('#namesNoticePop')) && await has('#namesAnonNote'));
  // 가입 시트 없이 제안
  await p.evaluate(() => { const i = document.querySelector('#nameDraft'); i.value = '시험냥'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.names form').requestSubmit(); });
  await wait(600);
  t('익명도 가입 시트 없이 이름을 제안한다', !(await has('#nick')) && await p.evaluate(() => /시험냥/.test(document.querySelector('#rankList').textContent)));
  // 게시판: 준비 중
  await p.evaluate(() => window.__app.openBoard());
  await wait(500);
  t('게시판에 준비 중 안내가 있다', await p.evaluate(() => { const e = document.querySelector('#boardLockNote'); return !!e && e.textContent.includes('준비 중'); }));
  await p.screenshot({ path: path.join(OUT, 'names_board.png') });
  t('콘솔 오류 없음', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  return res.every(Boolean);
});
