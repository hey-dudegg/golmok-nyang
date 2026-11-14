-- 09_cron.sql: daily_cleanup() 하루 1회 예약 (D-87). pg_cron 은 Supabase 안에서 돌고 관리자 키가 필요 없다(D-11).
-- 한국 자정 직후 = UTC 15:05. 여러 번 실행해도 작업은 1개만 남는다(같은 이름은 지우고 다시 등록).
-- 작업은 postgres 역할로 돌며, daily_cleanup() 은 session_user 가 postgres 이고 role 설정이 없으면 통과시킨다(07_misc.sql).
-- 전제: 07_misc.sql. 정리 로직(고아 신고 포함, D-94)은 daily_cleanup() 쪽에 있다. keepalive 워크플로는 이 함수를 부르지 않는다(D-107).
create extension if not exists pg_cron with schema pg_catalog;

do $cron$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'golmok_daily_cleanup';
  perform cron.schedule('golmok_daily_cleanup', '5 15 * * *', 'select public.daily_cleanup()');
end $cron$;
