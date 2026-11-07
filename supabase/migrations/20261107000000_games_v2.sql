-- =====================================================================
-- DUO — تحديث الألعاب الكبير (النسخة الثانية)
-- شغّل هذا الملف مرة واحدة في SQL Editor (بعد الملفين السابقين)
-- آمن لإعادة التشغيل
-- يضيف: أسرار الألعاب (كلمات الرسم، النرد، الخزنة…)، الرسم المباشر، تقييم الإجابات،
--        وحذف الغرف اللي ما دخلها أحد لمدة ساعة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) أعمدة جديدة
-- ---------------------------------------------------------------------
alter table public.game_secrets add column if not exists revealed boolean not null default false;
alter table public.game_answers add column if not exists rating smallint check (rating is null or rating between 1 and 5);

-- السر الذي انكشف يراه الاثنان، وغير المكشوف لا يراه إلا صاحبه
drop policy if exists game_secrets_select on public.game_secrets;
create policy game_secrets_select on public.game_secrets
  for select to authenticated using (
    (owner_id is not null and owner_id = auth.uid())
    or (revealed and exists (select 1 from public.game_sessions s
                             where s.id = game_secrets.session_id and public.is_room_member(s.room_id)))
  );

-- ---------------------------------------------------------------------
-- 2) جداول جديدة
-- ---------------------------------------------------------------------

-- خطوط الرسم (تُبث مباشرة، وتُحفظ هنا لمن يدخل متأخرًا أو ينقطع اتصاله)
create table if not exists public.game_strokes (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.game_sessions (id) on delete cascade,
  room_id     uuid not null references public.rooms (id) on delete cascade,
  round       int  not null check (round between 1 and 60),
  player_id   uuid not null,
  stroke      jsonb not null check (pg_column_size(stroke) < 8000),
  created_at  timestamptz not null default now()
);
create index if not exists game_strokes_idx on public.game_strokes (session_id, round, id);
create index if not exists game_strokes_room_idx on public.game_strokes (room_id);

alter table public.game_strokes  enable row level security;

-- ميزات "ركننا" انشالت (الغرف تنحذف بعد ساعة بدون نشاط) — نحذفها لو كانت موجودة من نسخة سابقة
drop function if exists public.letter_create(uuid, text, timestamptz), public.letter_list(uuid), public.letter_delete(uuid),
  public.moment_add(uuid, text, text, text, text, date), public.moment_done(uuid, boolean), public.moment_delete(uuid),
  public.daily_answer(uuid, date, text), public.daily_get(uuid, date), public.room_stats(uuid);
drop table if exists public.room_letters, public.room_moments, public.daily_answers;

drop policy if exists game_strokes_select on public.game_strokes;
create policy game_strokes_select on public.game_strokes
  for select to authenticated using (public.is_room_member(room_id));

-- (لا يوجد)

revoke all on public.game_strokes from anon, authenticated;
grant select on public.game_strokes to authenticated;

-- ---------------------------------------------------------------------
-- 3) دوال مساعدة
-- ---------------------------------------------------------------------

-- توحيد الكتابة العربية لمقارنة التخمين: بدون تشكيل، أ/إ/آ = ا، ة = ه، ى = ي، بدون "ال" ومسافات
create or replace function public._norm(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(p, '')), 'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩', 'ااااهيوي0123456789'),
               '[ً-ٰٟـ]', '', 'g'),
             '(^|[^ء-ي])ال', '\1', 'g'),
           '[^0-9a-zء-ي]', '', 'g')
$$;

-- رقم الحركة التالي مع إضافة الحركة (يُستدعى والجلسة مقفلة)
create or replace function public._add_move(p_session uuid, p_room uuid, p_uid uuid, p_move jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare nseq int;
begin
  select coalesce(max(seq), 0) + 1 into nseq from game_moves where session_id = p_session;
  insert into game_moves (session_id, room_id, seq, player_id, move) values (p_session, p_room, nseq, p_uid, p_move);
  update game_sessions set version = version + 1 where id = p_session;
  return nseq;
end $$;

-- ---------------------------------------------------------------------
-- 4) بدء اللعبة: يدعم الآن أسرارًا لكل لاعب (_secrets) لا تُخزن مع محتوى اللعبة العام
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
  secrets jsonb;
  content jsonb;
  e jsonb;
  p_first uuid;
  p_second uuid;
  own uuid;
begin
  if uid is null then return _err('no_session'); end if;
  select * into r from rooms where id = p_room for update;
  if not found or not is_room_member(p_room) then return _err('not_member'); end if;
  if r.status <> 'open' or r.expires_at <= now() then return _err('expired'); end if;
  if r.host_id <> uid then return _err('not_host'); end if;

  select id into sid from game_sessions where room_id = p_room and request_id = p_request;
  if found then return jsonb_build_object('ok', true, 'session_id', sid, 'duplicate', true); end if;

  select array_agg(user_id order by seat) into players from room_players where room_id = p_room;
  if coalesce(array_length(players, 1), 0) < 2 then return _err('need_partner'); end if;

  if p_content is null or jsonb_typeof(p_content) <> 'object' then return _err('bad_request'); end if;
  secrets := p_content -> '_secrets';
  content := p_content - '_secrets';

  if p_game is null or p_game !~ '^[a-z0-9_-]{2,32}$'
     or p_mode not in ('rounds', 'sprint', 'turns')
     or p_rounds is null or p_rounds not between 1 and 60
     or (p_round_seconds is not null and p_round_seconds not between 5 and 600)
     or pg_column_size(content) >= 60000
     or (secrets is not null and (jsonb_typeof(secrets) <> 'array' or jsonb_array_length(secrets) > 80
                                  or pg_column_size(secrets) >= 120000))
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
    npairs := coalesce((content ->> 'pairs')::int, 0);
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
          deadline, first_turn, content, st, uid)
  returning id into sid;

  if board is not null then
    insert into game_secrets (session_id, slot, owner_id, secret) values (sid, 'board', null, to_jsonb(board));
  end if;

  -- الأسرار: "first" = صاحب الدور الأول (أو المقعد 1 في الألعاب غير الدورية)، "second" = الآخر، "none" = لا أحد
  if secrets is not null then
    p_first := coalesce(first_turn, players[1]);
    p_second := case when p_first = players[1] then players[2] else players[1] end;
    for e in select * from jsonb_array_elements(secrets) loop
      if jsonb_typeof(e) <> 'object' or coalesce(e ->> 'slot', '') !~ '^[a-z0-9_]{1,40}$'
         or e -> 'value' is null or pg_column_size(e -> 'value') >= 6000 then
        raise exception using errcode = '22P02';
      end if;
      own := case e ->> 'owner' when 'first' then p_first when 'second' then p_second else null end;
      insert into game_secrets (session_id, slot, owner_id, secret)
      values (sid, e ->> 'slot', own, e -> 'value')
      on conflict (session_id, slot) do nothing;
    end loop;
  end if;

  update rooms set current_game = p_game where id = p_room;
  return jsonb_build_object('ok', true, 'session_id', sid);
exception when invalid_text_representation or numeric_value_out_of_range then
  return _err('bad_request');
end $$;

-- ---------------------------------------------------------------------
-- 5) الحركات: ألعاب "حرة" (content.free) يقدر أي لاعب يتحرك فيها (زر "ضحكت"، "مسكتك"…)
-- ---------------------------------------------------------------------
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
  free boolean;
  board jsonb;
  card int; v int; pend int; fv int; npairs int; is_match boolean;
  secret_num int; guess int; att int; hint text; rnd int;
begin
  if uid is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if s.status <> 'playing' then return _err('session_closed'); end if;
  if s.mode <> 'turns' then return _err('bad_request'); end if;
  free := coalesce((s.content ->> 'free')::boolean, false) and s.game_id not in ('memory', 'number');
  if not free and s.turn_player is not null and s.turn_player <> uid then return _err('not_your_turn'); end if;
  if p_move is null or jsonb_typeof(p_move) <> 'object' or pg_column_size(p_move) >= 2000 then
    return _err('bad_request');
  end if;

  select coalesce(max(seq), 0) + 1 into nseq from game_moves where session_id = p_session;
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
    -- الألعاب الدورية العامة: منطقها في الواجهة، والخادم يضمن الترتيب وعدم التكرار
    if p_move ->> 'kind' is null then return _err('bad_request'); end if;
    mv := p_move - 'pass_turn' - 'finish';
    if coalesce((p_move ->> 'pass_turn')::boolean, false) then
      next_turn := case when s.turn_player = uid then other else uid end;
    end if;
    if coalesce((p_move ->> 'finish')::boolean, false) or nseq >= 900 then finish := true; end if;
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

-- ---------------------------------------------------------------------
-- 6) الأسرار: قراءة أسراري + تخمين + كشف + اختيار + تعيين + رمي النرد
-- ---------------------------------------------------------------------
create or replace function public.get_secrets(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  out jsonb;
begin
  if uid is null then return _err('no_session'); end if;
  select room_id into rid from game_sessions where id = p_session;
  if rid is null or not is_room_member(rid) then return _err('not_member'); end if;
  select coalesce(jsonb_object_agg(slot, jsonb_build_object('v', secret, 'mine', owner_id = uid, 'revealed', revealed)), '{}'::jsonb)
    into out
  from game_secrets
  where session_id = p_session and slot <> 'board' and ((owner_id is not null and owner_id = uid) or revealed);
  return jsonb_build_object('ok', true, 'secrets', out);
end $$;

create or replace function public.secret_action(p_session uuid, p_action text, p_slot text, p_value jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s game_sessions%rowtype;
  g game_secrets%rowtype;
  cand text[];
  txt text;
  correct boolean;
  idx int;
  n int;
  dice jsonb;
  vals jsonb;
  nseq int;
  tries int;
begin
  if uid is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if s.status <> 'playing' then return _err('session_closed'); end if;
  if p_slot is null or p_slot !~ '^[a-z0-9_]{1,40}$' or p_slot = 'board' then return _err('bad_request'); end if;
  if (select count(*) from game_moves where session_id = p_session) >= 900 then return _err('rate_limited'); end if;

  if p_action = 'reveal_prefix' then
    select coalesce(jsonb_object_agg(slot, secret), '{}'::jsonb) into vals
    from game_secrets where session_id = p_session and slot like p_slot || '%' and not revealed;
    if vals = '{}'::jsonb then return jsonb_build_object('ok', true, 'duplicate', true); end if;
    update game_secrets set revealed = true where session_id = p_session and slot like p_slot || '%';
    nseq := _add_move(p_session, s.room_id, uid, jsonb_build_object('kind', 'reveal_all', 'prefix', p_slot, 'values', vals));
    return jsonb_build_object('ok', true, 'seq', nseq, 'values', vals);
  end if;

  select * into g from game_secrets where session_id = p_session and slot = p_slot for update;

  if p_action = 'set' then
    if p_value is null or pg_column_size(p_value) >= 2000 then return _err('bad_request'); end if;
    if found then
      if g.owner_id is distinct from uid or g.revealed then return _err('bad_move'); end if;
      update game_secrets set secret = p_value where session_id = p_session and slot = p_slot;
    else
      insert into game_secrets (session_id, slot, owner_id, secret) values (p_session, p_slot, uid, p_value);
    end if;
    nseq := _add_move(p_session, s.room_id, uid, jsonb_build_object('kind', 'secret_set', 'slot', p_slot));
    return jsonb_build_object('ok', true, 'seq', nseq);
  end if;

  if p_action = 'roll' then
    if found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
    n := coalesce((p_value #>> '{}')::int, 0);
    if n not between 1 and 6 then return _err('bad_request'); end if;
    select jsonb_agg(1 + floor(random() * 6)::int) into dice from generate_series(1, n);
    insert into game_secrets (session_id, slot, owner_id, secret) values (p_session, p_slot, uid, dice);
    nseq := _add_move(p_session, s.room_id, uid, jsonb_build_object('kind', 'rolled', 'slot', p_slot, 'n', n));
    return jsonb_build_object('ok', true, 'seq', nseq);
  end if;

  if not found then return _err('bad_move'); end if;

  if p_action = 'choose' then
    if g.owner_id is distinct from uid then return _err('bad_move'); end if;
    if jsonb_typeof(g.secret) <> 'array' then return jsonb_build_object('ok', true, 'duplicate', true); end if;
    idx := (p_value #>> '{}')::int;
    if idx is null or idx < 0 or idx >= jsonb_array_length(g.secret) then return _err('bad_move'); end if;
    update game_secrets set secret = g.secret -> idx where session_id = p_session and slot = p_slot;
    txt := coalesce(g.secret -> idx ->> 'w', g.secret ->> idx);
    nseq := _add_move(p_session, s.room_id, uid, jsonb_build_object(
      'kind', 'chosen', 'slot', p_slot, 'd', idx,
      'len', char_length(replace(coalesce(txt, ''), ' ', '')),
      'words', array_length(regexp_split_to_array(btrim(coalesce(txt, '')), '\s+'), 1)));
    return jsonb_build_object('ok', true, 'seq', nseq);
  end if;

  if p_action = 'reveal' then
    if g.revealed then return jsonb_build_object('ok', true, 'duplicate', true); end if;
    update game_secrets set revealed = true where session_id = p_session and slot = p_slot;
    nseq := _add_move(p_session, s.room_id, uid, jsonb_build_object('kind', 'reveal', 'slot', p_slot, 'value', g.secret));
    return jsonb_build_object('ok', true, 'seq', nseq, 'value', g.secret);
  end if;

  if p_action = 'guess' then
    if g.owner_id = uid then return _err('bad_move'); end if;
    if g.revealed then return _err('round_closed'); end if;
    txt := left(btrim(coalesce(p_value #>> '{}', '')), 60);
    if char_length(txt) = 0 then return _err('empty'); end if;
    select count(*) into tries from game_moves
    where session_id = p_session and player_id = uid and move ->> 'kind' = 'guess' and move ->> 'slot' = p_slot;
    if tries >= 60 then return _err('rate_limited'); end if;
    cand := case jsonb_typeof(g.secret)
              when 'string' then array[g.secret #>> '{}']
              when 'number' then array[g.secret #>> '{}']
              when 'object' then array[g.secret ->> 'w']
                                 || coalesce(array(select jsonb_array_elements_text(g.secret -> 'alt')), '{}')
              else null end;
    if cand is null then return _err('not_ready'); end if;
    correct := exists (select 1 from unnest(cand) c where _norm(c) <> '' and _norm(c) = _norm(txt));
    if correct then
      update game_secrets set revealed = true where session_id = p_session and slot = p_slot;
      nseq := _add_move(p_session, s.room_id, uid, jsonb_build_object('kind', 'guess', 'slot', p_slot, 'text', txt, 'correct', true, 'value', g.secret));
    else
      nseq := _add_move(p_session, s.room_id, uid, jsonb_build_object('kind', 'guess', 'slot', p_slot, 'text', txt, 'correct', false));
    end if;
    return jsonb_build_object('ok', true, 'seq', nseq, 'correct', correct);
  end if;

  return _err('bad_request');
exception when invalid_text_representation or numeric_value_out_of_range then
  return _err('bad_move');
end $$;

-- ---------------------------------------------------------------------
-- 7) الرسم
-- ---------------------------------------------------------------------
create or replace function public.add_stroke(p_session uuid, p_round int, p_stroke jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s game_sessions%rowtype;
  sid bigint;
begin
  if uid is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if s.status <> 'playing' then return _err('session_closed'); end if;
  if p_round is null or p_round not between 1 and 60 then return _err('bad_request'); end if;
  if p_stroke is null or jsonb_typeof(p_stroke) <> 'object' or pg_column_size(p_stroke) >= 7800 then return _err('too_long'); end if;
  if (select count(*) from game_strokes where session_id = p_session) >= 5000 then return _err('rate_limited'); end if;
  insert into game_strokes (session_id, room_id, round, player_id, stroke)
  values (p_session, s.room_id, p_round, uid, p_stroke)
  returning id into sid;
  return jsonb_build_object('ok', true, 'id', sid);
end $$;

-- ---------------------------------------------------------------------
-- 8) تقييم إجابة الشريك من 1 إلى 5 (أغبى إجابة، المدح…)
-- ---------------------------------------------------------------------
create or replace function public.rate_answer(p_session uuid, p_round int, p_target uuid, p_score int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s game_sessions%rowtype;
begin
  if uid is null then return _err('no_session'); end if;
  select * into s from game_sessions where id = p_session for update;
  if not found or not is_room_member(s.room_id) then return _err('not_member'); end if;
  if p_target = uid or p_score is null or p_score not between 1 and 5 then return _err('bad_request'); end if;
  if not (s.status <> 'playing' or p_round < s.round or (p_round = s.round and s.phase = 'revealed')) then
    return _err('not_ready');
  end if;
  update game_answers set rating = p_score
  where session_id = p_session and round = p_round and player_id = p_target and rating is null;
  if found then update game_sessions set version = version + 1 where id = p_session; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 13) الصلاحيات
-- ---------------------------------------------------------------------
revoke execute on function public._norm(text), public._add_move(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function
  public.get_secrets(uuid), public.secret_action(uuid, text, text, jsonb), public.add_stroke(uuid, int, jsonb),
  public.rate_answer(uuid, int, uuid, int)
from public, anon;
grant execute on function
  public.get_secrets(uuid), public.secret_action(uuid, text, text, jsonb), public.add_stroke(uuid, int, jsonb),
  public.rate_answer(uuid, int, uuid, int),
  public.start_game(uuid, text, uuid, text, int, int, jsonb), public.submit_move(uuid, int, jsonb)
to authenticated;

-- =====================================================================
-- 14) الغرفة اللي ما دخلها أحد لمدة ساعة تنحذف تلقائيًا (مع كل محتواها)
--     التطبيق يرسل "أنا موجود" كل 10 دقائق وهو مفتوح داخل الغرفة.
--     التنظيف يصير تلقائيًا كل ما أحد أنشأ غرفة أو دخل غرفة،
--     ولو تبي يصير كل ربع ساعة بالضبط شغّل ملف supabase/optional/cleanup_cron.sql
-- =====================================================================
alter table public.rooms add column if not exists last_active_at timestamptz not null default now();
create index if not exists rooms_last_active_idx on public.rooms (last_active_at);

create or replace function public.cleanup_expired()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with d as (
    delete from rooms
    where id in (
      select id from rooms
      where status = 'closed' or expires_at < now() or last_active_at < now() - interval '1 hour'
      limit 300
    )
    returning 1
  )
  select count(*) into n from d;
  delete from rate_events where at < now() - interval '1 day';
  return n;
end $$;

-- "أنا موجود في الغرفة": يمدد عمر الغرفة ساعة من الآن
create or replace function public.touch_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return _err('no_session'); end if;
  if not is_room_member(p_room) then return _err('not_member'); end if;
  update rooms set last_active_at = now()
  where id = p_room and last_active_at < now() - interval '1 minute';
  -- تنظيف خفيف للغرف المهجورة (مرة كل فترة تقريبًا)
  if random() < 0.2 then perform cleanup_expired(); end if;
  return jsonb_build_object('ok', true);
end $$;

-- الدخول للغرفة يحسب نشاط، ويشغّل التنظيف قبله (عشان ما يدخل أحد غرفة مهجورة انتهت)
create or replace function public._touch_on_join()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update rooms set last_active_at = now() where id = new.room_id;
  return new;
end $$;
drop trigger if exists room_players_touch on public.room_players;
create trigger room_players_touch after insert on public.room_players
  for each row execute function public._touch_on_join();

-- أي حركة في الغرفة (لعب، رسالة) تحسب نشاط
create or replace function public._touch_on_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update rooms set last_active_at = now()
  where id = new.room_id and last_active_at < now() - interval '1 minute';
  return new;
end $$;
drop trigger if exists room_messages_touch on public.room_messages;
create trigger room_messages_touch after insert on public.room_messages
  for each row execute function public._touch_on_activity();
drop trigger if exists game_sessions_touch on public.game_sessions;
create trigger game_sessions_touch after insert or update on public.game_sessions
  for each row execute function public._touch_on_activity();

-- الغرف الموجودة الآن: نعطيها ساعة كاملة من وقت التحديث
update public.rooms set last_active_at = now();

revoke execute on function public.touch_room(uuid) from public, anon;
grant execute on function public.touch_room(uuid) to authenticated;
revoke execute on function public._touch_on_join(), public._touch_on_activity(), public.cleanup_expired() from public, anon, authenticated;
