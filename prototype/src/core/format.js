// 화면 표기용 순수 계산: 털색 견본(CSS 배경), 지난 시간 문구, KST 시각 (D-33 단계 3에서 화면 코드에서 분리)

export const swatch = (g) => {
  const c = g.colors, P = g.pattern;
  if (P === 'calico') return `conic-gradient(${c.base} 0 35%, ${c.white} 0 70%, ${c.patch} 0)`;
  if (P === 'tortie') return `conic-gradient(${c.base} 0 55%, ${c.patch} 0)`;
  if (g.whiteAmt >= 1) return c.white;
  if (g.whiteAmt > 0.3) return `linear-gradient(180deg, ${c.base} 0 55%, ${c.white} 55%)`;
  if (g.stripeAmt > 0.5) return `repeating-linear-gradient(90deg, ${c.base} 0 5px, ${c.stripe} 5px 8px)`;
  return c.base;
};
export function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return '방금'; if (d < 3600) return Math.floor(d / 60) + '분 전'; if (d < 86400) return Math.floor(d / 3600) + '시간 전';
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
export const fmtKST = (ms) => { const k = new Date(ms + 9 * 3600000); return [k.getUTCHours(), k.getUTCMinutes(), k.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join(':'); };
