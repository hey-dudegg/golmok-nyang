# SQL 자동 적용·확인 설계 (R-23, 설계만. 워크플로 파일은 승인 뒤 구현)

목표: 사용자가 SQL Editor에 01~08·금칙어·check를 매번 붙여 넣는 일을 없앤다.
test 브랜치 푸시 -> 테스트 DB에 적용 + check 자동 실행. main 병합 -> 운영 DB는 사람 승인 뒤 적용.
전제: 비용 0원(D-01), 계정·Secret 등록은 사용자(D-14), 비밀값은 GitHub Secrets에만(D-11).

## 목차
(줄 번호는 이 파일 기준)
- 1. 접속 방식 비교 ........ 18~35줄
- 2. 실행 순서·멱등성·금칙어 ........ 36~56줄
- 3. check 결과 판정·요약 ........ 57~68줄
- 4. 안전장치 ........ 69~89줄
- 5. 기존 워크플로·D-09와의 관계 ........ 90~97줄
- 6. 사용자 할 일 ........ 98~116줄
- 7. 보안 위험과 security 확인 항목 ........ 117~138줄
- 8. 구현 범위·미확인 모음 ........ 139~149줄

## 1. 접속 방식 비교
| 항목 | A. psql + 접속 문자열 | B. Supabase CLI (`db push`) |
|---|---|---|
| 필요한 Secret | DB 접속 문자열 1개 (환경마다) | access token + DB 비밀번호 + 프로젝트 ref |
| 파일 구조 | 지금 그대로(`supabase/sql/NN_*.sql`) | `supabase/migrations/<타임스탬프>_*.sql`로 바꿔야 함 |
| 적용 기록 | 없음(멱등 SQL을 매번 실행) | 기록 표(`supabase_migrations`)로 한 번만 실행 |
| check·금칙어 | 같은 방식으로 `-f` 실행 | 마이그레이션이 아니라 별도 `db query` 필요 [미확인] |
| 설치 | 러너에 psql 기본 포함 [미확인: 버전] | `supabase/setup-cli` 액션 |
| 우리 SQL 적합도 | 높음(전부 "다시 실행해도 안전") | 낮음(`create or replace` 갱신 파일을 새 마이그레이션으로 쪼개야 함) |

접속 주소(공통 문제):
- 직접 연결(`db.<ref>.supabase.co:5432`)은 무료 플랜에서 IPv6만 제공 [미확인: 요금제별 IPv4 부가 기능은 유료]. GitHub 무료 러너(ubuntu-latest)는 IPv6 외부 접속이 안 된다 [미확인] -> 직접 연결은 실패할 가능성이 높다.
- 따라서 **Supavisor 풀러 주소(Session 모드, 포트 5432)**를 쓴다. 형식: 사용자 `postgres.<프로젝트 ref>`, 호스트 `aws-0-<지역>.pooler.supabase.com`(지역은 Seoul = ap-northeast-2 [미확인: 대시보드 Connect 화면의 문자열을 그대로 복사]).
- Transaction 모드(6543)는 쓰지 않는다(세션 설정·여러 문장 실행에 불리 [미확인]).
- 비밀번호에 특수문자가 있으면 URL 인코딩이 필요하다. 처음부터 영문·숫자만으로 새 DB 비밀번호를 만들면 실수가 없다(사용자 선택).

**권고: A(psql)**. 이유: 파일 구조·멱등성을 그대로 두고 Secret이 1개로 단순하다. CLI(B)는 마이그레이션 재구성이 필요해 재작업 범위가 크다. 대신 §2의 "전부 실행"으로 적용 기록 표를 대체한다.

## 2. 실행 순서·멱등성·금칙어
**순서**: 파일 이름 순으로 `01_base` ... `08_realtime`(파일 머리 주석의 선행 관계와 일치). 05가 03·04의 트리거를 교체하므로 순서를 바꾸지 않는다. 워크플로는 `supabase/sql/[0-8][0-9]_*.sql`만 정렬 실행한다. 99번대는 패턴에서 빠지므로 롤백이 자동으로 실행될 수 없다(규칙: 90~99는 수동 전용 파일).

**바뀐 파일만 vs 전부**: **전부 실행**을 권고한다.
- 01~08은 합계 약 52KB이고 머리 주석에 "다시 실행해도 안전"이 명시되어 있다. 실행 시간은 수 초 [미확인].
- "바뀐 파일만"은 `git diff` 범위·강제 푸시·실패 후 재시도에서 빠짐이 생겨, 순서 의존(05→03 트리거)에서 DB와 저장소가 어긋날 수 있다.
- 적용 기록 표는 만들지 않는다(DB에 새 표가 생기고 위 어긋남을 막지도 못함). 대신 적용한 커밋 SHA와 파일 해시를 잡 summary에만 남긴다.
- 한 파일씩 `psql -1`(단일 트랜잭션)과 `-v ON_ERROR_STOP=1`로 실행: 파일 안에서 오류가 나면 그 파일은 반영되지 않고 이후 파일은 실행하지 않는다. [미확인] 트랜잭션 안에서 안 되는 문장(예: 버킷·realtime 정책 일부)이 있으면 그 파일만 `-1`을 뺀다. 첫 실행(테스트)에서 확인한다.
- 멱등성 위반 방지: 새 SQL을 추가할 때 "다시 실행해도 안전"을 지키는 일은 developer/architect 책임이다. 테스트 DB에 두 번 연속 적용해 둘째 번도 성공하는지 첫 구현 때 확인한다(§8).

**금칙어(supabase/private/seed_words.sql)**: `.gitignore` 대상이라 저장소·러너에 없다(현재 약 0.8KB 초안).
| 방안 | 내용 | 평가 |
|---|---|---|
| a. Secret `SEED_WORDS_SQL` | 파일 내용을 환경 Secret에 붙여 넣고 러너가 임시 파일로 써서 실행 | Secret 한도 48KB 이내라 가능. 저장소에 단어가 안 남음. **권고** |
| b. 수동 유지 | 금칙어는 05 처음 적용 뒤 사용자가 SQL Editor에서 1회 실행 | 단순. 단어 변경 때만 수고. a를 못 쓸 때의 대안 |
| c. 저장소에 커밋 | 금지(비공개 목록 공개됨, CLAUDE.md 보안) | 채택 안 함 |
- a를 쓰면 워크플로는 05 뒤에 seed를 실행한다. seed는 반복 실행해도 안전해야 한다 [미확인: 현재 seed_words.sql의 중복 처리(on conflict) 여부를 developer가 확인].
- Secret이 비어 있으면(b 선택) 그 단계는 건너뛰고 summary에 "금칙어 미적용(수동)"을 표시한다.

**수동으로 남는 것**: 어드민 uid 등록(`insert into public.admins`)은 사용자의 익명 uid가 필요하고 uid를 저장소·Secret에 쓰지 않으므로 자동화하지 않는다(2차_연결_설계.md 6장 A-6).

## 3. check 결과 판정·요약
- 실행: `psql "$SUPABASE_DB_URL" -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 -f supabase/tests/check_*.sql`을 정렬 순으로 한 파일씩(D-108 분할: check_01_base·02_members·03_board·04_names·05_filter·05_moderation·05_limits·07_misc·08_realtime). 각 파일이 `do` 블록이 가짜 계정을 만들었다가 일부러 오류를 내 되돌리고, 마지막 `select name, result` 한 표만 출력한다(진행 로그는 stderr).
- 파싱(awk): 출력 한 줄 = `name<TAB>result`. 판정 규칙:
  1. 결과 줄이 0개 -> 실패("결과 없음").
  2. `result`가 `PASS`가 아닌 줄(FAIL, `중단:` 포함)이 하나라도 있으면 실패.
  3. psql 종료 코드가 0이 아니면 실패.
- 요약: `$GITHUB_STEP_SUMMARY`에 "check: N PASS / M FAIL" 한 줄과, FAIL·중단 줄만 표로 적는다(PASS 목록은 접어서 `<details>`). 파일별로 각각 표시한다.
- 모든 check 파일을 돌린 뒤 하나라도 실패면 잡을 실패 처리한다(앞 파일이 실패해도 나머지는 실행해 정보를 모음 = 한 단계 안의 반복문이 실패 수를 세어 마지막에 종합 판정).
- 출력에는 시험 이름과 PASS/FAIL만 나온다. 접속 문자열은 출력에 넣지 않는다(§7).
- `diag_check.sql`은 자동 실행하지 않는다(진단용, 읽기 전용인지 [미확인]). 필요할 때 사용자가 수동 실행.
- 운영 DB에서 check 실행: check는 가짜 계정을 임시로 만든다(되돌림). 운영에서는 기본 **실행하지 않는다**. 운영 check 여부는 사용자 판단(§8 질문 2).

## 4. 안전장치
**트리거·환경 매핑**
| 이벤트 | 대상 | 승인 | 실행 내용 |
|---|---|---|---|
| `push` -> `test` 브랜치, 경로 `supabase/**` | 테스트 DB (환경 `test`) | 없음 | 01~08 -> (금칙어) -> check_*.sql 전부 |
| `push` -> `main`, 경로 `supabase/**` | 운영 DB (환경 `production`) | **필수** | 01~08 -> (금칙어). check는 §3 |
| `workflow_dispatch` (대상 선택 test/production) | 선택한 쪽 | production은 승인 | 다시 적용·재시도용 |
- 경로 필터(`supabase/sql/**`, `supabase/tests/**`)로 화면 코드만 바뀐 푸시는 DB를 건드리지 않는다.
- 운영 승인: GitHub Environment `production`의 Required reviewers(사용자 본인) 설정. 잡이 "승인 대기"에서 멈추고 사용자가 화면에서 Approve해야 시작한다. **[미확인] 비공개 저장소의 무료 플랜에서는 Environment 보호 규칙이 제한될 수 있음(공개 저장소는 무료).** 안 되면 대안: 운영은 `push` 자동 실행 없이 `workflow_dispatch`로만, 입력칸에 "production"을 직접 쳐야 진행(오타 방지) + 운영 Secret은 Environment가 아닌 저장소 Secret으로 두되 이름을 구분(`SUPABASE_DB_URL_PROD`).
- 환경별로 같은 Secret 이름을 쓰고(`SUPABASE_DB_URL`) 잡의 `environment:`로 값이 갈리게 한다. 테스트 잡이 운영 Secret을 읽을 수 없다.
- 순서 보호: main 병합 운영 적용은 테스트 적용이 같은 SQL로 성공한 기록이 있을 때만 의미가 있다. 사람이 승인 화면에서 test 잡 성공을 확인한다(자동 의존은 만들지 않음, 단순화).

**동시 실행 방지**: `concurrency: group: sql-${{ environment }}`, `cancel-in-progress: false`(적용 도중 취소로 반쯤 적용되는 일을 막고 대기시킴). 테스트와 운영은 그룹이 달라 서로 막지 않는다.

**그 밖에**: 잡 `timeout-minutes: 10`, 문장 제한 `PGOPTIONS='-c statement_timeout=60000'`, 최소 권한 `permissions: contents: read`, 99_rollback은 패턴 밖(§2).

**실패 시 롤백 방침**
- 파일 단위 트랜잭션으로 부분 적용을 막는다. 실패하면 이후 파일을 실행하지 않고 잡을 실패로 끝낸다. 자동 롤백은 하지 않는다(99는 데이터를 모두 지우므로).
- 복구는 앞으로 고치기(fix-forward): SQL을 고쳐 다시 푸시(멱등이라 안전). 운영이 망가졌고 급할 때만 사용자가 SQL Editor에서 직접 대응(사전 협의, 2차 배포 문서 7장 롤백).
- 무료 플랜은 자동 백업·PITR이 없거나 제한적 [미확인]. 그래서 "운영 승인 전 테스트 적용·check 통과"가 유일한 사전 방어다. DB 덤프를 아티팩트로 올리지 않는다(실제 데이터 유출, D-11).

## 5. 기존 워크플로·D-09와의 관계
- `.github/workflows/test.yml`(이름 `test`): `main` 푸시·PR·수동에서 코드 시험만. DB 접속·Secret 없음, `contents: read`. SQL 워크플로는 **별도 파일 `sql-apply.yml`**로 두어 충돌이 없다(트리거 브랜치도 다름: test.yml은 test 브랜치 푸시에 돌지 않음). 동시성 그룹 이름도 `test-...`와 `sql-...`로 분리.
- 결합 여부: SQL 적용 전에 `npm test` 통과를 요구할지는 선택. 기본은 결합하지 않는다(SQL만 바뀐 푸시에서 브라우저 시험은 과함). 필요하면 `quick` 잡만 `needs`로 연결(§8 질문).
- **D-09**(Actions가 하루 1회 Supabase에 요청해 7일 무요청 정지 방지): 현재 `.github/workflows/`에는 test.yml만 있어 **D-09 워크플로 파일이 아직 없다**(팀장 확인 필요, §8). D-09와 이 설계는 목적·트리거·Secret이 달라 충돌하지 않는다.
  - D-09는 `schedule`(cron, 기본 브랜치 main에서만 동작, 저장소 60일 무활동 시 정지 [미확인]) + 공개 anon 키로 REST 요청. 이 설계는 `push`/`dispatch` + DB 접속 문자열.
  - 이 설계의 psql 접속을 D-09 정지 방지로 **대신 쓰지 않는다**(푸시가 없으면 접속이 없음. 정지 판정 기준이 API 요청인지 DB 연결인지 [미확인]).
  - 두 워크플로가 같은 DB를 만지는 시각이 겹쳐도 D-09 요청은 읽기 한 번이라 무해. 단 정리 작업(daily_cleanup, D-87)은 pg_cron(DB 안)이라 이 설계와 무관.

## 6. 사용자 할 일 (순서대로. 값은 문서·채팅에 쓰지 않는다)
화면 이름은 바뀔 수 있음 [미확인].
1. **[Supabase, 프로젝트마다]** Project -> Connect(또는 Settings -> Database) -> Connection string -> **Session pooler** 문자열 복사. `[YOUR-PASSWORD]` 자리는 DB 비밀번호로 직접 바꿔 넣는다. IPv4 호환 여부 문구 확인.
   - DB 비밀번호가 기억나지 않으면 같은 화면에서 재설정(영문·숫자만 권장). 새 비밀번호는 비밀번호 관리자에만 보관.
2. **[GitHub 저장소 Settings -> Environments]** 환경 2개 생성: `test`, `production`.
   - `production`: Required reviewers에 본인 추가, 배포 브랜치는 `main`만(Deployment branches). (비공개 저장소 무료 제한이면 §4 대안으로 알려 주기)
   - `test`: 배포 브랜치는 `test`만.
3. **[각 환경의 Environment secrets]** 아래 이름으로 등록:
   | Secret 이름 | 환경 | 넣을 값 |
   |---|---|---|
   | `SUPABASE_DB_URL` | test | 테스트 프로젝트 Session pooler 문자열(비밀번호 포함) |
   | `SUPABASE_DB_URL` | production | 운영 프로젝트 Session pooler 문자열 |
   | `SEED_WORDS_SQL` | test, production (선택) | `supabase/private/seed_words.sql` 파일 내용 전체 |
4. **[GitHub Settings -> Actions -> General]** Fork pull request workflows: "Require approval for all outside collaborators" 이상 유지, Workflow permissions는 "Read repository contents"(읽기 전용) 기본. Fork의 PR에는 Secret이 전달되지 않음을 확인.
5. (선택) 운영 DB에 check를 돌릴지 정해서 알려 주기(§8 질문 2).
6. 구현 뒤 첫 실행: test 브랜치에 푸시 -> Actions 화면의 잡 summary에서 PASS 수 확인. 실패 줄은 그대로 알려 주기.
7. 기존 SQL Editor 수작업은 자동화 확인 뒤 중단. 어드민 uid 등록(2차_연결_설계.md 6장 A-6)은 계속 수동.
Claude는 계정·Secret·환경 설정을 만들거나 바꾸지 않는다(D-14).

## 7. 보안 위험과 security 확인 항목
| 위험 | 대응 |
|---|---|
| DB 접속 문자열 노출(로그·에러·summary) | Secret만 사용, `set +x`·`-q`, summary에는 시험 이름·건수만. 문자열을 `echo`·`env` 출력 금지. 잡 로그는 Secret 값을 자동 가림이나 부분 문자열(비밀번호만)은 가려지지 않을 수 있어 URL을 쪼개지 않는다 |
| fork PR·외부 PR이 Secret 사용 | 트리거는 `push`·`workflow_dispatch`만. `pull_request`, `pull_request_target`, `workflow_run`(외부 입력) 사용 금지. 잡에 `if: github.repository == github.event.repository.full_name` 대신 `github.event.repository.fork == false` 확인 |
| 브랜치에서 악성 SQL 푸시 | test 환경은 `test` 브랜치만, production은 `main`만 허용(배포 브랜치 규칙). 저장소 쓰기 권한자는 사용자 1명으로 유지. main 보호 규칙(PR 필수) 권장 [미확인: 무료 비공개 저장소 제한] |
| 운영에 의도치 않은 적용 | Required reviewers 승인, 또는 수동 입력 확인(§4). 99_rollback 패턴 제외 |
| 제3자 액션 공급망 | `actions/checkout`만 사용, 버전 고정(`@v4`, 가능하면 SHA). psql은 러너 기본, 별도 설치 액션 없음 |
| DB 권한 과대 | 접속 계정이 `postgres`라 전 권한. SQL Editor와 같은 권한이라 동일 위험(수용). service_role 키·JWT는 쓰지 않음(D-11) |
| 시험이 운영 데이터에 닿음 | 운영 check 기본 미실행(§3). check는 가짜 계정을 만들고 되돌림 |
| 금칙어 Secret | 저장소 비공개 목록 보호. Secret은 읽기만 가능(수정 시 값 확인 불가) |
| 로그·아티팩트에 데이터 | 덤프·아티팩트 업로드 없음. check 출력은 이름·PASS/FAIL뿐 |
| Secret 이름·값이 저장소에 기록 | 이름만 문서에 적는다. `.env.example`에는 필요 없음(CI 전용). 로컬 수동 실행용 변수 예시는 `SUPABASE_DB_URL=`(값 없이)만 |

**security 에이전트 확인 항목**
1. 워크플로 트리거에 `pull_request`·`pull_request_target`이 없고, `permissions`가 최소(contents: read)인가.
2. 접속 문자열이 `env:` 한 곳에서만 Secret으로 주입되고 `run` 안에서 출력·`set -x`·artifact로 새지 않는가.
3. 환경·배포 브랜치 제한(test/main)과 production 승인 규칙이 설정됐다고 사용자가 확인했는가.
4. 99_rollback·diag가 자동 실행 패턴에 들어가지 않는가(`[0-8][0-9]_*.sql`).
5. 저장소 전체에서 접속 문자열·비밀번호·ref 형태가 커밋되지 않았는가(/secure-check). 프로젝트 ref가 주소에 들어가므로 문서에는 `<ref>`만.
6. `.gitignore`에 `supabase/private/`가 유지되는가(현재 `private/` 규칙으로 포함).

## 8. 구현 범위·미확인 모음
**구현 시 파일(승인 뒤)**: `.github/workflows/sql-apply.yml` 1개, 필요하면 `scripts/ci/run-checks.sh`(파싱, 40줄 안팎). 기능 코드 변경 없음. 2차_연결_설계.md 6장 A-5·A-7과 배포_실행_순서.md 5장은 자동화 후 갱신 필요(팀장 승인 뒤 architect/문서 담당).
**구현 확인 순서**: ① 테스트 DB에 풀러 접속 성공(`select 1`) ② 01~08 적용 ③ 같은 커밋 재실행(멱등) ④ check_*.sql 파싱과 summary ⑤ 일부러 FAIL 줄을 만들어 잡 실패 확인(테스트 프로젝트에서만) ⑥ 운영 승인 대기 동작.
**[미확인] 목록**
1. GitHub 무료 러너의 IPv6 접속 불가 여부와 직접 연결 주소의 IPv4 제공 여부.
2. 풀러 호스트의 지역 표기(Seoul)와 Session 모드 포트.
3. 비공개 저장소 무료 플랜의 Environment 보호 규칙·브랜치 보호 가능 여부.
4. 트랜잭션(`-1`) 안에서 실행 불가한 문장이 01~08에 있는지.
5. seed_words.sql의 중복 실행 안전성(on conflict 등), diag_check.sql의 읽기 전용 여부.
6. 러너 psql 버전과 Supabase Postgres 버전의 호환.
7. 무료 플랜의 백업 범위(복구 방침 §4).
