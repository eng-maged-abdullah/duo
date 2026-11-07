-- اختياري: تنظيف الغرف المهجورة (ما دخلها أحد ساعة) كل ربع ساعة باستخدام pg_cron (مجاني في Supabase).
-- بدون هذا الملف التنظيف يصير برضو، بس عند إنشاء غرفة أو دخول غرفة.
-- لتفعيله: Database → Extensions → فعّل pg_cron، ثم شغّل هذا الملف في SQL Editor.

create extension if not exists pg_cron;

select cron.unschedule('duo-cleanup-expired-rooms') where exists (select 1 from cron.job where jobname = 'duo-cleanup-expired-rooms');
select cron.schedule(
  'duo-cleanup-expired-rooms',
  '*/15 * * * *',
  $$ select public.cleanup_expired(); $$
);
