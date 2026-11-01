-- اختياري: تنظيف تلقائي كل ساعة باستخدام pg_cron (متاح مجانًا في Supabase).
-- التنظيف يحدث أيضًا تلقائيًا عند إنشاء أي غرفة جديدة، فهذا الملف ليس ضروريًا.
-- لتفعيله: Database → Extensions → فعّل pg_cron، ثم شغّل هذا الملف في SQL Editor.

create extension if not exists pg_cron;

select cron.schedule(
  'duo-cleanup-expired-rooms',
  '17 * * * *',
  $$ select public.cleanup_expired(); $$
);
