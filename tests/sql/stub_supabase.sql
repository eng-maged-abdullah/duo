-- محاكاة صغيرة لبيئة Supabase داخل Postgres محلي (للاختبار فقط)
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema extensions;
grant usage on schema extensions to anon, authenticated;
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text, payload jsonb);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to authenticated;
grant usage on schema realtime to authenticated;
grant usage, select on sequence realtime.messages_id_seq to authenticated;
create function realtime.topic() returns text language sql stable as $$
  select current_setting('realtime.topic', true)
$$;
grant execute on function realtime.topic() to authenticated;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated;
