// J-6: 시험용 window.__* 노출은 localhost·127.0.0.1 에서만
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isTestHost } from '../../prototype/src/core/test_host.js';

test('시험 주소만 허용', () => {
  assert.equal(isTestHost('localhost'), true);
  assert.equal(isTestHost('127.0.0.1'), true);
  for (const h of ['example.pages.dev', 'golmok.example.com', 'localhost.evil.com', '', '0.0.0.0', undefined]) assert.equal(isTestHost(h), false, String(h));
});

test('main.js 의 window.__ 대입은 모두 isTestHost 가드 안', () => {
  const src = fs.readFileSync(new URL('../../prototype/src/main.js', import.meta.url), 'utf8');
  const guard = src.indexOf('if (isTestHost(location.hostname)) {');
  assert.ok(guard > 0);
  for (const m of src.matchAll(/window\.__(app|advance|pose|trips|inter|recipe|lm|TRIP)\s*=/g)) assert.ok(m.index > guard, m[0]);
});
