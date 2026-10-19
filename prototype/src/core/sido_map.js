// 시/도 지도 그림(SVG 경로 문자열) 계산. 행정동 경계를 시/도로 합친다. 경계 자료(REGIONS)는 인자로 받는다

const SIDO_MAP = new WeakMap(); // 시/도 경계 그림. 속한 동 경계를 한 덩어리로 합쳐 처음 열 때 한 번만 만든다 (경계 자료마다 하나)
export function buildSidoMap(REGIONS) {
  if (SIDO_MAP.has(REGIONS)) return SIDO_MAP.get(REGIONS);
  const k = Math.cos(36 * Math.PI / 180), W = 600, H = 560, pad = 12;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const groups = [];
  for (const s of REGIONS.sidoInfo.values()) {
    const rings = [];
    for (const d of s.dongs) for (const ring of REGIONS.rings(d)) {
      if (ring[0][0] > 130.3) continue; // 울릉도·독도까지 담으면 지도가 너무 넓어져서 그림에서만 뺀다
      const pts = ring.map(([lo, la]) => { const X = lo * k, Y = -la; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); return [X, Y]; });
      rings.push(pts);
    }
    groups.push([s, rings]);
  }
  const sc = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0));
  const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
  const px = (X) => Math.round(((X - x0) * sc + ox) * 2) / 2, py = (Y) => Math.round(((Y - y0) * sc + oy) * 2) / 2;
  const paths = new Map(), labels = new Map();
  for (const [s, rings] of groups) {
    let dstr = '';
    for (const pts of rings) {
      const seg = []; let last = '';
      for (const [X, Y] of pts) { const key = px(X) + ',' + py(Y); if (key !== last) { seg.push(key); last = key; } }
      if (seg.length >= 3) dstr += 'M' + seg.join('L') + 'Z';
    }
    paths.set(s.c, dstr);
    const lat = s.dongs.reduce((t, d) => t + d.lat, 0) / s.dongs.length, lng = s.dongs.reduce((t, d) => t + d.lng, 0) / s.dongs.length;
    labels.set(s.c, [px(lng * k), py(-lat)]);
  }
  const out = { W, H, paths, labels }; SIDO_MAP.set(REGIONS, out);
  return out;
}
