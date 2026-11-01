-- =====================================================================
-- DUO — قاعدة البيانات الأساسية (الغرف، اللاعبون، الألعاب، الشات)
-- شغّل هذا الملف مرة واحدة في Supabase → SQL Editor
-- لا يحتوي الملف على أي مفاتيح سرية.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- الجداول
-- ---------------------------------------------------------------------

create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_id       uuid not null,
  status        text not null default 'open' check (status in ('open', 'closed')),
  current_game  text check (current_game is null or current_game ~ '^[a-z0-9_-]{2,32}$'),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours'
);
create index if not exists rooms_expires_idx on public.rooms (expires_at);

create table if not exists public.room_players (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 20),
  seat       smallint not null check (seat in (1, 2)),
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id),
  -- مقعدان فقط لكل غرفة: يمنع دخول لاعب ثالث حتى مع الطلبات المتزامنة
  unique (room_id, seat)
);
create index if not exists room_players_user_idx on public.room_players (user_id);

create table if not exists public.game_sessions (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.rooms (id) on delete cascade,
  game_id           text not null check (game_id ~ '^[a-z0-9_-]{2,32}$'),
  request_id        uuid not null,
  status            text not null default 'playing' check (status in ('playing', 'finished', 'abandoned')),
  mode              text not null check (mode in ('rounds', 'sprint', 'turns')),
  round             int  not null default 1,
  rounds_total      int  not null check (rounds_total between 1 and 60),
  phase             text not null default 'answering' check (phase in ('answering', 'revealed')),
  round_seconds     int  check (round_seconds is null or round_seconds between 5 and 600),
  round_started_at  timestamptz not null default now(),
  round_deadline    timestamptz,
  answered          uuid[] not null default '{}',
  progress          jsonb not null default '{}'::jsonb,
  turn_player       uuid,
  content           jsonb not null default '{}'::jsonb check (pg_column_size(content) < 60000),
  state             jsonb not null default '{}'::jsonb,
  version           int not null default 1,
  started_by        uuid not null,
  created_at        timestamptz not null default now(),
  finished_at       timestamptz,
  unique (room_id, request_id)
);
-- جلسة لعب نشطة واحدة فقط لكل غرفة
create unique index if not exists game_sessions_one_active on public.game_sessions (room_id) where status = 'playing';
create index if not exists game_sessions_room_idx on public.game_sessions (room_id, created_at desc);

create table if not exists public.game_answers (
  session_id  uuid not null references public.game_sessions (id) on delete cascade,
  room_id     uuid not null references public.rooms (id) on delete cascade,
  round       int  not null check (round between 1 and 60),
  player_id   uuid not null,
  answer      jsonb not null check (pg_column_size(answer) < 4000),
  judged      boolean,
  created_at  timestamptz not null default now(),
  -- إجابة واحدة لكل لاعب في كل جولة: يمنع تكرار النقاط
  primary key (session_id, round, player_id)
);
create index if not exists game_answers_room_idx on public.game_answers (room_id);

create table if not exists public.game_moves (
  session_id  uuid not null references public.game_sessions (id) on delete cascade,
  room_id     uuid not null references public.rooms (id) on delete cascade,
  seq         int  not null,
  player_id   uuid not null,
  move        jsonb not null check (pg_column_size(move) < 4000),
  created_at  timestamptz not null default now(),
  primary key (session_id, seq)
);
create index if not exists game_moves_room_idx on public.game_moves (room_id);

-- أسرار اللعبة (ترتيب بطاقات الذاكرة، الرقم السري). لا يقرؤها إلا صاحبها، وبعضها لا يقرؤه أحد.
create table if not exists public.game_secrets (
  session_id  uuid not null references public.game_sessions (id) on delete cascade,
  slot        text not null,
  owner_id    uuid,
  secret      jsonb not null,
  primary key (session_id, slot)
);

create table if not exists public.room_messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  sender_id   uuid not null,
  nickname    text not null,
  body        text not null check (char_length(body) between 1 and 500),
  client_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (room_id, client_id)
);
create index if not exists room_messages_room_idx on public.room_messages (room_id, created_at);

-- سجل داخلي لتحديد معدل الطلبات (لا يُقرأ من الواجهة)
create table if not exists public.rate_events (
  id       bigint generated always as identity primary key,
  user_id  uuid not null,
  kind     text not null,
  at       timestamptz not null default now()
);
create index if not exists rate_events_idx on public.rate_events (user_id, kind, at desc);

-- ---------------------------------------------------------------------
-- دوال مساعدة
-- ---------------------------------------------------------------------

create or replace function public._err(p_code text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('ok', false, 'error', p_code)
$$;

create or replace function public.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from room_players rp
    where rp.room_id = p_room and rp.user_id = auth.uid()
  )
$$;

-- يُستخدم في سياسات Realtime: القناة "room:<uuid>" لعضوي الغرفة فقط
create or replace function public.can_use_room_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_topic is null
     or p_topic !~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1
    from room_players rp
    join rooms r on r.id = rp.room_id
    where rp.room_id = substr(p_topic, 6)::uuid
      and rp.user_id = auth.uid()
      and r.status = 'open'
      and r.expires_at > now()
  );
end $$;

create or replace function public._rate_count(p_kind text, p_window interval)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from rate_events
  where user_id = auth.uid() and kind = p_kind and at > now() - p_window
$$;

create or replace function public._rate_hit(p_kind text)
returns void language sql security definer set search_path = public as $$
  insert into rate_events (user_id, kind) values (auth.uid(), p_kind)
$$;

create or replace function public._gen_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(6);
  r text := '';
  i int;
begin
  for i in 0..5 loop
    r := r || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return r;
end $$;

create or replace function public._clean_nick(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]<>]', '', 'g'))
$$;

-- حذف الغرف المنتهية وكل ما يتبعها (الرسائل والإجابات تُحذف تلقائيًا)
create or replace function public.cleanup_expired()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with d as (
    delete from rooms
    where id in (select id from rooms where expires_at < now() or status = 'closed' limit 200)
    returning 1
  )
  select count(*) into n from d;
  delete from rate_events where at < now() - interval '1 day';
  return n;
end $$;

create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- ---------------------------------------------------------------------
-- الغرف
-- ---------------------------------------------------------------------

create or replace function public.create_room(p_nickname text, p_game text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nick text := _clean_nick(p_nickname);
  c text;
  rid uuid;
  exp timestamptz;
  tries int := 0;
begin
  if uid is null then return _err('no_session'); end if;
  if char_length(nick) not between 1 and 20 then return _err('bad_nickname'); end if;
  if p_game is not null and p_game !~ '^[a-z0-9_-]{2,32}$' then return _err('bad_request'); end if;
  if _rate_count('create', interval '1 hour') >= 20 then return _err('rate_limited'); end if;

  perform cleanup_expired();

  loop
    tries := tries + 1;
    c := _gen_code();
    begin
      insert into rooms (code, host_id, current_game) values (c, uid, p_game)
      returning id, expires_at into rid, exp;
      exit;
    exception when unique_violation then
      if tries >= 8 then return _err('try_again'); end if;
    end;
  end loop;

  insert into room_players (room_id, user_id, nickname, seat) values (rid, uid, nick, 1);
  perform _rate_hit('create');
  return jsonb_build_object('ok', true, 'room_id', rid, 'code', c, 'expires_at', exp);
end $$;

create or replace function public.join_room(p_code text, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nick text := _clean_nick(p_nickname);
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  r rooms%rowtype;
  n int;
  s smallint;
begin
  if uid is null then return _err('no_session'); end if;
  if char_length(nick) not between 1 and 20 then return _err('bad_nickname'); end if;
  if _rate_count('join_fail', interval '10 minutes') >= 15 then return _err('rate_limited'); end if;
  if v_code !~ '^[A-Z2-9]{6}$' then
    perform _rate_hit('join_fail');
    return _err('not_found');
  end if;

  select * into r from rooms where code = v_code for update;
  if not found then
    perform _rate_hit('join_fail');
    return _err('not_found');
  end if;
  if r.status <> 'open' or r.expires_at <= now() then return _err('expired'); end if;

  -- انضمام متكرر من اللاعب نفسه: نعيده إلى غرفته دون مقعد جديد
  if exists (select 1 from room_players where room_id = r.id and user_id = uid) then
    update room_players set nickname = nick where room_id = r.id and user_id = uid;
    return jsonb_build_object('ok', true, 'room_id', r.id, 'code', r.code, 'rejoined', true, 'expires_at', r.expires_at);
  end if;

  select count(*) into n from room_players where room_id = r.id;
  if n >= 2 then return _err('full'); end if;

  s := case when exists (select 1 from room_players where room_id = r.id and seat = 1) then 2 else 1 end;
  begin
    insert into room_players (room_id, user_id, nickname, seat) values (r.id, uid, nick, s);
  exception when unique_violation then
    return _err('full');
  end;
  if n = 0 then update rooms set host_id = uid where id = r.id; end if;

  return jsonb_build_object('ok', true, 'room_id', r.id, 'code', r.code, 'expires_at', r.expires_at);
end $$;

create or replace function public.leave_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  remaining uuid;
begin
  if uid is null then return _err('no_session'); end if;
  perform 1 from rooms where id = p_room for update;
  if not found then return jsonb_build_object('ok', true); end if;

  delete from room_players where room_id = p_room and user_id = uid;
  if not found then return jsonb_build_object('ok', true); end if;

  update game_sessions set status = 'abandoned', finished_at = now()
  where room_id = p_room and status = 'playing';

  select user_id into remaining from room_players where room_id = p_room limit 1;
  if remaining is null then
    delete from rooms where id = p_room;
  else
    update rooms set host_id = remaining where id = p_room and host_id = uid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- اختيار/اقتراح لعبة في الردهة (أي عضو)
create or replace function public.select_game(p_room uuid, p_game text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return _err('no_session'); end if;
  if not is_room_member(p_room) then return _err('not_member'); end if;
  if p_game is not null and p_game !~ '^[a-z0-9_-]{2,32}$' then return _err('bad_request'); end if;
  update rooms set current_game = p_game where id = p_room and status = 'open' and expires_at > now();
  if not found then return _err('expired'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- الألعاب
-- ---------------------------------------------------------------------

create or replace function public.start_game(
  p_room uuid, p_game text, p_request uuid, p_mode text,
  p_rounds int, p_round_seconds int, p_content jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r rooms%rowtype;
  sid uuid;
  players uuid[];
  st jsonb := '{}'::jsonb;
  first_turn uuid := null;
  deadline timestamptz := null;
  npairs int;
  board int[];
begin
  if uid is null then return _err('no_session'); end if;
  select * into r from rooms where id = p_room for update;
  if not found or not is_room_member(p_room) then return _err('not_member'); end if;
  if r.status <> 'open' or r.expires_at <= now() then return _err('expired'); end if;
  if r.host_id <> uid then return _err('not_host'); end if;

  -- الضغط على زر البدء أكثر من مرة يعيد الجلسة نفسها
  select id into sid from game_sessions where room_id = p_room and request_id = p_request;
  if found then return jsonb_build_object('ok', true, 'session_id', sid, 'duplicate', true); end if;

  select array_agg(user_id order by seat) into players from room_players where room_id = p_room;
  if coalesce(array_length(players, 1), 0) < 2 then return _err('need_partner'); end if;

  if p_game is null or p_game !~ '^[a-z0-9_-]{2,32}$'
     or p_mode not in ('rounds', 'sprint', 'turns')
     or p_rounds is null or p_rounds not between 1 and 60
     or (p_round_seconds is not null and p_round_seconds not between 5 and 600)
     or p_content is null or jsonb_typeof(p_content) <> 'object'
     or pg_column_size(p_content) >= 60000
     or (p_game in ('memory', 'number') and p_mode <> 'turns')
     or (p_mode = 'sprint' and p_round_seconds is null) then
    return _err('bad_request');
  end if;

  if p_mode = 'turns' then
    first_turn := players[1 + floor(random() * 2)::int];
  end if;
  if p_round_seconds is not null and p_mode <> 'turns' then
    deadline := now() + make_interval(secs => p_round_seconds);
  end if;

  if p_game = 'memory' then
    npairs := coalesce((p_content ->> 'pairs')::int, 0);
    if npairs not between 4 and 12 then return _err('bad_request'); end if;
    select array_agg(v order by random()) into board
    from (select generate_series(0, npairs - 1) as v
          union all
          select generate_series(0, npairs - 1)) t;
    st := jsonb_build_object('pending', null, 'matched', '[]'::jsonb, 'scores', '{}'::jsonb);
  elsif p_game = 'number' then
    st := jsonb_build_object('round', 1, 'setter', first_turn, 'phase', 'set', 'attempts', 0);
  end if;

  update game_sessions set status = 'abandoned', finished_at = now()
  where room_id = p_room and status = 'playing';

  insert into game_sessions (room_id, game_id, request_id, mode, rounds_total, round_seconds,
                             round_deadline, turn_player, content, state, started_by)
  values (p_room, p_game, p_request, p_mode, p_rounds, p_round_seconds,
          deadline, first_turn, p_content, st, uid)
  returning id into sid;

  if board is not null then
    insert into game_secrets (session_id, slot, owner_id, secret) values (sid, 'board', null, to_jsonb(board));
  end if;

  update rooms set current_game = p_game where id = p_room;
  return jsonb_build_object('ok', true, 'session_id', sid);
exception when invalid_text_representation or numeric_value_out_of_range then
  return _err('bad_request');
end $$;

create or replace function public.submit_answer(p_session uuid, p_round int, p_answer jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s game_sessions%rowtype;
  ins int;
  cnt int;
begin
  if uid is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if s.status <> 'playing' then return _err('session_closed'); end if;
  if s.mode = 'turns' then return _err('bad_request'); end if;
  if p_answer is null or jsonb_typeof(p_answer) <> 'object' then return _err('bad_request'); end if;
  if pg_column_size(p_answer) >= 3800 then return _err('too_long'); end if;

  if s.mode = 'rounds' then
    if p_round is distinct from s.round or s.phase <> 'answering' then return _err('round_closed'); end if;
  elsif p_round is null or p_round not between 1 and s.rounds_total then
    return _err('bad_request');
  end if;
  if s.round_deadline is not null and now() > s.round_deadline + interval '2 seconds' then
    return _err('too_late');
  end if;

  -- زمن الإجابة يحسبه الخادم (للألعاب السريعة) ولا يمكن للواجهة تزويره
  insert into game_answers (session_id, room_id, round, player_id, answer)
  values (p_session, s.room_id, p_round, uid,
          (p_answer - '_ms') || jsonb_build_object('_ms',
             greatest(0, round(extract(epoch from (now() - s.round_started_at)) * 1000))::int))
  on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  if s.mode = 'rounds' then
    select count(*) into cnt from game_answers where session_id = p_session and round = p_round;
    update game_sessions
    set answered = array_append(answered, uid),
        phase = case when cnt >= 2 then 'revealed' else phase end,
        version = version + 1
    where id = p_session;
  else
    select count(*) into cnt from game_answers where session_id = p_session;
    update game_sessions
    set progress = jsonb_set(progress, array[uid::text],
                             to_jsonb(coalesce((progress ->> uid::text)::int, 0) + 1)),
        status = case when cnt >= 2 * s.rounds_total then 'finished' else status end,
        finished_at = case when cnt >= 2 * s.rounds_total then now() else finished_at end,
        version = version + 1
    where id = p_session;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- عند انتهاء المؤقت: كشف الجولة (أو إنهاء التحدي السريع)
create or replace function public.expire_round(p_session uuid, p_round int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s game_sessions%rowtype;
begin
  if auth.uid() is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if s.status <> 'playing' or s.round_deadline is null then return jsonb_build_object('ok', true); end if;
  if now() < s.round_deadline then return _err('not_ready'); end if;

  if s.mode = 'sprint' then
    update game_sessions set status = 'finished', finished_at = now(), version = version + 1 where id = p_session;
  elsif s.mode = 'rounds' and s.round = p_round and s.phase = 'answering' then
    update game_sessions set phase = 'revealed', version = version + 1 where id = p_session;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.next_round(p_session uuid, p_round int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s game_sessions%rowtype;
begin
  if auth.uid() is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if s.status <> 'playing' then return jsonb_build_object('ok', true, 'finished', true); end if;
  if s.mode <> 'rounds' then return _err('bad_request'); end if;
  -- ضغط "التالي" من الطرفين معًا: الطلب الثاني لا يقفز جولة إضافية
  if s.round > p_round then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  if s.round <> p_round or s.phase <> 'revealed' then return _err('not_ready'); end if;

  if s.round >= s.rounds_total then
    update game_sessions set status = 'finished', finished_at = now(), version = version + 1 where id = p_session;
  else
    update game_sessions
    set round = round + 1,
        phase = 'answering',
        answered = '{}',
        round_started_at = now(),
        round_deadline = case when round_seconds is null then null
                              else now() + make_interval(secs => round_seconds) end,
        version = version + 1
    where id = p_session;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- الطرف الآخر يحكم على إجابة شريكه (صح / خطأ) بعد كشفها
create or replace function public.judge_answer(p_session uuid, p_round int, p_target uuid, p_correct boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s game_sessions%rowtype;
begin
  if uid is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if p_target = uid then return _err('bad_request'); end if;
  if not (s.status <> 'playing' or p_round < s.round or (p_round = s.round and s.phase = 'revealed')) then
    return _err('not_ready');
  end if;
  update game_answers set judged = p_correct
  where session_id = p_session and round = p_round and player_id = p_target and judged is null;
  if found then
    update game_sessions set version = version + 1 where id = p_session;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.submit_move(p_session uuid, p_seq int, p_move jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s game_sessions%rowtype;
  other uuid;
  nseq int;
  mv jsonb;
  st jsonb;
  next_turn uuid;
  finish boolean := false;
  board jsonb;
  card int; v int; pend int; fv int; npairs int; is_match boolean;
  secret_num int; guess int; att int; hint text; rnd int;
begin
  if uid is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if s.status <> 'playing' then return _err('session_closed'); end if;
  if s.mode <> 'turns' then return _err('bad_request'); end if;
  if s.turn_player is not null and s.turn_player <> uid then return _err('not_your_turn'); end if;
  if p_move is null or jsonb_typeof(p_move) <> 'object' or pg_column_size(p_move) >= 2000 then
    return _err('bad_request');
  end if;

  select coalesce(max(seq), 0) + 1 into nseq from game_moves where session_id = p_session;
  -- يمنع الحركات المكررة أو المتزامنة
  if p_seq is distinct from nseq then return _err('stale'); end if;

  select user_id into other from room_players where room_id = s.room_id and user_id <> uid limit 1;
  if other is null then return _err('need_partner'); end if;
  st := s.state;
  next_turn := s.turn_player;

  if s.game_id = 'memory' then
    card := (p_move ->> 'card')::int;
    npairs := (s.content ->> 'pairs')::int;
    if card is null or card < 0 or card >= npairs * 2 then return _err('bad_move'); end if;
    if (st -> 'matched') @> to_jsonb(card) then return _err('bad_move'); end if;
    select secret into board from game_secrets where session_id = p_session and slot = 'board';
    v := (board ->> card)::int;
    pend := (st ->> 'pending')::int;
    if pend is null then
      st := jsonb_set(st, '{pending}', to_jsonb(card));
      mv := jsonb_build_object('kind', 'flip', 'card', card, 'value', v);
    else
      if pend = card then return _err('bad_move'); end if;
      fv := (board ->> pend)::int;
      is_match := (fv = v);
      st := jsonb_set(st, '{pending}', 'null'::jsonb);
      if is_match then
        st := jsonb_set(st, '{matched}', (st -> 'matched') || jsonb_build_array(pend, card));
        st := jsonb_set(st, array['scores', uid::text],
                        to_jsonb(coalesce((st -> 'scores' ->> uid::text)::int, 0) + 1));
        if jsonb_array_length(st -> 'matched') >= npairs * 2 then finish := true; end if;
      else
        next_turn := other;
      end if;
      mv := jsonb_build_object('kind', 'flip', 'card', card, 'value', v,
                               'first', pend, 'first_value', fv, 'match', is_match);
    end if;

  elsif s.game_id = 'number' then
    rnd := (st ->> 'round')::int;
    if st ->> 'phase' = 'set' then
      if p_move ->> 'kind' <> 'set' then return _err('bad_move'); end if;
      secret_num := (p_move ->> 'value')::int;
      if secret_num is null or secret_num not between 1 and 100 then return _err('bad_move'); end if;
      insert into game_secrets (session_id, slot, owner_id, secret)
      values (p_session, 'number_' || rnd, uid, to_jsonb(secret_num))
      on conflict (session_id, slot) do update set secret = excluded.secret, owner_id = excluded.owner_id;
      st := st || jsonb_build_object('phase', 'guess', 'attempts', 0);
      next_turn := other;
      mv := jsonb_build_object('kind', 'set', 'round', rnd);
    else
      if p_move ->> 'kind' <> 'guess' then return _err('bad_move'); end if;
      guess := (p_move ->> 'value')::int;
      if guess is null or guess not between 1 and 100 then return _err('bad_move'); end if;
      select (secret #>> '{}')::int into secret_num from game_secrets
      where session_id = p_session and slot = 'number_' || rnd;
      att := coalesce((st ->> 'attempts')::int, 0) + 1;
      hint := case when guess = secret_num then 'correct'
                   when guess < secret_num then 'higher' else 'lower' end;
      st := jsonb_set(st, '{attempts}', to_jsonb(att));
      mv := jsonb_build_object('kind', 'guess', 'round', rnd, 'value', guess, 'hint', hint, 'attempt', att);
      if hint = 'correct' or att >= 8 then
        mv := mv || jsonb_build_object('round_over', true, 'secret', secret_num, 'solved', hint = 'correct');
        if rnd >= s.rounds_total then
          finish := true;
        else
          st := st || jsonb_build_object('round', rnd + 1, 'setter', uid, 'phase', 'set', 'attempts', 0);
          next_turn := uid;
        end if;
      end if;
    end if;

  else
    -- ألعاب الأدوار العامة (صراحة أو تحدي، افتح السؤال، نبني قصة)
    if p_move ->> 'kind' is null then return _err('bad_request'); end if;
    mv := p_move - 'pass_turn' - 'finish';
    if coalesce((p_move ->> 'pass_turn')::boolean, false) then next_turn := other; end if;
    if coalesce((p_move ->> 'finish')::boolean, false) or nseq >= 400 then finish := true; end if;
  end if;

  insert into game_moves (session_id, room_id, seq, player_id, move)
  values (p_session, s.room_id, nseq, uid, mv);

  update game_sessions
  set state = st,
      turn_player = next_turn,
      status = case when finish then 'finished' else status end,
      finished_at = case when finish then now() else finished_at end,
      version = version + 1
  where id = p_session;

  return jsonb_build_object('ok', true, 'seq', nseq, 'move', mv);
exception when invalid_text_representation or numeric_value_out_of_range then
  return _err('bad_move');
end $$;

-- إنهاء اللعبة الحالية والعودة إلى قائمة الألعاب
create or replace function public.end_session(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s game_sessions%rowtype;
begin
  if auth.uid() is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if s.status = 'playing' then
    update game_sessions set status = 'abandoned', finished_at = now(), version = version + 1 where id = p_session;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- الشات
-- ---------------------------------------------------------------------

create or replace function public.send_message(p_room uuid, p_body text, p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  body text := btrim(regexp_replace(coalesce(p_body, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
  nick text;
  r rooms%rowtype;
  m room_messages%rowtype;
begin
  if uid is null then return _err('no_session'); end if;
  if p_client_id is null then return _err('bad_request'); end if;
  select * into r from rooms where id = p_room;
  if not found then return _err('not_member'); end if;
  select nickname into nick from room_players where room_id = p_room and user_id = uid;
  if nick is null then return _err('not_member'); end if;
  if r.status <> 'open' or r.expires_at <= now() then return _err('expired'); end if;
  if char_length(body) = 0 then return _err('empty'); end if;
  if char_length(body) > 500 then return _err('too_long'); end if;

  -- إعادة المحاولة بالمعرّف نفسه لا تكرر الرسالة
  select * into m from room_messages where room_id = p_room and client_id = p_client_id;
  if found then
    return jsonb_build_object('ok', true, 'id', m.id, 'created_at', m.created_at, 'duplicate', true);
  end if;

  if (select count(*) from room_messages
      where room_id = p_room and sender_id = uid and created_at > now() - interval '10 seconds') >= 8 then
    return _err('rate_limited');
  end if;

  insert into room_messages (room_id, sender_id, nickname, body, client_id)
  values (p_room, uid, nick, body, p_client_id)
  returning * into m;
  return jsonb_build_object('ok', true, 'id', m.id, 'created_at', m.created_at);
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.rooms         enable row level security;
alter table public.room_players  enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_answers  enable row level security;
alter table public.game_moves    enable row level security;
alter table public.game_secrets  enable row level security;
alter table public.room_messages enable row level security;
alter table public.rate_events   enable row level security;

drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated using (public.is_room_member(id));

drop policy if exists room_players_select on public.room_players;
create policy room_players_select on public.room_players
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists game_sessions_select on public.game_sessions;
create policy game_sessions_select on public.game_sessions
  for select to authenticated using (public.is_room_member(room_id));

-- إجابتي أراها دائمًا، وإجابة شريكي لا تظهر إلا بعد كشف الجولة
drop policy if exists game_answers_select on public.game_answers;
create policy game_answers_select on public.game_answers
  for select to authenticated using (
    player_id = auth.uid()
    or (
      public.is_room_member(room_id)
      and exists (
        select 1 from public.game_sessions s
        where s.id = game_answers.session_id
          and (s.status <> 'playing'
               or game_answers.round < s.round
               or (game_answers.round = s.round and s.phase = 'revealed'))
      )
    )
  );

drop policy if exists game_moves_select on public.game_moves;
create policy game_moves_select on public.game_moves
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists game_secrets_select on public.game_secrets;
create policy game_secrets_select on public.game_secrets
  for select to authenticated using (owner_id is not null and owner_id = auth.uid());

drop policy if exists room_messages_select on public.room_messages;
create policy room_messages_select on public.room_messages
  for select to authenticated using (public.is_room_member(room_id));

-- لا توجد سياسات insert/update/delete: كل الكتابة تمر عبر الدوال الآمنة أعلاه.

-- ---------------------------------------------------------------------
-- الصلاحيات
-- ---------------------------------------------------------------------

revoke all on public.rooms, public.room_players, public.game_sessions, public.game_answers,
              public.game_moves, public.game_secrets, public.room_messages, public.rate_events
  from anon, authenticated;
grant select on public.rooms, public.room_players, public.game_sessions, public.game_answers,
                public.game_moves, public.game_secrets, public.room_messages
  to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public._err(text), public._rate_count(text, interval), public._rate_hit(text),
                           public._gen_code(), public._clean_nick(text), public.cleanup_expired()
  from authenticated;
grant execute on function
  public.is_room_member(uuid),
  public.can_use_room_topic(text),
  public.server_now(),
  public.create_room(text, text),
  public.join_room(text, text),
  public.leave_room(uuid),
  public.select_game(uuid, text),
  public.start_game(uuid, text, uuid, text, int, int, jsonb),
  public.submit_answer(uuid, int, jsonb),
  public.expire_round(uuid, int),
  public.next_round(uuid, int),
  public.judge_answer(uuid, int, uuid, boolean),
  public.submit_move(uuid, int, jsonb),
  public.end_session(uuid),
  public.send_message(uuid, text, uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: نشر التغييرات + حماية القنوات الخاصة
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['rooms', 'room_players', 'game_sessions', 'game_answers', 'game_moves', 'room_messages'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- قنوات البث والحضور (الكتابة الآن، إشارات المكالمة) خاصة بعضوي الغرفة فقط
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists duo_room_topic_read on realtime.messages';
    execute 'drop policy if exists duo_room_topic_write on realtime.messages';
    execute $p$create policy duo_room_topic_read on realtime.messages
             for select to authenticated using (public.can_use_room_topic(realtime.topic()))$p$;
    execute $p$create policy duo_room_topic_write on realtime.messages
             for insert to authenticated with check (public.can_use_room_topic(realtime.topic()))$p$;
  end if;
end $$;
