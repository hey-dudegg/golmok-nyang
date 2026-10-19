// 세계 시계 인스턴스 (D-19). 계산은 core/clock.js, 개인 표시 상태 저장은 adapters/store.js
import { createClock } from '../core/clock.js';
import { store } from '../adapters/store.js';

export const Clock = createClock(store); // 세계 시계 계산은 core/clock.js. 브라우저 저장 도우미(store)를 넘긴다
