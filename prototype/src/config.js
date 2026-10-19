// 배포 설정 자리 (공개 파일). 비밀값·이메일 주소는 여기에 쓰지 않는다.
// 의견 보내기(R-16, D-24): Web3Forms 의 "접근 키"는 공개용이라 배포 때(M4) 이 자리에 넣는다(주입 방식은 P-07).
// 받는 이메일은 Web3Forms 대시보드에만 등록한다. 값이 비어 있거나 live 가 false 면 모의 어댑터(브라우저 저장)로 동작한다.
export const FEEDBACK_CONFIG = {
  accessKey: '',          // 공개용 접근 키. 비워 두면 모의
  endpoint: 'https://api.web3forms.com/submit',
  live: false,            // M4 실전 확인 전까지 false. true 가 아니면 네트워크 전송을 하지 않는다
  retentionDays: 90,      // 의견 보관 기간 (D-25)
};
