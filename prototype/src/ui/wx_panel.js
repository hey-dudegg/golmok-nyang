// 주소판 날씨 칸 (M3-d, 날씨_설계 2장·9-5). res = Wx.get(id) { wx, from, hops } | null.
// 직접 받은 값: 그림 + 온도. 빌린 값(hops>0): 그림 흐리게, 온도 숨김, 지역 이름 없음(D-99). 값이 없으면 칸을 숨긴다(D-97).
import { WX_LABEL, wxIcon } from './wx_icons.js';

const hhmm = (ms) => { const k = new Date(ms + 9 * 3600000); return String(k.getUTCHours()).padStart(2, '0') + ':' + String(k.getUTCMinutes()).padStart(2, '0'); };
export const tempText = (t) => { const r = Math.round(t); return (r < 0 ? '−' + (-r) : String(r)) + '°'; };
export const tempSpoken = (t) => { const r = Math.round(t); return r < 0 ? `영하 ${-r}도` : `영상 ${r}도`; };

export function renderWxPanel(el, res, night) {
  if (!el) return;
  const wx = res && res.wx, src = el.closest('#plate')?.querySelector('.wxsrc'); // 출처 링크(D-124): 날씨 칸과 함께 보이고 숨긴다
  if (!wx || !WX_LABEL[wx.kind]) { el.hidden = true; el.textContent = ''; if (src) src.hidden = true; return; }
  if (src) src.hidden = false;
  const borrowed = res.hops > 0, hasT = !borrowed && Number.isFinite(wx.t);
  const name = WX_LABEL[wx.kind];
  el.hidden = false; el.classList.toggle('dim', borrowed);
  el.setAttribute('aria-label', borrowed ? `근처 날씨 ${name}` : hasT ? `${name}, ${tempSpoken(wx.t)}` : name);
  el.title = (borrowed ? '근처 지역 · ' : '') + '기상청 모델 · Open-Meteo' + (Number.isFinite(wx.at) ? ` · ${hhmm(wx.at)} 기준` : '');
  const key = wx.kind + (night ? 'n' : 'd') + (hasT ? tempText(wx.t) : '');
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  el.innerHTML = wxIcon(wx.kind, night) + (hasT ? `<b class="wxt">${tempText(wx.t)}</b>` : '');
}
