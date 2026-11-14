# 사용자 할 일 (2026-11-08 정리, D-110 서울 재생성부터)

> 위에서부터 순서대로 하시면 됩니다. 화면의 메뉴 이름은 조금 다를 수 있습니다.
> 접속 문자열, 비밀번호, secret·service_role 키, User UID는 채팅·저장소에 쓰지 않습니다.
> 채팅으로 알려 주셔도 되는 값은 **Project URL, Publishable key, Turnstile Site Key** 세 가지뿐입니다.

## 1. 기존 도쿄 프로젝트 2개 일시정지
- [ ] 각 프로젝트에서 Project Settings → General → **Pause project**를 누릅니다. **삭제는 하지 않습니다.**
- 무료 요금제는 켜 둘 수 있는 프로젝트가 2개까지입니다. 새로 만들 때 개수 제한 안내가 뜨면 팀장에게 알려 주세요.

## 2. 서울 지역에 새 프로젝트 2개 만들기
- [ ] New project를 누릅니다. 이름 예: 운영 `golmok-nyang`, 테스트 `golmok-nyang-test` (실명·회사명 금지)
- [ ] **Region: Northeast Asia (Seoul)**
- [ ] DB 비밀번호는 **영문·숫자만**으로 만들고, 비밀번호 관리자에 보관합니다.

## 3. 새 프로젝트 각각 설정 (두 프로젝트 모두)
- [ ] Authentication → Sign In / Providers: **Allow anonymous sign-ins 켬**, Email은 끔. 캡차는 **아직 끈 채로** 둡니다.
- [ ] Authentication → URL Configuration: 각 프로젝트에 자기 주소만 넣습니다.
  - 운영: `https://golmok-nyang.pages.dev/`, `https://golmok-nyang.pages.dev/**`
  - 테스트: `https://test.golmok-nyang.pages.dev/`, `https://test.golmok-nyang.pages.dev/**`
- [ ] Realtime 설정: **Enable Realtime service 켬**, **Allow public access 끔**

## 4. 팀장에게 공개값 전달 (두 프로젝트 각각, 채팅 가능)
- [ ] Project Settings → Data API(또는 API)의 **Project URL** (`https://xxxx.supabase.co`)
- [ ] API Keys의 **Publishable key** (`sb_publishable_...`)
- 전달하시면 팀장이 앱 설정(config.js)과 보안 설정(CSP)을 바꿔 `test` 브랜치에 올립니다(승인 후).

## 5. GitHub 환경과 Secret (새 프로젝트 값으로)
저장소 Settings → Environments
- [ ] `test` 환경: Deployment branches는 **Selected branches** → `test`
- [ ] `production` 환경: **Required reviewers**에 본인을 넣습니다. Prevent self-review는 **체크하지 않습니다**. Deployment branches는 `main`
- [ ] 각 환경의 Environment secrets에 두 개를 넣습니다.
  - `SUPABASE_DB_URL`: Connect → Connection String → URI → **Session pooler** 문자열을 넣되, `[YOUR-PASSWORD]`를 대괄호까지 지우고 그 자리에 비밀번호를 넣습니다. 테스트 환경에는 테스트 값, 운영 환경에는 운영 값입니다.
  - `SEED_WORDS_SQL`: 내 컴퓨터의 `supabase/private/seed_words.sql` 내용 전체입니다(두 환경에 같은 값).
- [ ] Settings → Actions → General → Workflow permissions: **Read repository contents and packages permissions**

## 6. 자동 적용 결과 확인 (4번 반영을 팀장이 푸시한 뒤)
- [ ] Actions 탭 → **sql-apply** → 가장 최근 실행을 엽니다. 실패해 있으면 **Re-run all jobs**를 누르고, 기록이 없으면 **Run workflow**(대상 `test`)로 실행합니다.
- [ ] Summary에 파일별 `N PASS / 0 FAIL`이 나오는지 봅니다. FAIL이 있으면 그 줄을 팀장에게 전달합니다.
  - 특히 `09_cron`(매일 자동 정리 예약)과 `check_09_cron`이 성공했는지 봐 주세요. 실패하면 Database → Extensions에서 **pg_cron**을 켠 뒤 다시 실행합니다.
- [ ] 같은 실행을 한 번 더 돌려 두 번째도 성공하는지 봅니다(여러 번 실행해도 안전한지 확인).

## 7. 테스트 주소에서 동작 확인
- [ ] `https://test.golmok-nyang.pages.dev/`를 엽니다. 본인 확인(이메일 코드)을 통과합니다.
- [ ] F12 → Console을 엽니다. "서버에 연결되지 않아" 문구가 뜨면 `[supabase] 연결 실패` 뒤의 문구를 팀장에게 전달합니다.
- [ ] 다른 브라우저나 시크릿 창으로 같은 주소를 하나 더 열고, 아래를 확인합니다.
  - 사람 수가 2로 보이는지
  - 한쪽에서 홍보를 누르면 다른 쪽에도 보이는지
  - 이름 짓기와 신고가 되는지

## 8. 어드민 등록 (테스트 → 운영 순)
- [ ] 본인 브라우저로 사이트를 한 번 엽니다.
- [ ] Supabase → Authentication → Users에서 방금 생긴 익명 사용자(만든 시각으로 찾기)의 **User UID**를 복사합니다.
- [ ] SQL Editor에서 `insert into public.admins values ('<복사한 UID>');`를 실행합니다.
- 그 브라우저의 사이트 데이터를 지우면 어드민이 풀립니다. 그때는 다시 등록하고 옛 행을 지웁니다.
- 어드민 기기는 본인만 씁니다.

## 9. 개인정보 안내 확정 (P-44, 채팅으로 답)
- [ ] 삭제 요청 때 본인 확인 방법을 정합니다. 제안은 안내 화면에 익명 번호 앞 8자리와 복사 버튼을 두고, 의견 보내기에 그 번호를 붙여 보내는 방식입니다. 좋은지, 다른 방식이 나은지 답해 주세요.

## 10. 캡차 (Turnstile)
- [ ] Cloudflare → **Turnstile → Add widget**. 도메인은 `golmok-nyang.pages.dev`, `test.golmok-nyang.pages.dev`, 모드는 **Managed**
- [ ] **Site Key**는 팀장에게 전달합니다(공개값). 팀장이 앱에 넣어 배포합니다.
- [ ] **Secret Key**는 Supabase 두 프로젝트의 Authentication → Captcha protection에만 넣습니다.
- [ ] 앱 배포 **뒤에** Captcha를 켜고, 테스트 주소의 콘솔에 빨간 CSP 오류가 없는지 봅니다.

## 11. 계정 보안 (권장)
- [ ] GitHub, Cloudflare, Supabase에 2단계 인증을 켭니다.

## 12. 운영 공개 (위가 모두 끝나고 팀장의 최종 보안 판정 뒤)
- [ ] 팀장이 `test` → `main` 병합 PR을 만들면, 확인하고 병합합니다.
- [ ] Actions sql-apply의 **production 승인**(Review deployments → Approve)을 누릅니다.
- [ ] `https://golmok-nyang.pages.dev/`에서 7번처럼 확인하고, 8번 어드민 등록을 운영에도 합니다.
- [ ] Actions → **keepalive** → Run workflow로 수동 실행해, 두 줄 모두 HTTP 200인지 봅니다.

## 13. 정리 (운영이 잘 동작한 뒤)
- [ ] 일시정지해 둔 도쿄 프로젝트 2개를 삭제합니다(되돌릴 수 없음).
