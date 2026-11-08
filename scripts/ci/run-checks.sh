#!/usr/bin/env bash
# check SQL 한 파일을 실행하고 결과(name<TAB>result)를 판정한다. 접속 문자열은 환경 변수 SUPABASE_DB_URL로만 받는다.
# 사용: scripts/ci/run-checks.sh supabase/tests/check_01_base.sql   (종료 코드 0=전부 PASS, 1=실패)
set -u
f="$1"
out="$(mktemp)"
PGOPTIONS='-c statement_timeout=60000' psql "$SUPABASE_DB_URL" -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 -f "$f" >"$out"
rc=$?
pass=$(awk -F'\t' 'NF>=2 && $2=="PASS"' "$out" | wc -l)
bad=$(awk -F'\t' 'NF>=2 && $2!="PASS"' "$out" | wc -l)
sum="${GITHUB_STEP_SUMMARY:-/dev/null}"
{
  echo "### $(basename "$f"): $pass PASS / $bad FAIL"
  if [ "$bad" -gt 0 ]; then
    echo; echo "| 시험 | 결과 |"; echo "|---|---|"
    awk -F'\t' 'NF>=2 && $2!="PASS" {print "| " $1 " | " $2 " |"}' "$out"
  fi
} >>"$sum"
echo "$(basename "$f"): $pass PASS / $bad FAIL (psql 종료 코드 $rc)"
awk -F'\t' 'NF>=2 && $2!="PASS" {print "FAIL: " $1 " -> " $2}' "$out"
rm -f "$out"
if [ "$rc" -ne 0 ]; then echo "psql 실패"; exit 1; fi
if [ $((pass + bad)) -eq 0 ]; then echo "결과 없음"; exit 1; fi
[ "$bad" -eq 0 ]
