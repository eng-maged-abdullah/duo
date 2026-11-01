import { ar } from './ar'

/**
 * نظام نصوص بسيط: العربية الآن، ويمكن إضافة ملف en.ts بالمفاتيح نفسها لاحقًا
 * ثم تغيير اللغة من الإعدادات.
 */
export type Dict = typeof ar
export type Lang = 'ar'

const dicts: Record<Lang, Dict> = { ar }
let current: Lang = 'ar'

export function setLang(l: Lang) {
  current = l
  document.documentElement.lang = l
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'
}

export function t(key: keyof Dict, vars?: Record<string, string | number>): string {
  let s: string = dicts[current][key] ?? dicts.ar[key] ?? String(key)
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

const errorKeys: Record<string, keyof Dict> = {
  no_session: 'err_no_session',
  anon_disabled: 'err_anon_disabled',
  config: 'err_config',
  secret_key: 'err_secret_key',
  bad_nickname: 'err_bad_nickname',
  rate_limited: 'err_rate_limited',
  not_found: 'err_not_found',
  expired: 'err_expired',
  full: 'err_full',
  not_member: 'err_not_member',
  not_host: 'err_not_host',
  need_partner: 'err_need_partner',
  round_closed: 'err_round_closed',
  too_late: 'err_too_late',
  session_closed: 'err_session_closed',
  not_your_turn: 'err_not_your_turn',
  stale: 'err_stale',
  bad_move: 'err_bad_move',
  too_long: 'err_too_long',
  empty: 'err_empty',
  not_ready: 'err_not_ready',
  bad_request: 'err_bad_request',
  try_again: 'err_try_again',
  network: 'err_network',
}

export function errorText(code: string | undefined): string {
  const k = code ? errorKeys[code] : undefined
  return k ? t(k) : t('err_unknown')
}
