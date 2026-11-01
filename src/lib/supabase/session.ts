import { supabase } from './client'

let pending: Promise<string> | null = null

/**
 * يضمن وجود هوية لاعب مجهولة (Anonymous Auth) دون بريد أو رقم هاتف.
 * الهوية تُحفظ في المتصفح، فتحديث الصفحة يعيد اللاعب إلى غرفته نفسها.
 */
export function ensureSession(): Promise<string> {
  if (pending) return pending
  pending = (async () => {
    const sb = supabase()
    const { data } = await sb.auth.getSession()
    if (data.session?.user) {
      // تأكد أن الجلسة ما زالت صالحة على الخادم
      const { data: u, error } = await sb.auth.getUser()
      if (!error && u.user) return u.user.id
    }
    const { data: signed, error } = await sb.auth.signInAnonymously()
    if (error || !signed.user) {
      const msg = error?.message ?? ''
      if (/anonymous/i.test(msg) && /disabled/i.test(msg)) throw new Error('anon_disabled')
      throw new Error('no_session')
    }
    return signed.user.id
  })()
  pending.catch(() => {
    pending = null
  })
  return pending
}

export function resetSessionCache() {
  pending = null
}
