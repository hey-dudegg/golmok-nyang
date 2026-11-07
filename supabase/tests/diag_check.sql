-- diag_check.sql: check.sql 실패 원인 진단(M2-5b). SQL Editor 에서 통째로 실행. 안쪽 블록을 일부러 되돌려 아무것도 남지 않고, uid 는 <id> 로 가린다.
select set_config('gn.k', pg_backend_pid()::text, false);
do $d$ declare s text; v text; c text; r text := ''; i int := 0; begin begin
    foreach s in array array['?select (current_setting(''gn.k'', true) = pg_backend_pid()::text)::text || '' (앞 문장과 같은 연결)''',
      '?select current_user || '' / path='' || current_setting(''search_path'') || '' / temp='' || pg_my_temp_schema()::regnamespace::text',
      'create temp table gn_d (n serial, v text)', 'grant all on gn_d to public', 'grant all on gn_d_n_seq to public',
      'create function pg_temp.gn_f(p text) returns void language sql as $f$ insert into gn_d (v) values (p) $f$',
      'create function pg_temp.gn_g(p text) returns void language sql as $f$ insert into pg_temp.gn_d (v) values (p) $f$', 'select pg_temp.gn_f(''a'')',
      'insert into auth.users (id, aud, role, is_anonymous) values (gen_random_uuid(), ''authenticated'', ''authenticated'', true)', 'set local role authenticated',
      '?select current_user || '' / path='' || current_setting(''search_path'')', 'select count(*) from gn_d', 'select count(*) from pg_temp.gn_d',
      'select pg_temp.gn_g(''b'')', 'select pg_temp.gn_f(''c'')', 'reset role', '?select ''이벤트 트리거: '' || coalesce(string_agg(evtname || '':'' || evtevent || '':'' || evtenabled, '', ''), ''없음'') from pg_event_trigger',
      '?select ''auth.users 트리거: '' || coalesce(string_agg(tgname, '', ''), ''없음'') from pg_trigger where tgrelid = ''auth.users''::regclass and not tgisinternal',
      '?select ''authenticated TEMP 권한: '' || has_database_privilege(''authenticated'', current_database(), ''TEMP'')::text || '' / '' || split_part(version(), '' on '', 1)'] loop
      i := i + 1; v := 'OK';
      begin if left(s, 1) = '?' then execute substr(s, 2) into v; else execute s; end if;
      exception when others then get stacked diagnostics c = pg_exception_context; v := 'ERR ' || sqlerrm || ' @ ' || left(replace(c, chr(10), ' / '), 200); end;
      r := r || i || '. ' || regexp_replace(left(s, 50), '^\?', '') || ' => ' || regexp_replace(coalesce(v, 'null'), '[0-9a-fA-F-]{36}', '<id>', 'g') || chr(30);
    end loop; raise exception 'gn_undo'; exception when others then if sqlerrm <> 'gn_undo' then r := r || 'ERR 바깥 ' || sqlerrm; end if; end;
  perform set_config('gn.r', r, false); end $d$;
select n as 단계, x as 결과 from unnest(string_to_array(current_setting('gn.r'), chr(30))) with ordinality as t(x, n) where x <> '' order by n;
