// 날씨 그림 SVG (M3-d, 날씨_설계 2-1): 선 그림, stroke=currentColor, svg.i 규칙(1.7). 외부 파일·글꼴 없음 (D-13·47)
const S = (body) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>';
const MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>';
const CLOUD = '<path d="M7 18.5a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.6a4.5 4.5 0 0 1 0 8.9z"/>';
const CLOUD_HI = '<path d="M7 15.5a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 6.6a4.5 4.5 0 0 1 0 8.9z"/>'; // 아래 줄기 자리를 남긴 구름
export const WX_ICONS = {
  sun: S(SUN),
  moon: S(MOON),
  cloud: S(CLOUD),
  sunCloud: S('<circle cx="8" cy="8" r="2.8"/><path d="M8 2v1.4M2 8h1.4M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M8.5 19a3.6 3.6 0 0 1-.4-7.2 4.8 4.8 0 0 1 9.2 1.3 3.2 3.2 0 0 1-.6 5.9z"/>'),
  moonCloud: S('<path d="M11.5 3.5a5 5 0 1 0 5.2 6.6 4 4 0 0 1-5.2-6.6z"/><path d="M8.5 19.5a3.6 3.6 0 0 1-.4-7.2 4.8 4.8 0 0 1 9.2 1.3 3.2 3.2 0 0 1-.6 5.9z"/>'),
  fog: S('<path d="M7 11.5a4 4 0 0 1-.6-6.5A5.3 5.3 0 0 1 16.6 6 4 4 0 0 1 17 11.5z"/><path d="M3.5 15h17M5.5 18.5h13M8 22h8" transform="translate(0 -1)"/>'),
  rain: S(CLOUD_HI + '<path d="M8 18.5l-1 2.5M12 18.5l-1 2.5M16 18.5l-1 2.5"/>'),
  snow: S(CLOUD_HI + '<path d="M8 19.2v.1M12 21v.1M16 19.2v.1M10 19.6v.1M14 19.6v.1" stroke-width="2.6"/>'),
  storm: S(CLOUD_HI + '<path d="M12.6 15.5l-2.4 3h3l-2 3.2"/>'),
};
export const WX_LABEL = { clear: '맑음', cloudy: '흐림', fog: '안개', rain: '비', snow: '눈', storm: '뇌우' };
// 종류·밤낮 → SVG 문자열. 맑음·구름은 밤이면 달 (해 고도는 장면과 맞춘 isNight)
export function wxIcon(kind, night) {
  if (kind === 'clear') return night ? WX_ICONS.moon : WX_ICONS.sun;
  if (kind === 'cloudy') return night ? WX_ICONS.moonCloud : WX_ICONS.sunCloud;
  return WX_ICONS[kind] || WX_ICONS.cloud;
}
