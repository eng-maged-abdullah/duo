import { supabase } from '../supabase/client'

const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
]

let cache: { at: number; servers: RTCIceServer[] } | null = null

/**
 * خوادم ICE:
 * - STUN مجاني دائمًا (يكفي لمعظم الشبكات المنزلية).
 * - TURN اختياري: إما من Edge Function (موصى به؛ الأسرار لا تظهر في الكود)
 *   أو من متغيرات بيئة ثابتة.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cache && Date.now() - cache.at < 3 * 3600 * 1000) return cache.servers
  const servers = [...STUN]

  if (import.meta.env.VITE_TURN_FUNCTION === 'true') {
    try {
      const { data, error } = await supabase().functions.invoke('turn-credentials', { body: {} })
      if (!error && Array.isArray(data?.iceServers)) servers.push(...(data.iceServers as RTCIceServer[]))
    } catch {
      /* نكمل بـ STUN */
    }
  } else if (import.meta.env.VITE_TURN_URLS) {
    servers.push({
      urls: String(import.meta.env.VITE_TURN_URLS)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    })
  }

  cache = { at: Date.now(), servers }
  return servers
}

export const hasTurn = () => import.meta.env.VITE_TURN_FUNCTION === 'true' || Boolean(import.meta.env.VITE_TURN_URLS)
