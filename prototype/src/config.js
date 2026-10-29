// 배포 설정 자리 (공개 파일). 비밀값·이메일 주소는 여기에 쓰지 않는다.
// 의견 보내기(R-16, D-24·D-62): 브라우저는 Pages Functions 중계(/api/...)만 부르고, Web3Forms 접근 키와 받는 이메일은
// Cloudflare 환경 변수·Web3Forms 대시보드에만 둔다(이 파일에 쓰지 않는다). 중계가 없으면 모의 어댑터(브라우저 저장)로 동작한다.
// accessKey 칸은 중계 도입 전 임시 자리이며 비워 둔다.
export const FEEDBACK_CONFIG = {
  accessKey: '',          // 공개용 접근 키(D-54). 있으면 실제 전송, 비워 두면 모의
  endpoint: 'https://api.web3forms.com/submit',
  retentionDays: 90,      // 의견 보관 기간 (D-25)
};

// Supabase 연결 (D-77): 접속 주소(hostname)로 운영/스테이징을 고른다. 공개 키(publishable 또는 anon)만 쓴다.
// 관리자 키(service_role·sb_secret_)는 어디에도 쓰지 않는다(D-11). url·key 중 하나라도 비면 연결하지 않고 지금과 똑같이 동작한다.
// <사이트>는 배포 주소가 정해지면 사용자가 알려 준 값으로 바꾼다. 이 상태(자리표시)에서는 어떤 주소와도 맞지 않는다.
export const SUPABASE_CONFIG = {
  prod:    { hosts: ['<사이트>.pages.dev'],         url: '', key: '' },
  staging: { hosts: ['staging.<사이트>.pages.dev'], url: '', key: '' },
};
