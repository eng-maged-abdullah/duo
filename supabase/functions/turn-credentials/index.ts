// Supabase Edge Function: turn-credentials
// تُصدر بيانات اعتماد TURN مؤقتة من Cloudflare Realtime دون كشف المفتاح السري في الموقع.
// الأسرار المطلوبة (Supabase → Edge Functions → Secrets):
//   CF_TURN_KEY_ID      معرّف مفتاح TURN من لوحة Cloudflare
//   CF_TURN_API_TOKEN   رمز API الخاص بهذا المفتاح
// إذا لم تُضف الأسرار، تعيد الدالة قائمة فارغة ويكمل التطبيق باستخدام STUN فقط.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // يجب أن يكون الطالب لاعبًا مسجّلًا (هوية مجهولة صالحة)
  const auth = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data, error } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (error || !data.user) return json({ error: 'unauthorized' }, 401)

  const keyId = Deno.env.get('CF_TURN_KEY_ID')
  const token = Deno.env.get('CF_TURN_API_TOKEN')
  if (!keyId || !token) return json({ iceServers: [] })

  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 4 * 3600 }),
  })
  if (!res.ok) return json({ iceServers: [] })
  const body = (await res.json()) as { iceServers?: { urls: string[] | string; username?: string; credential?: string }[] }

  // استبعاد المنفذ 53 (قد يتأخر في المتصفحات)
  const iceServers = (body.iceServers ?? [])
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !u.includes(':53')) }))
    .filter((s) => s.urls.length)
  return json({ iceServers })
})
