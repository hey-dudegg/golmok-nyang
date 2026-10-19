// 셰이더와 재질: 공유 조명 uniform(LIGHT)·털·눈·피부 (D-02)
import * as THREE from 'three';

// ───────────────────────── shaders ─────────────────────────
// 모든 고양이가 공유하는 조명 uniform (scene 쪽에서 매 프레임 갱신)
export const LIGHT = {
  sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  sunCol: { value: new THREE.Color(1.0, 0.95, 0.85) },
  skyCol: { value: new THREE.Color(0.55, 0.62, 0.75) },
  gndCol: { value: new THREE.Color(0.32, 0.28, 0.24) },
  lampPos: { value: new THREE.Vector3(0, 3, 0) },
  lampCol: { value: new THREE.Color(1.0, 0.7, 0.4) },
  lampOn: { value: 0 },
  fogCol: { value: new THREE.Color(0.7, 0.75, 0.8) },
  fogNear: { value: 8 },
  fogFar: { value: 30 },
  exposure: { value: 1.0 },
};

const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float hash31(vec3 p){ p=fract(p*vec3(443.897,441.423,437.195)); p+=dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }
`;

const LIGHT_GLSL = /* glsl */`
uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 skyCol; uniform vec3 gndCol;
uniform vec3 lampPos; uniform vec3 lampCol; uniform float lampOn;
uniform vec3 fogCol; uniform float fogNear; uniform float fogFar; uniform float exposure;
vec3 applyFog(vec3 col, vec3 wp){
  float d = length(wp - cameraPosition);
  float f = smoothstep(fogNear, fogFar, d);
  return mix(col, fogCol, f);
}
`;

const FUR_VERT = /* glsl */`
#define MAXB 24
attribute float shell;
attribute float part;
attribute float fur;
attribute vec3 rest;
attribute vec3 restN;
attribute vec3 comb;
attribute float wpot;
attribute vec2 tcoord;
uniform mat4 bones[MAXB];
uniform float shellCount;
uniform float furLen;
uniform float furPuff;
uniform float breath;
varying vec3 vRest; varying vec3 vRestN; varying vec3 vN; varying vec3 vWP; varying vec3 vComb;
varying float vH; varying float vFur; varying float vW; varying vec2 vT;
void main(){
  mat4 B = bones[int(part + 0.5)];
  vec3 p = (B * vec4(position, 1.0)).xyz;
  vec3 n = normalize(mat3(B) * normal);
  vec3 c = mat3(B) * comb;
  float hh = shell / shellCount;
  float L = furLen * fur * (1.0 + furPuff * 0.85);
  vec3 dir = normalize(n + c * (1.0 - 0.8 * furPuff));
  p += dir * (hh * L);
  p.y -= hh * hh * L * 0.35 * (1.0 - furPuff);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vComb = normalize(mat3(modelMatrix) * (c + n * 0.15));
  vRest = rest; vRestN = restN; vH = hh; vFur = fur; vW = wpot; vT = tcoord;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FUR_FRAG = /* glsl */`
uniform vec3 colBase; uniform vec3 colStripe; uniform vec3 colPatch; uniform vec3 colWhite; uniform vec3 colSkin;
uniform float stripeAmt; uniform float stripeFreq; uniform float patchAmt; uniform float patchScale;
uniform float mottle; uniform float whiteAmt; uniform float whiteNoise; uniform float seed;
uniform float density; uniform float tipLight; uniform float highlight; uniform float shellCount;
varying vec3 vRest; varying vec3 vRestN; varying vec3 vN; varying vec3 vWP; varying vec3 vComb;
varying float vH; varying float vFur; varying float vW; varying vec2 vT;
${NOISE_GLSL}
${LIGHT_GLSL}
vec3 pattern(vec3 p){
  float nz = snoise(p * 9.0 + seed);
  float s = sin(vT.x * stripeFreq + nz * 1.9 + snoise(p * 3.0 + seed * 2.0) * 1.2);
  float stripe = smoothstep(-0.1, 0.85, s) * vT.y * stripeAmt * 0.85;
  vec3 col = mix(colBase, colStripe, stripe);
  if (patchAmt > 0.0) {
    float pn = snoise(p * patchScale + seed * 3.1) + 0.45 * snoise(p * patchScale * 2.7 + seed * 1.3);
    float pm = smoothstep(-0.06, 0.06, pn - (1.0 - 2.0 * patchAmt));
    col = mix(col, colPatch, pm);
  }
  if (mottle > 0.0) {
    float mn = snoise(p * 26.0 + seed * 5.0) + 0.6 * snoise(p * 7.0 + seed);
    col = mix(col, colPatch, smoothstep(0.1, 0.5, mn) * mottle);
  }
  col = mix(col, col * 1.22 + 0.07, smoothstep(0.45, 0.95, vW) * 0.55); // 배·주둥이 쪽은 자연스럽게 밝게
  float wn = vW + (snoise(p * 4.0 + seed * 7.0) * whiteNoise) + snoise(p * 22.0 + seed) * 0.05;
  float white = smoothstep(-0.035, 0.035, wn - (1.0 - whiteAmt));
  return mix(col, colWhite, white);
}
void main(){
  float hgt = vH;
  vec3 n0 = normalize(vRestN);
  // ── strand mask ──
  float alpha = 1.0;
  if (hgt > 0.0) {
    vec3 sp = vRest * density;
    vec3 cell = floor(sp);
    vec3 f = fract(sp) - 0.5;
    vec3 fp = f - dot(f, n0) * n0;
    float d = length(fp) * 2.0;
    float r = hash31(cell + seed * 0.37);
    float len = mix(0.72, 1.0, r);
    float t = hgt / len;
    float rad = 0.95 * pow(max(1.0 - t, 0.0), 0.75);
    float fw = max(fwidth(d), 0.02);
    float a1 = (t >= 1.0) ? 0.0 : clamp((rad - d) / fw + 0.5, 0.0, 1.0) * (1.0 - 0.55 * smoothstep(0.35, 1.0, t));
    // 솜털(언더코트): 더 촘촘한 격자, 아래쪽만
    vec3 sp2 = vRest * density * 1.6;
    vec3 f2 = fract(sp2) - 0.5; vec3 fp2 = f2 - dot(f2, n0) * n0;
    float d2 = length(fp2) * 2.0;
    float t2 = hgt / 0.38;
    float rad2 = 0.92 * (1.0 - t2);
    float fw2 = max(fwidth(d2), 0.02);
    float a2 = (t2 >= 1.0) ? 0.0 : clamp((rad2 - d2) / fw2 + 0.5, 0.0, 1.0);
    alpha = max(a1, a2);
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(hgt * 97.0, hgt * 31.0), vec2(0.06711056, 0.00583715))));
    if (alpha < max(ign, 0.02)) discard;
  }
  // ── color ──
  vec3 col = pattern(vRest);
  float strandVar = hash31(floor(vRest * density) + 3.7);
  col *= 0.96 + 0.08 * strandVar;
  col = mix(col, col * 1.04 + 0.01, smoothstep(0.7, 1.0, hgt) * tipLight);
  float occ = mix(0.9, 1.0, hgt);
  // ── light ──
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWP);
  float ndl = dot(N, sunDir);
  float diff = clamp((ndl + 0.75) / 1.75, 0.0, 1.0);
  vec3 amb = mix(gndCol, skyCol, N.y * 0.5 + 0.5);
  vec3 light = sunCol * diff + amb;
  // lamp
  vec3 Lp = lampPos - vWP; float ld = length(Lp); Lp /= ld;
  float lamp = lampOn * clamp((dot(N, Lp) + 0.5) / 1.5, 0.0, 1.0) / (1.0 + ld * ld * 0.12);
  light += lampCol * lamp;
  // Kajiya-Kay 하이라이트 (털결 방향)
  vec3 T = normalize(vComb);
  vec3 Hh = normalize(sunDir + V);
  float th = dot(T, Hh);
  float spec = pow(sqrt(max(1.0 - th * th, 0.0)), 64.0) * highlight * hgt * 0.6;
  // 림 라이트 (솜털 역광)
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * hgt * 0.7;
  vec3 c = col * light * occ + sunCol * spec * 0.18 + (sunCol * 0.2 + amb * 0.1) * rim * col * 1.2;
  c *= exposure;
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export function makeFurMaterial(genomeColors, shellCount) {
  const u = {
    ...LIGHT,
    bones: { value: Array.from({ length: 24 }, () => new THREE.Matrix4()) },
    shellCount: { value: shellCount },
    furLen: { value: 0.03 },
    furPuff: { value: 0 },
    breath: { value: 0 },
    density: { value: 330 },
    tipLight: { value: 0.6 },
    highlight: { value: 0.5 },
    colBase: { value: new THREE.Color() },
    colStripe: { value: new THREE.Color() },
    colPatch: { value: new THREE.Color() },
    colWhite: { value: new THREE.Color() },
    colSkin: { value: new THREE.Color() },
    stripeAmt: { value: 0 }, stripeFreq: { value: 170 },
    patchAmt: { value: 0 }, patchScale: { value: 8 },
    mottle: { value: 0 }, whiteAmt: { value: 0 }, whiteNoise: { value: 0.15 },
    seed: { value: 0 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: FUR_VERT,
    fragmentShader: FUR_FRAG,
    side: THREE.FrontSide,
  });
  m.extensions = { derivatives: true };
  return m;
}

const EYE_VERT = /* glsl */`
varying vec3 vL; varying vec3 vN; varying vec3 vWP;
void main(){ vL = position; vN = normalize(normalMatrix * normal); vec4 wp = modelMatrix * vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
const EYE_FRAG = /* glsl */`
uniform vec3 irisA; uniform vec3 irisB; uniform float pupil; uniform float seed;
varying vec3 vL; varying vec3 vN; varying vec3 vWP;
${NOISE_GLSL}
${LIGHT_GLSL}
void main(){
  vec3 d = normalize(vL);
  vec2 q = d.xy;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float streak = snoise(vec3(ang * 4.0, r * 6.0, seed)) * 0.5 + 0.5;
  vec3 iris = mix(irisA, irisB, smoothstep(0.15, 0.85, r));
  iris *= 0.85 + 0.3 * streak;
  iris = mix(iris, iris * 0.35, smoothstep(0.72, 0.95, r)); // 테두리
  float pw = mix(0.12, 0.42, pupil); float ph = mix(0.6, 0.5, pupil);
  float pe = (q.x * q.x) / (pw * pw) + (q.y * q.y) / (ph * ph);
  float pm = 1.0 - smoothstep(0.85, 1.05, pe);
  vec3 col = mix(iris, vec3(0.015, 0.012, 0.02), pm);
  col *= mix(1.0, 0.5, smoothstep(0.3, 0.85, q.y)); // 윗눈꺼풀 그늘
  if (d.z < 0.25) col = vec3(0.03, 0.025, 0.03);
  vec3 amb = mix(gndCol, skyCol, 0.6);
  vec3 c = col * (amb * 0.9 + sunCol * 0.45 + lampCol * lampOn * 0.25);
  // 캐치라이트
  float hl = 1.0 - smoothstep(0.08, 0.13, length(q - vec2(-0.26, 0.3)));
  float hl2 = 1.0 - smoothstep(0.03, 0.06, length(q - vec2(0.22, -0.2)));
  c += vec3(1.0) * (hl * 0.95 + hl2 * 0.6) * step(0.3, d.z);
  vec3 V = normalize(cameraPosition - vWP);
  float fres = pow(1.0 - max(dot(normalize(vN), normalize((viewMatrix * vec4(V,0.0)).xyz)), 0.0), 3.0);
  c += fres * 0.12;
  c *= exposure;
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;
export function makeEyeMaterial(irisA, irisB, seed) {
  return new THREE.ShaderMaterial({
    uniforms: { ...LIGHT, irisA: { value: new THREE.Color(irisA) }, irisB: { value: new THREE.Color(irisB) }, pupil: { value: 0.3 }, seed: { value: seed } },
    vertexShader: EYE_VERT, fragmentShader: EYE_FRAG,
  });
}

// 털 없는 부위(코, 귓속, 입) 용 간단한 셰이더
const SKIN_FRAG = /* glsl */`
uniform vec3 col; uniform float gloss;
varying vec3 vL; varying vec3 vN; varying vec3 vWP;
${LIGHT_GLSL}
void main(){
  vec3 N = normalize(vN);
  vec3 amb = mix(gndCol, skyCol, 0.6);
  vec3 c = col * (amb + sunCol * 0.55 + lampCol * lampOn * 0.3);
  c += gloss * 0.25 * pow(max(N.z, 0.0), 12.0);
  c *= exposure;
  c = applyFog(c, vWP);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;
export function makeSkinMaterial(color, gloss = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { ...LIGHT, col: { value: new THREE.Color(color) }, gloss: { value: gloss } },
    vertexShader: EYE_VERT, fragmentShader: SKIN_FRAG,
  });
}
