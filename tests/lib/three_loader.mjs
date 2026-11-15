// node 에서 vendor 의 three(ESM, package.json 형식 표시 없음)를 불러오게 하는 로더 훅. 사용: module.register(이 파일)
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const THREE = pathToFileURL(fileURLToPath(new URL('../../prototype/vendor/three-0.160.0/build/three.module.js', import.meta.url))).href;
export async function resolve(spec, ctx, next) { return spec === 'three' ? { url: THREE, shortCircuit: true } : next(spec, ctx); }
export async function load(url, ctx, next) { return url === THREE ? { format: 'module', source: fs.readFileSync(fileURLToPath(url)), shortCircuit: true } : next(url, ctx); }
