import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// يقبل الرابط حتى لو نُسخ معه /rest/v1/ أو شرطة زائدة
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '')
const key = (
  (import.meta.env.VITE_SUPABASE_PUBLIC_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
)?.trim()

export const isConfigured = Boolean(url && key && /^https?:\/\//.test(url))

/** يمنع وضع مفتاح الخدمة السري في الواجهة بالخطأ */
function looksSecret(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true
  try {
    const payload = JSON.parse(atob(k.split('.')[1] ?? ''))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

export const secretKeyMisuse = Boolean(key && looksSecret(key))

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!isConfigured) throw new Error('config')
  if (secretKeyMisuse) throw new Error('secret_key')
  if (!client) {
    client = createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'duo-auth',
      },
      realtime: {
        params: { eventsPerSecond: 20 },
      },
    })
  }
  return client
}
