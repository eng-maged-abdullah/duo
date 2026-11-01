/** ذاكرة محلية صغيرة: آخر اسم مستعار وآخر غرفة (للاستعادة فقط، وليست مصدر الحقيقة) */
const NICK = 'duo:nickname'
const LAST = 'duo:lastRoom'

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* وضع التصفح الخاص */
  }
}

export const local = {
  nickname: () => safeGet(NICK) ?? '',
  setNickname: (n: string) => safeSet(NICK, n.trim().slice(0, 20)),
  lastRoom: (): { code: string; at: number } | null => {
    try {
      const v = JSON.parse(safeGet(LAST) ?? 'null')
      if (v && typeof v.code === 'string' && Date.now() - v.at < 24 * 3600 * 1000) return v
    } catch {
      /* تجاهل */
    }
    return null
  },
  setLastRoom: (code: string | null) => safeSet(LAST, code ? JSON.stringify({ code, at: Date.now() }) : null),
  get: safeGet,
  set: safeSet,
}
