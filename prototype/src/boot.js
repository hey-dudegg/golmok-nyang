// 진입 스크립트(일반 script, 모듈 아님). CSP 강제 때문에 index.html 인라인에서 뺐다 (보안 J-3).
// 1) file://로 열면 브라우저가 src/ 모듈 import 자체를 막는다(D-33). 지역 자료 fetch 실패 안내와 같은 문구를 먼저 띄운다 (D-35)
if (location.protocol === 'file:') { const l = document.getElementById('loading'); if (l) { const box = document.createElement('div'), small = document.createElement('small'); box.style.cssText = 'text-align:center;padding:0 16px;max-width:36em'; small.textContent = '파일을 직접 열면(file://) 브라우저가 자료 읽기를 막아요. 저장소 루트에서 "python -m http.server 8000"(macOS·Linux는 python3)을 실행한 뒤 http://localhost:8000/prototype/ 으로 열어 주세요.'; box.append('지역 자료(data/regions.json)를 불러오지 못했어요', small); l.setAttribute('role', 'alert'); l.replaceChildren(box); } }
// 2) 진입 로더: 모듈 하나라도 받지 못하거나(404·망 오류) 불러오는 중 오류가 나면 로딩 화면에서 멈추지 않고 안내를 띄운다.
//    지역 자료(data/regions.json) 안내나 file:// 안내가 이미 떠 있으면(role=alert) 그대로 둔다.
import('./main.js').catch((e) => {
  console.error('골목냥 모듈 불러오기 실패:', e);
  const l = document.getElementById('loading');
  if (!l || l.getAttribute('role') === 'alert') return;
  const box = document.createElement('div'), small = document.createElement('small');
  box.style.cssText = 'text-align:center;padding:0 16px;max-width:36em';
  small.textContent = (location.protocol === 'file:' ? '파일을 직접 열면(file://) 브라우저가 자료 읽기를 막아요. ' : '')
    + '저장소 루트에서 "python -m http.server 8000"(macOS·Linux는 python3)을 실행한 뒤 http://localhost:8000/prototype/ 으로 열어 주세요.'
    + ' 서버로 열었는데도 이 안내가 보이면 새로고침하거나 prototype/src/ 파일이 빠지지 않았는지 확인해 주세요.';
  box.append('화면을 만드는 파일(src/)을 불러오지 못했어요', small);
  l.setAttribute('role', 'alert'); l.replaceChildren(box);
});
