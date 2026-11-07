-- =====================================================================
-- DUO — تحديث الألعاب الكبير (النسخة الثانية)
-- شغّل هذا الملف مرة واحدة في SQL Editor (بعد الملفين السابقين)
-- آمن لإعادة التشغيل
-- يضيف: أسرار الألعاب (كلمات الرسم، أوراق النرد، الخزنة…)، الرسم المباشر،
--        تقييم الإجابات، الرسائل المقفلة، قصتنا وقائمة أحلامنا والأرشيف،
--        سؤال اليوم وسلسلة الأيام، وإحصائيات الغرفة.
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

-- رسائل مقفلة حتى تاريخ معيّن (لا يقرأ نصها إلا كاتبها قبل موعد فتحها)
create table if not exists public.room_letters (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  author_id   uuid not null,
  body        text not null check (char_length(body) between 1 and 2000),
  unlock_at   timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists room_letters_room_idx on public.room_letters (room_id, unlock_at);

-- قصتنا (خط زمني)، قائمة أحلامنا، وأرشيف اللحظات
create table if not exists public.room_moments (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  author_id   uuid not null,
  kind        text not null check (kind in ('timeline', 'bucket', 'saved')),
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 1500),
  emoji       text not null default '' check (char_length(emoji) <= 8),
  happened_on date,
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists room_moments_room_idx on public.room_moments (room_id, kind, created_at desc);

-- سؤال اليوم: إجابة شريكك تظهر لك فقط بعد ما تجاوب
create table if not exists public.daily_answers (
  room_id     uuid not null references public.rooms (id) on delete cascade,
  day         date not null,
  user_id     uuid not null,
  answer      text not null check (char_length(answer) between 1 and 500),
  created_at  timestamptz not null default now(),
  primary key (room_id, day, user_id)
);

alter table public.game_strokes  enable row level security;
alter table public.room_letters  enable row level security;
alter table public.room_moments  enable row level security;
alter table public.daily_answers enable row level security;

drop policy if exists game_strokes_select on public.game_strokes;
create policy game_strokes_select on public.game_strokes
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists room_moments_select on public.room_moments;
create policy room_moments_select on public.room_moments
  for select to authenticated using (public.is_room_member(room_id));
-- room_letters و daily_answers: بدون سياسات قراءة مباشرة إطلاقًا (القراءة عبر الدوال فقط)

revoke all on public.game_strokes, public.room_letters, public.room_moments, public.daily_answers from anon, authenticated;
grant select on public.game_strokes, public.room_moments to authenticated;

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
-- 9) الرسائل المقفلة
-- ---------------------------------------------------------------------
create or replace function public.letter_create(p_room uuid, p_body text, p_unlock_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b text := btrim(coalesce(p_body, ''));
  lid uuid;
begin
  if uid is null then return _err('no_session'); end if;
  if not is_room_member(p_room) then return _err('not_member'); end if;
  if char_length(b) = 0 then return _err('empty'); end if;
  if char_length(b) > 2000 then return _err('too_long'); end if;
  if p_unlock_at is null or p_unlock_at > now() + interval '10 years' then return _err('bad_request'); end if;
  if (select count(*) from room_letters where room_id = p_room and author_id = uid and created_at > now() - interval '1 day') >= 20 then
    return _err('rate_limited');
  end if;
  insert into room_letters (room_id, author_id, body, unlock_at)
  values (p_room, uid, b, greatest(p_unlock_at, now())) returning id into lid;
  return jsonb_build_object('ok', true, 'id', lid);
end $$;

create or replace function public.letter_list(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return _err('no_session'); end if;
  if not is_room_member(p_room) then return _err('not_member'); end if;
  return jsonb_build_object('ok', true, 'now', now(), 'letters', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', id, 'author_id', author_id, 'unlock_at', unlock_at, 'created_at', created_at,
             'open', unlock_at <= now(),
             'body', case when author_id = uid or unlock_at <= now() then body else null end)
           order by unlock_at desc)
    from room_letters where room_id = p_room), '[]'::jsonb));
end $$;

create or replace function public.letter_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return _err('no_session'); end if;
  delete from room_letters where id = p_id and author_id = uid;
  if not found then return _err('not_allowed'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 10) قصتنا / قائمة أحلامنا / أرشيفنا
-- ---------------------------------------------------------------------
create or replace function public.moment_add(p_room uuid, p_kind text, p_title text, p_body text default '',
                                             p_emoji text default '', p_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t text := btrim(coalesce(p_title, ''));
  mid uuid;
begin
  if uid is null then return _err('no_session'); end if;
  if not is_room_member(p_room) then return _err('not_member'); end if;
  if p_kind not in ('timeline', 'bucket', 'saved') then return _err('bad_request'); end if;
  if char_length(t) = 0 then return _err('empty'); end if;
  if char_length(t) > 120 or char_length(coalesce(p_body, '')) > 1500 or char_length(coalesce(p_emoji, '')) > 8 then
    return _err('too_long');
  end if;
  if (select count(*) from room_moments where room_id = p_room) >= 2000 then return _err('rate_limited'); end if;
  if (select count(*) from room_moments where room_id = p_room and author_id = uid and created_at > now() - interval '1 minute') >= 15 then
    return _err('rate_limited');
  end if;
  insert into room_moments (room_id, author_id, kind, title, body, emoji, happened_on)
  values (p_room, uid, p_kind, t, btrim(coalesce(p_body, '')), coalesce(p_emoji, ''), p_date)
  returning id into mid;
  return jsonb_build_object('ok', true, 'id', mid);
end $$;

create or replace function public.moment_done(p_id uuid, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid;
begin
  if uid is null then return _err('no_session'); end if;
  select room_id into rid from room_moments where id = p_id;
  if rid is null or not is_room_member(rid) then return _err('not_member'); end if;
  update room_moments set done = coalesce(p_done, false), done_at = case when p_done then now() else null end where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.moment_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid uuid;
begin
  if uid is null then return _err('no_session'); end if;
  select room_id into rid from room_moments where id = p_id;
  if rid is null or not is_room_member(rid) then return _err('not_member'); end if;
  -- قائمة الأحلام مشتركة (يحذف أي واحد)، والذكريات يحذفها كاتبها فقط
  delete from room_moments where id = p_id and (kind = 'bucket' or author_id = uid);
  if not found then return _err('not_allowed'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 11) سؤال اليوم + سلسلة الأيام
-- ---------------------------------------------------------------------
create or replace function public.daily_answer(p_room uuid, p_day date, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b text := btrim(coalesce(p_text, ''));
begin
  if uid is null then return _err('no_session'); end if;
  if not is_room_member(p_room) then return _err('not_member'); end if;
  if p_day is null or p_day not between current_date - 1 and current_date + 1 then return _err('bad_request'); end if;
  if char_length(b) = 0 then return _err('empty'); end if;
  if char_length(b) > 500 then return _err('too_long'); end if;
  insert into daily_answers (room_id, day, user_id, answer) values (p_room, p_day, uid, b)
  on conflict (room_id, day, user_id) do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.daily_get(p_room uuid, p_day date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mine text;
  theirs text;
  their_done boolean;
  streak int := 0;
  d date;
  hist jsonb;
begin
  if uid is null then return _err('no_session'); end if;
  if not is_room_member(p_room) then return _err('not_member'); end if;
  if p_day is null then return _err('bad_request'); end if;
  select answer into mine from daily_answers where room_id = p_room and day = p_day and user_id = uid;
  select answer into theirs from daily_answers where room_id = p_room and day = p_day and user_id <> uid limit 1;
  their_done := theirs is not null;
  if mine is null then theirs := null; end if;

  -- عدد الأيام المتتالية اللي جاوبتوا فيها الاثنين (اليوم لا يكسر السلسلة إذا ما خلص بعد)
  d := p_day;
  if (select count(*) from daily_answers where room_id = p_room and day = d) < 2 then d := d - 1; end if;
  while (select count(*) from daily_answers where room_id = p_room and day = d) >= 2 and streak < 3660 loop
    streak := streak + 1;
    d := d - 1;
  end loop;

  -- الأيام السابقة: لا تظهر إجابة الشريك إلا إذا جاوبت أنت ذاك اليوم
  select coalesce(jsonb_agg(x order by x ->> 'day' desc), '[]'::jsonb) into hist from (
    select jsonb_build_object('day', a.day, 'mine', a.answer, 'theirs', b.answer) as x
    from daily_answers a
    join daily_answers b on b.room_id = a.room_id and b.day = a.day and b.user_id <> a.user_id
    where a.room_id = p_room and a.user_id = uid and a.day < p_day
    order by a.day desc limit 30
  ) h;

  return jsonb_build_object('ok', true, 'mine', mine, 'theirs', theirs, 'their_done', their_done,
                            'streak', streak, 'history', hist);
end $$;

-- ---------------------------------------------------------------------
-- 12) إحصائيات الغرفة
-- ---------------------------------------------------------------------
create or replace function public.room_stats(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return _err('no_session'); end if;
  if not is_room_member(p_room) then return _err('not_member'); end if;
  return jsonb_build_object('ok', true,
    'games', (select count(*) from game_sessions where room_id = p_room and status = 'finished'),
    'days', (select count(distinct (created_at at time zone 'Asia/Riyadh')::date) from game_sessions where room_id = p_room),
    'since', (select created_at from rooms where id = p_room),
    'letters', (select count(*) from room_letters where room_id = p_room),
    'moments', (select count(*) from room_moments where room_id = p_room and kind = 'timeline'),
    'dreams_done', (select count(*) from room_moments where room_id = p_room and kind = 'bucket' and done),
    'dreams', (select count(*) from room_moments where room_id = p_room and kind = 'bucket'),
    'daily', (select count(distinct day) from daily_answers where room_id = p_room)
  );
end $$;

-- ---------------------------------------------------------------------
-- 13) الصلاحيات
-- ---------------------------------------------------------------------
revoke execute on function public._norm(text), public._add_move(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function
  public.get_secrets(uuid), public.secret_action(uuid, text, text, jsonb), public.add_stroke(uuid, int, jsonb),
  public.rate_answer(uuid, int, uuid, int), public.letter_create(uuid, text, timestamptz), public.letter_list(uuid),
  public.letter_delete(uuid), public.moment_add(uuid, text, text, text, text, date), public.moment_done(uuid, boolean),
  public.moment_delete(uuid), public.daily_answer(uuid, date, text), public.daily_get(uuid, date), public.room_stats(uuid)
from public, anon;
grant execute on function
  public.get_secrets(uuid), public.secret_action(uuid, text, text, jsonb), public.add_stroke(uuid, int, jsonb),
  public.rate_answer(uuid, int, uuid, int), public.letter_create(uuid, text, timestamptz), public.letter_list(uuid),
  public.letter_delete(uuid), public.moment_add(uuid, text, text, text, text, date), public.moment_done(uuid, boolean),
  public.moment_delete(uuid), public.daily_answer(uuid, date, text), public.daily_get(uuid, date), public.room_stats(uuid),
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
