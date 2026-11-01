\set ON_ERROR_STOP on
\set QUIET on
-- اختبارات الأمان والمنطق لقاعدة بيانات DUO
create schema t;
create table t.log (n serial, msg text);
grant usage on schema t to authenticated;
create function t.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  insert into t.log (msg) values (msg);
  return 'PASS: ' || msg;
end $$;
grant execute on function t.ok(boolean, text) to authenticated;
grant insert on t.log to authenticated;
grant usage on sequence t.log_n_seq to authenticated;

\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
insert into auth.users values (:'A'), (:'B'), (:'C');

\set QUIET off

-- ========== Rooms ==========
reset role; select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
set role authenticated;
select create_room('مها', 'know-me') as r \gset
select t.ok((:'r'::jsonb ->> 'ok')::boolean, '1 create room');
select (:'r'::jsonb ->> 'code') as code, (:'r'::jsonb ->> 'room_id') as room \gset
select t.ok(:'code' ~ '^[A-Z2-9]{6}$', '1b code format');
select t.ok((create_room('') ->> 'error') = 'bad_nickname', '1c empty nickname rejected');

reset role; select set_config('request.jwt.claim.sub', :'B', false) \g /dev/null
set role authenticated;
select t.ok((select count(*) from rooms) = 0, '2 non-member cannot see room before joining');
select t.ok((join_room('ZZZZZZ', 'سعد') ->> 'error') = 'not_found', '3 wrong code rejected');
select t.ok((join_room(lower(:'code'), 'سعد') ->> 'ok')::boolean, '4 join with lowercase code');
select t.ok((join_room(:'code', 'سعد') ->> 'rejoined')::boolean, '5 repeated join is idempotent');
select t.ok((select count(*) from room_players where room_id = :'room') = 2, '6 two players');

reset role; select set_config('request.jwt.claim.sub', :'C', false) \g /dev/null
set role authenticated;
select t.ok((join_room(:'code', 'دخيل') ->> 'error') = 'full', '7 third player rejected');
select t.ok((select count(*) from rooms) = 0, '8 outsider sees no rooms');
select t.ok((select count(*) from room_players) = 0, '8b outsider sees no players');
select t.ok(not can_use_room_topic('room:' || :'room'), '9 outsider denied realtime topic');
select t.ok((send_message(:'room', 'hi', gen_random_uuid()) ->> 'error') = 'not_member', '10 outsider cannot send message');
select t.ok((start_game(:'room', 'know-me', gen_random_uuid(), 'rounds', 3, null, '{}') ->> 'error') = 'not_member', '10b outsider cannot start game');

-- direct writes must be denied
do $$ begin
  begin
    insert into public.rooms (code, host_id) values ('AAAAAA', auth.uid());
    raise exception 'FAIL: direct insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
select t.ok(true, '11 direct table insert denied');

-- ========== Chat ==========
reset role; select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
set role authenticated;
select gen_random_uuid() as cid \gset
select t.ok((send_message(:'room', '  مرحبا <b>يا</b> 👋  ', :'cid') ->> 'ok')::boolean, '12 send arabic message');
select t.ok((send_message(:'room', 'مرحبا', :'cid') ->> 'duplicate')::boolean, '13 retry with same client id not duplicated');
select t.ok((select count(*) from room_messages where room_id = :'room') = 1, '13b one message stored');
select t.ok((select body from room_messages limit 1) = 'مرحبا <b>يا</b> 👋', '13c body stored as plain text, trimmed');
select t.ok((select nickname from room_messages limit 1) = 'مها', '14 sender nickname taken from server');
select t.ok((send_message(:'room', repeat('x', 501), gen_random_uuid()) ->> 'error') = 'too_long', '15 long message rejected');
select t.ok((send_message(:'room', '   ', gen_random_uuid()) ->> 'error') = 'empty', '15b empty message rejected');
do $$ declare i int; res jsonb; r uuid := (select id from public.rooms limit 1); begin
  for i in 1..7 loop res := public.send_message(r, 'spam ' || i, gen_random_uuid()); end loop;
  res := public.send_message(r, 'too many', gen_random_uuid());
  if res ->> 'error' <> 'rate_limited' then raise exception 'FAIL: rate limit (%)', res; end if;
end $$;
select t.ok(true, '16 chat rate limit');
select t.ok(can_use_room_topic('room:' || :'room'), '17 member allowed realtime topic');
select t.ok(not can_use_room_topic('room:not-a-uuid'), '17b bad topic denied');
select t.ok(not can_use_room_topic('lobby'), '17c other topic denied');

reset role; select set_config('request.jwt.claim.sub', :'B', false) \g /dev/null
set role authenticated;
select t.ok((select count(*) from room_messages) = 8, '18 partner reads room messages');

-- ========== Rounds game ==========
select t.ok((start_game(:'room', 'know-me', gen_random_uuid(), 'rounds', 2, null, '{}') ->> 'error') = 'not_host', '19 non-host cannot start');
reset role; select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
set role authenticated;
select gen_random_uuid() as req \gset
select start_game(:'room', 'know-me', :'req', 'rounds', 2, null, '{"items":[1,2]}') ->> 'session_id' as sess \gset
select t.ok((start_game(:'room', 'know-me', :'req', 'rounds', 2, null, '{}') ->> 'session_id') = :'sess', '20 double start returns same session');
select t.ok((select count(*) from game_sessions where status = 'playing') = 1, '20b single active session');
select t.ok((submit_answer(:'sess', 1, '{"choice":2}') ->> 'ok')::boolean, '21 A answers');
select t.ok((submit_answer(:'sess', 1, '{"choice":3}') ->> 'duplicate')::boolean, '22 resubmit ignored');
select t.ok((select answer->>'choice' from game_answers where player_id = :'A') = '2', '22b first answer kept');
select t.ok((submit_answer(:'sess', 2, '{"choice":1}') ->> 'error') = 'round_closed', '23 cannot answer future round');
select t.ok((submit_answer(:'sess', 1, '[1]') ->> 'error') = 'bad_request', '23c non-object answer rejected');
select t.ok((select (answer->>'_ms') is not null from game_answers where player_id = :'A'), '23d server timing recorded');
select t.ok((next_round(:'sess', 1) ->> 'error') = 'not_ready', '23b cannot skip before reveal');

reset role; select set_config('request.jwt.claim.sub', :'B', false) \g /dev/null
set role authenticated;
select t.ok((select count(*) from game_answers where session_id = :'sess') = 0, '24 partner answer hidden before reveal');
select t.ok((select answered from game_sessions where id = :'sess') = array[:'A'::uuid], '24b answered marker visible');
do $$ begin
  begin
    update public.game_answers set answer = '{"choice":9}';
    raise exception 'FAIL: update allowed';
  exception when insufficient_privilege then null; end;
end $$;
select t.ok(true, '25 cannot edit answers directly');
select t.ok((submit_answer(:'sess', 1, '{"choice":2}') ->> 'ok')::boolean, '26 B answers');
select t.ok((select phase from game_sessions where id = :'sess') = 'revealed', '27 auto reveal after both');
select t.ok((select count(*) from game_answers where session_id = :'sess') = 2, '28 both answers visible after reveal');
select t.ok((judge_answer(:'sess', 1, :'B', true) ->> 'error') = 'bad_request', '28b cannot judge own answer');
select t.ok((judge_answer(:'sess', 1, :'A', true) ->> 'ok')::boolean, '28c judge partner');
select t.ok((next_round(:'sess', 1) ->> 'ok')::boolean, '29 next round');
select t.ok((next_round(:'sess', 1) ->> 'duplicate')::boolean, '30 double next ignored');
select t.ok((select round from game_sessions where id = :'sess') = 2, '30b round is 2 exactly');
select t.ok((submit_answer(:'sess', 2, '{"choice":1}') ->> 'ok')::boolean, '31 round 2 answer');

reset role; select set_config('request.jwt.claim.sub', :'C', false) \g /dev/null
set role authenticated;
select t.ok((select count(*) from game_answers) = 0, '32 outsider cannot read answers');
select t.ok((select count(*) from game_sessions) = 0, '32b outsider cannot read sessions');
select t.ok((submit_answer(:'sess', 2, '{"choice":1}') ->> 'error') = 'not_member', '32c outsider cannot answer');

-- ========== Timed round expiry ==========
reset role; select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
set role authenticated;
select start_game(:'room', 'quick', gen_random_uuid(), 'rounds', 3, 5, '{}') ->> 'session_id' as qs \gset
select t.ok((select status from game_sessions where id = :'sess') = 'abandoned', '33 previous session closed on new start');
select t.ok((expire_round(:'qs', 1) ->> 'error') = 'not_ready', '34 cannot expire before deadline');
reset role;
update game_sessions set round_deadline = now() - interval '5 seconds' where id = :'qs';
select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
set role authenticated;
select t.ok((submit_answer(:'qs', 1, '{"choice":0}') ->> 'error') = 'too_late', '35 late answer rejected');
select t.ok((expire_round(:'qs', 1) ->> 'ok')::boolean, '36 expire round');
select t.ok((select phase from game_sessions where id = :'qs') = 'revealed', '36b revealed after expiry');

-- ========== Sprint ==========
select start_game(:'room', 'sixty', gen_random_uuid(), 'sprint', 3, 60, '{}') ->> 'session_id' as sp \gset
select t.ok((submit_answer(:'sp', 1, '{"choice":1}') ->> 'ok')::boolean, '37 sprint answer');
select t.ok((submit_answer(:'sp', 2, '{"choice":0}') ->> 'ok')::boolean, '37b sprint answer 2 without waiting');
reset role; select set_config('request.jwt.claim.sub', :'B', false) \g /dev/null
set role authenticated;
select t.ok((select count(*) from game_answers where session_id = :'sp') = 0, '38 sprint answers hidden until end');
select t.ok((select (progress ->> :'A')::int from game_sessions where id = :'sp') = 2, '38b sprint progress visible');

-- ========== Memory (server-validated) ==========
reset role; select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
set role authenticated;
select start_game(:'room', 'memory', gen_random_uuid(), 'turns', 1, null, '{"pairs":4}') ->> 'session_id' as mem \gset
select t.ok((select count(*) from game_secrets where session_id = :'mem') = 0, '39 board secret unreadable');
reset role;
select turn_player as t1, (select user_id from room_players where room_id = :'room' and user_id <> turn_player) as t2
from game_sessions where id = :'mem' \gset
select secret as board from game_secrets where session_id = :'mem' \gset
select set_config('request.jwt.claim.sub', :'t2', false) \g /dev/null
set role authenticated;
select t.ok((submit_move(:'mem', 1, '{"card":0}') ->> 'error') = 'not_your_turn', '40 out-of-turn move rejected');
reset role;
-- خطة: العب كل الأزواج بشكل صحيح بواسطة صاحب الدور
create function t.pairs(b jsonb) returns table(a int, c int) language sql as $$
  select min(i)::int, max(i)::int from (select (ord - 1)::int as i, val from jsonb_array_elements_text(b) with ordinality as x(val, ord)) y group by val order by 1
$$;
select set_config('request.jwt.claim.sub', :'t1', false) \g /dev/null
set role authenticated;
select t.ok((submit_move(:'mem', 1, '{"card":99}') ->> 'error') = 'bad_move', '41 invalid card rejected');
select t.ok((submit_move(:'mem', 1, '{"card":"x"}') ->> 'error') = 'bad_move', '41b non-numeric card rejected');
select t.ok((submit_move(:'mem', 2, '{"card":0}') ->> 'error') = 'stale', '42 stale sequence rejected');
reset role;
do $$
declare p record; seq int := 1; res jsonb; sid uuid; b jsonb;
begin
  select id into sid from public.game_sessions where game_id = 'memory' and status = 'playing';
  select secret into b from public.game_secrets where session_id = sid;
  for p in select * from t.pairs(b) loop
    perform set_config('request.jwt.claim.sub', (select turn_player::text from public.game_sessions where id = sid), false);
    set local role authenticated;
    res := public.submit_move(sid, seq, jsonb_build_object('card', p.a)); seq := seq + 1;
    if not (res ->> 'ok')::boolean then raise exception 'FAIL flip1 %', res; end if;
    res := public.submit_move(sid, seq, jsonb_build_object('card', p.c)); seq := seq + 1;
    if not (res -> 'move' ->> 'match')::boolean then raise exception 'FAIL match %', res; end if;
    reset role;
  end loop;
  if (select status from public.game_sessions where id = sid) <> 'finished' then raise exception 'FAIL: memory not finished'; end if;
  if (select (state -> 'scores' ->> turn_player::text)::int from public.game_sessions where id = sid) <> 4 then
    raise exception 'FAIL: memory score';
  end if;
end $$;
select t.ok(true, '43 memory full game, matches validated by server, finished with score 4');

-- ========== Number game ==========
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
select start_game(:'room', 'number', gen_random_uuid(), 'turns', 2, null, '{}') ->> 'session_id' as num \gset
reset role;
select turn_player as setter, (select user_id from room_players where room_id = :'room' and user_id <> turn_player) as guesser
from game_sessions where id = :'num' \gset
select set_config('request.jwt.claim.sub', :'setter', false) \g /dev/null
set role authenticated;
select t.ok((submit_move(:'num', 1, '{"kind":"set","value":150}') ->> 'error') = 'bad_move', '44 out-of-range secret rejected');
select t.ok((submit_move(:'num', 1, '{"kind":"set","value":42}') -> 'move' ->> 'value') is null, '45 secret not exposed in move');
select t.ok((select (secret #>> '{}')::int from game_secrets where session_id = :'num') = 42, '45b setter can read own secret');
reset role; select set_config('request.jwt.claim.sub', :'guesser', false) \g /dev/null
set role authenticated;
select t.ok((select count(*) from game_secrets where session_id = :'num') = 0, '46 guesser cannot read secret');
select t.ok((submit_move(:'num', 2, '{"kind":"guess","value":50}') -> 'move' ->> 'hint') = 'lower', '47 hint lower');
select t.ok((submit_move(:'num', 3, '{"kind":"guess","value":30}') -> 'move' ->> 'hint') = 'higher', '47b hint higher');
select submit_move(:'num', 4, '{"kind":"guess","value":42}') as g \gset
select t.ok((:'g'::jsonb -> 'move' ->> 'solved')::boolean and (:'g'::jsonb -> 'move' ->> 'secret')::int = 42, '48 solved reveals secret');
select t.ok((select turn_player from game_sessions where id = :'num') = :'guesser'::uuid, '49 roles swap after round');

-- ========== Generic turns ==========
reset role; select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
set role authenticated;
select start_game(:'room', 'story', gen_random_uuid(), 'turns', 6, null, '{"starter":"كان يا ما كان"}') ->> 'session_id' as st \gset
reset role;
select turn_player as p1 from game_sessions where id = :'st' \gset
select set_config('request.jwt.claim.sub', :'p1', false) \g /dev/null
set role authenticated;
select t.ok((submit_move(:'st', 1, '{"kind":"line","text":"وفي يوم","pass_turn":true}') ->> 'ok')::boolean, '50 story line');
select t.ok((select turn_player from game_sessions where id = :'st') <> :'p1'::uuid, '50b turn passed');
select t.ok((submit_move(:'st', 2, '{"kind":"line","text":"مرة ثانية"}') ->> 'error') = 'not_your_turn', '51 cannot play twice in a row');

-- ========== Leave / rejoin / expiry ==========
reset role; select set_config('request.jwt.claim.sub', :'B', false) \g /dev/null
set role authenticated;
select t.ok((leave_room(:'room') ->> 'ok')::boolean, '52 leave room');
select t.ok((select count(*) from rooms) = 0, '52b left player loses access');
reset role; select set_config('request.jwt.claim.sub', :'A', false) \g /dev/null
set role authenticated;
select t.ok((select count(*) from game_sessions where status = 'playing') = 0, '53 active game abandoned on leave');
reset role; select set_config('request.jwt.claim.sub', :'C', false) \g /dev/null
set role authenticated;
select t.ok((join_room(:'code', 'سارة') ->> 'ok')::boolean, '54 free seat can be taken');
reset role;
update rooms set expires_at = now() - interval '1 minute' where id = :'room';
select set_config('request.jwt.claim.sub', :'B', false) \g /dev/null
set role authenticated;
select t.ok((join_room(:'code', 'سعد') ->> 'error') = 'expired', '55 expired room rejected');
select t.ok((create_room('سعد') ->> 'ok')::boolean, '56 create triggers cleanup');
reset role;
select t.ok((select count(*) from rooms where id = :'room') = 0, '56b expired room deleted');
select t.ok((select count(*) from room_messages where room_id = :'room') = 0, '56c its messages deleted');
select set_config('request.jwt.claim.sub', :'C', false) \g /dev/null
set role authenticated;
do $$ declare i int; res jsonb; begin
  for i in 1..15 loop res := public.join_room('QQQQQ' || chr(50 + (i % 8)), 'x'); end loop;
  res := public.join_room('ABCDEF', 'x');
  if res ->> 'error' <> 'rate_limited' then raise exception 'FAIL: join brute force not limited (%)', res; end if;
end $$;
select t.ok(true, '57 join brute-force rate limited');

-- anon role (not signed in) has no access
reset role; select set_config('request.jwt.claim.sub', '', false) \g /dev/null
set role anon;
do $$ begin
  begin
    perform public.create_room('x');
    raise exception 'FAIL: anon executed rpc';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.rooms;
    raise exception 'FAIL: anon read table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select t.ok(true, '58 anon (signed-out) role denied');

\set QUIET on
select 'TOTAL PASSED: ' || count(*) from t.log;
