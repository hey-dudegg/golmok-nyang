// 배포 설정 자리 (공개 파일). 비밀값·이메일 주소는 여기에 쓰지 않는다.
// 의견 보내기(R-16, D-24·D-62): 브라우저는 Pages Functions 중계(/api/...)만 부르고, Web3Forms 접근 키와 받는 이메일은
// Cloudflare 환경 변수·Web3Forms 대시보드에만 둔다(이 파일에 쓰지 않는다). 중계가 없으면 모의 어댑터(브라우저 저장)로 동작한다.
// 브라우저에는 키가 없다. live: 'auto' 면 배포 주소(localhost·127.0.0.1·file 이 아닌 곳)에서만 중계로 보내고, 로컬 서버에는 Functions 가 없어 모의로 동작한다.
export const FEEDBACK_CONFIG = {
  live: 'auto',           // 'auto' | true | false (시험용으로 고정할 수 있다)
  endpoint: '/api/feedback', // 같은 출처 중계(functions/api/feedback.js)
  retentionDays: 90,      // 의견 보관 기간 (D-25)
};

// Supabase 연결 (D-77·81): 접속 주소(hostname)로 운영/테스트를 고른다. 공개 키(publishable)만 쓴다. 공개 키는 방문자 브라우저에 어차피 내려가며 방어선은 RLS다.
// turnstileSiteKey(D-106): Cloudflare Turnstile 사이트 키(공개값). 비우면 캡차 없이 익명 로그인. 비밀 키는 Supabase 대시보드 Captcha 에만 둔다.
// 관리자 키(service_role·sb_secret_)는 어디에도 쓰지 않는다(D-11). url·key 중 하나라도 비면 연결하지 않고 지금과 똑같이 동작한다.
export const SUPABASE_CONFIG = {
  prod: { hosts: ['golmok-nyang.pages.dev'],      url: 'https://slgvsyhftdfravmxorse.supabase.co', key: 'sb_publishable_p_hKrv1IdpzjADiW25TJCg_X9o2jA3I', turnstileSiteKey: '' }, // 운영 프로젝트
  test: { hosts: ['test.golmok-nyang.pages.dev'], url: 'https://tfaakrfrifduelifditf.supabase.co', key: 'sb_publishable_LGcYiuvE8vrTMCzmYra29g_QY6LGPON', turnstileSiteKey: '' }, // 테스트 프로젝트
};
// 기능 스위치 기본값 (D-82~84, 설계 2-1): mock·static 모드, 그리고 서버에서 app_config.features 를 못 읽을 때 쓴다.
export const FEATURES_DEFAULT = { login: false, board_write: false, names_anon: true };
// 날씨(M3-c, D-95): 같은 출처 중계만 부른다. mock: 'auto' 면 로컬 서버(Functions 없음)에서만 고정 가짜 값, true·false 로 고정할 수 있다. ?wx=종류 강제는 localhost·127.0.0.1 에서만.
export const WEATHER_CONFIG = { endpoint: '/api/weather?level=sido', mock: 'auto', freshMs: 30 * 60000, staleMs: 3 * 3600000, timeoutMs: 8000 };
