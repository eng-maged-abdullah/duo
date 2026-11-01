import { supabase } from './client'

let pending: Promise<string> | null = null
/** آخر سبب لفشل تسجيل الدخول (لعرضه للمستخدم عند التشخيص) */
export let lastAuthError = ''

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
    let signed, error
    try {
      ;({ data: signed, error } = await sb.auth.signInAnonymously())
    } catch (e) {
      lastAuthError = (e as Error)?.message ?? ''
      throw new Error('bad_url')
    }
    if (error || !signed?.user) {
      const msg = error?.message ?? ''
      lastAuthError = `${error?.status ?? ''} ${msg}`.trim()
      if (/anonymous/i.test(msg) && /disabled/i.test(msg)) throw new Error('anon_disabled')
      if (/api key|apikey|jwt|unauthorized/i.test(msg) || error?.status === 401) throw new Error('bad_key')
      if (/captcha/i.test(msg)) throw new Error('captcha_on')
      if (/fetch|network|load failed/i.test(msg) || !error?.status) throw new Error('bad_url')
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
