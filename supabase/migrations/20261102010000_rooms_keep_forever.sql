-- =====================================================================
-- DUO — تحديث: الغرف لا تُحذف تلقائيًا، ومنشئ الغرفة يحذفها متى شاء
-- شغّل هذا الملف مرة واحدة في SQL Editor (بعد الملف الأول)
-- =====================================================================

-- 1) لا انتهاء تلقائي للغرف (تاريخ بعيد جدًا بدل 24 ساعة)
alter table public.rooms alter column expires_at set default '9999-12-31 00:00:00+00';
update public.rooms set expires_at = '9999-12-31 00:00:00+00' where status = 'open';

-- 2) التنظيف التلقائي يحذف فقط الغرف المغلقة، ويُبقي سجل المعدلات صغيرًا
create or replace function public.cleanup_expired()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with d as (
    delete from rooms
    where id in (select id from rooms where status = 'closed' or expires_at < now() limit 200)
    returning 1
  )
  select count(*) into n from d;
  delete from rate_events where at < now() - interval '1 day';
  return n;
end $$;

-- 3) حذف الغرفة نهائيًا (منشئ الغرفة فقط): تُحذف معها الرسائل والإجابات والجلسات
create or replace function public.delete_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return _err('no_session'); end if;
  if not exists (select 1 from rooms where id = p_room) then return jsonb_build_object('ok', true); end if;
  if not exists (select 1 from rooms where id = p_room and host_id = uid) then return _err('not_host'); end if;
  delete from rooms where id = p_room;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.delete_room(uuid) from public, anon;
grant execute on function public.delete_room(uuid) to authenticated;

-- 4) إذا غادر كل اللاعبين تبقى الغرفة محفوظة (لا تُحذف إلا يدويًا)
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
  if remaining is not null then
    update rooms set host_id = remaining where id = p_room and host_id = uid;
  end if;
  return jsonb_build_object('ok', true);
end $$;
