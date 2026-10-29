// 시험용 window.__* 노출 허용 주소 (보안 J-6). 배포 주소에서는 노출하지 않는다.
export const isTestHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1';
