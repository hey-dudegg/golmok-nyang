// R-16 의견 보내기 화면 실제 경로 시험: 버튼·팝업 열고 닫기·포커스·정상 전송·쿨다운·500자 초과·빈 값·허니팟·링크·XSS·실패 유지.
// 사용: node tests/feedback_ui.js   (스크린샷: tests/out/fb_*.png, 눈으로 확인)
const fs = require('fs');
const path = require('path');
const { launch, open, run, wait, OUT } = require('./lib/common');

run('feedback_ui (의견 보내기)', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shot = (p, name) => p.screenshot({ path: path.join(OUT, 'fb_' + name + '.png') });
  const b = await launch();
  const errs = [];
  const res = [];
  const t = (name, ok, info = '') => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
  const msgOf = (p) => p.$eval('#fbMsg', (e) => e.textContent);
  const boxN = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('golmok:feedback_box') || '[]').length);
  const openPop = async (p) => { await p.click('#btnFeedback'); await p.waitForSelector('.fbsheet', { timeout: 5000 }); await wait(150); };
  const setVal = (p, sel, v) => p.evaluate((s, val) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
  const submit = (p) => p.evaluate(() => document.querySelector('#fbSend').click());
  const waitMsg = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector('#fbMsg') ? document.querySelector('#fbMsg').textContent : ''), { timeout: 8000 }, re.source).then(() => true, () => false);
  const resetCool = (p, keys = true) => p.evaluate((k) => { localStorage.removeItem('golmok:feedback_sent'); if (k) localStorage.removeItem('golmok:feedback_keys'); }, keys);
  // 시계를 앞으로 당겨 '열고 3초' 규칙을 기다리지 않고 지나게 한다(시험 전용)
  const before = (pg) => pg.evaluateOnNewDocument(() => { window.__skew = 0; const n = Date.now.bind(Date); Date.now = () => n() + window.__skew; });
  const skew = (pg, ms) => pg.evaluate((d) => { window.__skew += d; }, ms);

  // ── 일반 방문자 화면 (1100x800) ──
  const p = await open(b, '?still=30&pr=0.3&shells=2#11', { errs, settle: 2500, before });
  t('버튼이 있고 aria-label 이 있다', await p.$eval('#btnFeedback', (e) => e.getAttribute('aria-label') === '의견 보내기'));
  t('일반 화면에는 어드민 구역이 없다', await p.evaluate(() => !document.querySelector('#admin') && !document.querySelector('#adFbList')));
  const rects = await p.evaluate(() => ['#btnFeedback', '#btnBoard', '#btnMember', '#clock', '#share', '#promo', '#capture'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, r.left, r.top, r.right, r.bottom]; }));
  const overlap = (a, c) => a[1] < c[3] && c[1] < a[3] && a[2] < c[4] && c[2] < a[4];
  const fbR = rects[0]; const hits = rects.slice(1).filter((r) => overlap(fbR, r)).map((r) => r[0]);
  t('새 버튼이 다른 버튼과 겹치지 않는다(1100)', hits.length === 0, hits.join(','));
  await shot(p, 'desktop_closed');

  await openPop(p);
  t('팝업이 열리고 dialog 이름이 있다', await p.evaluate(() => { const s = document.querySelector('.scrim'); return s && s.getAttribute('role') === 'dialog' && !!document.getElementById('fbHead'); }));
  t('첫 칸에 자동 포커스하지 않는다', await p.evaluate(() => !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)));
  t('개인정보 안내·90일 문구가 있다', await p.evaluate(() => { const x = document.querySelector('.fbsheet').textContent; return x.includes('연락처·주민번호 같은 개인 정보는 적지 말아 주세요') && x.includes('90일'); }));
  t('파일 입력이 없다', await p.evaluate(() => !document.querySelector('.fbsheet input[type=file]')));
  t('허니팟 칸은 탭으로 닿지 않는다', await p.evaluate(() => { const e = document.querySelector('#fbHoney'); return e.tabIndex === -1 && e.getAttribute('aria-hidden') === 'true'; }));
  await shot(p, 'desktop_open');
  await p.keyboard.press('Escape'); await wait(200);
  t('Esc 로 닫히고 버튼으로 포커스가 돌아간다', await p.evaluate(() => !document.querySelector('.fbsheet') && document.activeElement && document.activeElement.id === 'btnFeedback'));
  await openPop(p);
  await p.mouse.click(20, 400); await wait(200);
  t('바깥 클릭으로 닫힌다', await p.evaluate(() => !document.querySelector('.fbsheet')));

  // 열자마자 보내면(봇) 거부
  await openPop(p);
  await skew(p, -6000); // 느린 화면에서도 '방금 열었다'가 되도록 시계를 뒤로
  await setVal(p, '#fbTitle', '빠른 글'); await setVal(p, '#fbBody', '열자마자 보내요');
  await submit(p);
  await skew(p, 6000);
  t('열고 3초 안에 보내면 거부', /너무 빨라요/.test(await msgOf(p)) && (await boxN(p)) === 0, await msgOf(p));
  await setVal(p, '#fbTitle', ''); await setVal(p, '#fbBody', '');
  await skew(p, 3500);
  await submit(p);
  t('빈 제목은 거부 + 안내', /제목/.test(await msgOf(p)), await msgOf(p));
  await p.type('#fbTitle', '지도 글자가 작아요');
  await submit(p);
  t('빈 내용은 거부 + 안내', /내용/.test(await msgOf(p)), await msgOf(p));
  t('거부된 것은 상자에 쌓이지 않는다', (await boxN(p)) === 0);
  // 글자 수 표시·500자 초과(maxlength 를 우회해 붙여 넣은 것처럼)
  await setVal(p, '#fbBody', '가'.repeat(120));
  t('글자 수 표시', (await p.$eval('#fbCount', (e) => e.textContent)) === '120/500');
  await setVal(p, '#fbBody', '냥'.repeat(501));
  t('501자는 초과 표시', await p.$eval('#fbCount', (e) => e.textContent === '501/500' && e.classList.contains('over')));
  await submit(p);
  t('500자 초과는 거부 + 안내', /너무 길어요/.test(await msgOf(p)), await msgOf(p));
  t('textarea maxlength 500', (await p.$eval('#fbBody', (e) => e.maxLength)) === 500 && (await p.$eval('#fbTitle', (e) => e.maxLength)) === 40);
  // 링크
  await setVal(p, '#fbBody', '여기 보세요 http://example.invalid/a');
  await submit(p);
  t('링크는 거부 + 안내', /링크/.test(await msgOf(p)), await msgOf(p));
  await setVal(p, '#fbBody', '사이트 spam-shop.com 에서 사세요');
  await submit(p);
  t('도메인 모양도 거부', /링크/.test(await msgOf(p)));
  // 닫았다 열어도 쓰던 글은 남는다
  await p.keyboard.press('Escape'); await wait(200);
  await openPop(p);
  t('닫았다 열면 쓰던 제목이 남는다', (await p.$eval('#fbTitle', (e) => e.value)) === '지도 글자가 작아요');
  await skew(p, 3500);

  // 정상 전송 + XSS 문자열
  const XT = '<script>window.__xss=1</script>', XB = '<img src=x onerror="window.__xss=2"> 그대로 보여요\n둘째 줄';
  await setVal(p, '#fbTitle', XT); await setVal(p, '#fbBody', XB); await setVal(p, '#fbFrom', '별명이에요');
  await submit(p);
  await p.waitForFunction(() => document.querySelector('#fbSend') && document.querySelector('#fbSend').textContent.includes('꾹꾹이'), { timeout: 3000 }).catch(() => {});
  t('성공 안내(고양이 문구)', await waitMsg(p, /잘 도착했어요/), await msgOf(p).catch(() => ''));
  await shot(p, 'desktop_success');
  t('상자에 1건, 글자 그대로 저장', await p.evaluate((xt) => { const a = JSON.parse(localStorage.getItem('golmok:feedback_box') || '[]'); return a.length === 1 && a[0].title === xt && a[0].from === '별명이에요'; }, XT));
  t('스크립트가 실행되지 않았다', await p.evaluate(() => window.__xss === undefined));
  t('입력 글이 태그로 해석되지 않았다', await p.evaluate(() => !document.querySelector('.fbsheet script, .fbsheet img')));
  await wait(2500);
  t('성공 2초 뒤 자동으로 닫힌다', await p.evaluate(() => !document.querySelector('.fbsheet')));
  // 쿨다운
  await openPop(p); await skew(p, 3500);
  await setVal(p, '#fbTitle', '두 번째'); await setVal(p, '#fbBody', '바로 또 보내요');
  await submit(p);
  t('60초 안에 또 보내면 쿨다운 안내', /1분 뒤/.test(await msgOf(p)), await msgOf(p));
  t('쿨다운으로 상자는 늘지 않는다', (await boxN(p)) === 1);
  await shot(p, 'desktop_cooldown');
  // 허니팟
  await resetCool(p);
  await setVal(p, '#fbHoney', 'bot'); await submit(p);
  t('허니팟 채움은 성공처럼 보이지만 보내지 않는다', (await waitMsg(p, /잘 도착했어요/)) && (await boxN(p)) === 1);
  await wait(2500);
  // 같은 내용 중복
  await resetCool(p);
  await openPop(p); await skew(p, 3500);
  await setVal(p, '#fbTitle', '세 번째'); await setVal(p, '#fbBody', '허니팟 뒤 정상 글');
  await submit(p);
  t('허니팟 뒤 정상 글은 전송된다', (await waitMsg(p, /잘 도착했어요/)) && (await boxN(p)) === 2);
  await wait(2500);
  await resetCool(p, false);
  await openPop(p); await skew(p, 3500);
  await setVal(p, '#fbTitle', '세 번째'); await setVal(p, '#fbBody', '허니팟 뒤 정상 글');
  await submit(p);
  t('같은 내용 중복 거부', /이미 받았어요/.test(await msgOf(p)) && (await boxN(p)) === 2, await msgOf(p));
  // 안 보이는 글자는 정리되어 저장
  await resetCool(p);
  await setVal(p, '#fbTitle', '제​로‮폭'); await setVal(p, '#fbBody', '보\u0000이⁦는 글');
  await submit(p);
  t('안 보이는 글자는 지워서 저장', (await waitMsg(p, /잘 도착했어요/)) && await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('golmok:feedback_box') || '[]'); return a[0].title === '제로폭' && a[0].body === '보이는 글'; }));
  await wait(2500);

  // ── 어드민 화면: 의견함 구역·실패 유지·XSS 표시 ──
  const q = await open(b, '?admin&still=30&pr=0.3&shells=2#11', { errs, settle: 2500, before });
  await q.evaluate(() => { const s = document.querySelector('#adFbMode').closest('details'); s.open = true; s.scrollIntoView(); });
  await wait(300);
  t('어드민에 의견함 구역이 보인다', await q.evaluate(() => !!document.querySelector('#adFbList') && document.querySelectorAll('.adfb-row').length === 3));
  t('목록은 글자로만 표시(태그 없음, 스크립트 미실행)', await q.evaluate((xt) => { const l = document.querySelector('#adFbList'); return l.textContent.includes(xt) && !l.querySelector('script,img') && window.__xss === undefined; }, XT));
  await q.evaluate(() => document.querySelector('.adfb-row').click());
  t('메일 미리보기가 나온다', await q.evaluate(() => /제목: \[골목냥 의견\]/.test(document.querySelector('#adFbMail').textContent)));
  // 실패 강제: 입력 글 유지·횟수에 안 들어감
  await q.evaluate(() => { const s = document.querySelector('#adFbMode'); s.value = 'fail'; s.dispatchEvent(new Event('change')); });
  await q.evaluate(() => { const e = [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '쿨다운·하루 횟수 풀기'); e.click(); });
  await q.evaluate(() => [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '빈 팝업 열기').click());
  await q.waitForSelector('.fbsheet'); await wait(3400);
  await setVal(q, '#fbTitle', '실패 시험'); await setVal(q, '#fbBody', '실패해도 글이 남아야 해요');
  await submit(q);
  t('전송 실패 안내', await waitMsg(q, /길을 잃었어요/));
  t('실패해도 입력한 글이 남고 횟수에 안 들어간다', (await q.$eval('#fbBody', (e) => e.value)) === '실패해도 글이 남아야 해요' && await q.evaluate(() => JSON.parse(localStorage.getItem('golmok:feedback_sent') || '[]').length === 0));
  await shot(q, 'desktop_fail');
  // 느림: 전송 중 상태와 중복 클릭 방지
  await q.evaluate(() => { document.querySelector('.fbsheet').dispatchEvent(new Event('x')); });
  await q.keyboard.press('Escape'); await wait(200);
  await q.evaluate(() => { const s = document.querySelector('#adFbMode'); s.value = 'slow'; s.dispatchEvent(new Event('change')); });
  await q.evaluate(() => [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '빈 팝업 열기').click());
  await q.waitForSelector('.fbsheet'); await wait(3400);
  await setVal(q, '#fbTitle', '느린 시험'); await setVal(q, '#fbBody', '느린 응답 시험이에요');
  await submit(q); await submit(q); await submit(q);
  await wait(500);
  t('전송 중에는 꾹꾹이 중… 표시', await q.$eval('#fbSend', (e) => e.textContent.includes('꾹꾹이')));
  await shot(q, 'desktop_sending');
  t('느림 뒤 성공, 중복 클릭해도 1건', (await waitMsg(q, /잘 도착했어요/)) && (await boxN(q)) === 4);
  await wait(2500);
  // 가짜 스팸 입력 버튼(허니팟 채움)
  await q.evaluate(() => { const e = [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '쿨다운·하루 횟수 풀기'); e.click(); });
  await q.evaluate(() => [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '허니팟 채움(봇)').click());
  await q.waitForSelector('.fbsheet'); await wait(3400);
  t('스팸 시험 버튼이 칸을 채워 연다', (await q.$eval('#fbTitle', (e) => e.value)) === '봇의 글' && (await q.$eval('#fbHoney', (e) => e.value)) !== '');
  await q.keyboard.press('Escape'); await wait(200);
  // 하루 5회 한도
  await q.evaluate(() => { const n = Date.now(), H = 3600000; localStorage.setItem('golmok:feedback_sent', JSON.stringify([n - 5 * H, n - 4 * H, n - 3 * H, n - 2 * H, n - H])); });
  await q.evaluate(() => [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '빈 팝업 열기').click());
  await q.waitForSelector('.fbsheet'); await wait(3400);
  await setVal(q, '#fbTitle', '여섯 번째'); await setVal(q, '#fbBody', '하루 한도 시험');
  await submit(q);
  t('하루 5회 한도 안내', /오늘은 여기까지/.test(await msgOf(q)), await msgOf(q));
  await q.keyboard.press('Escape'); await wait(200);
  // 저장값 변조: 숫자·객체·문자열·null·섞인 배열이어도 목록이 그려지고 전송이 막히지 않는다
  const nErr0 = errs.length;
  await q.evaluate(() => { const n = Date.now(); localStorage.setItem('golmok:feedback_box', JSON.stringify([null, 5, 'x', [], { at: n }, { at: n - 1000, id: 'k1', title: 't', body: 5 }, { at: n - 2000, id: 'ok1', title: '정상 제목', from: '별', body: '정상 내용' }])); localStorage.removeItem('golmok:feedback_sent'); });
  await q.evaluate(() => [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '새로 고침').click());
  t('깨진 항목이 섞여도 목록이 그려진다', await q.evaluate(() => { const r = [...document.querySelectorAll('.adfb-row')]; return r.length === 3 && r.filter((e) => e.textContent.includes('(깨진 항목)')).length === 2 && r.some((e) => e.textContent.includes('정상 제목')); }));
  await wait(2300);
  t('2초 되풀이 그리기에도 오류 없음', errs.length === nErr0 && await q.evaluate(() => document.querySelectorAll('.adfb-row').length === 3));
  let tampOk = true;
  for (const v of ['5', '{"a":1}', '"문자열"', 'null', '[1,"x",null,{},[]]']) {
    await q.evaluate((val) => { for (const k of ['feedback_box', 'feedback_sent', 'feedback_keys']) localStorage.setItem('golmok:' + k, val); }, v);
    await q.evaluate(() => [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '빈 팝업 열기').click());
    await q.waitForSelector('.fbsheet'); await skew(q, 3500);
    await setVal(q, '#fbTitle', '변조 ' + v.length); await setVal(q, '#fbBody', '변조 시험 ' + v);
    await submit(q);
    const ok = await waitMsg(q, /잘 도착했어요/);
    if (!ok) { tampOk = false; console.log('  변조 실패', v, await msgOf(q)); }
    await q.keyboard.press('Escape'); await wait(300);
    await q.evaluate(() => [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '쿨다운·하루 횟수 풀기').click());
  }
  t('저장값이 배열이 아니어도(5종) 전송이 성공한다', tampOk);
  t('변조 시험 중 오류 0', errs.length === nErr0, errs.slice(nErr0).join(' | '));
  await q.evaluate(() => [...document.querySelectorAll('.adfbwrap button')].find((x) => x.textContent === '전체 지우기').click());
  await q.evaluate(() => { localStorage.removeItem('golmok:feedback_sent'); localStorage.removeItem('golmok:feedback_keys'); });
  await shot(q, 'desktop_admin');
  await q.close();

  // ── 모바일 390x800 ──
  const m = await open(b, '?still=30&pr=0.3&shells=2#11', { errs, settle: 2500, width: 390, height: 800 });
  const mr = await m.evaluate(() => ['#btnFeedback', '#btnBoard', '#btnMember', '#clock', '#share', '#promo', '#capture', '#roster', '#plate'].map((s) => { const e = document.querySelector(s); if (!e) return [s, 0, 0, 0, 0]; const r = e.getBoundingClientRect(); return [s, r.left, r.top, r.right, r.bottom]; }));
  const mh = mr.slice(1).filter((r) => r[3] > 0 && overlap(mr[0], r)).map((r) => r[0]);
  t('새 버튼이 다른 버튼과 겹치지 않는다(390)', mh.length === 0, mh.join(','));
  t('390에서 가로 스크롤 없음', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot(m, 'mobile_closed');
  await m.click('#btnFeedback'); await m.waitForSelector('.fbsheet'); await wait(300);
  t('390에서 팝업이 화면 안에 있다', await m.evaluate(() => { const r = document.querySelector('.fbsheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  await shot(m, 'mobile_open');
  await m.evaluate(() => { document.querySelector('#fbBody').value = '가'.repeat(300); document.querySelector('#fbBody').dispatchEvent(new Event('input')); });
  await submit(m);
  await shot(m, 'mobile_error');
  await m.close();

  const bad = errs.filter(Boolean);
  t('콘솔·페이지 오류 0', bad.length === 0, bad.slice(0, 3).join(' | '));
  await b.close();
  const fails = res.filter((x) => !x).length;
  console.log(`# ${res.length - fails}/${res.length} 통과`);
  return fails === 0;
});
