/** معرفة هل التطبيق مثبّت (مفتوح من أيقونة الشاشة الرئيسية) أو مفتوح كرابط في المتصفح */

export type Platform = 'ios' | 'android' | 'desktop'

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent)

export function platform(): Platform {
  const u = ua()
  if (/iPhone|iPad|iPod/i.test(u)) return 'ios'
  // آيباد الحديث يعرّف نفسه كأنه ماك
  if (/Macintosh/i.test(u) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(u)) return 'android'
  return 'desktop'
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return true
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false
  return mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || mq('(display-mode: minimal-ui)') || (navigator as { standalone?: boolean }).standalone === true
}

/** متصفحات داخل تطبيقات (واتساب، سناب، انستقرام…) ما تقدر تثبّت */
export function inAppBrowser(): string | null {
  const u = ua()
  if (/Instagram/i.test(u)) return 'انستقرام'
  if (/Snapchat/i.test(u)) return 'سناب شات'
  if (/FBAN|FBAV|FB_IAB/i.test(u)) return 'فيسبوك'
  if (/TikTok|musical_ly|BytedanceWebview/i.test(u)) return 'تيك توك'
  if (/Twitter/i.test(u)) return 'إكس'
  if (/Line\//i.test(u)) return 'لاين'
  if (/WhatsApp/i.test(u)) return 'واتساب'
  return null
}

/** على آيفون: هل المتصفح غير Safari؟ */
export function iosNotSafari(): boolean {
  return platform() === 'ios' && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(ua())
}

/** الجوال لازم يثبّت التطبيق قبل اللعب، والكمبيوتر يلعب عادي */
export function mustInstall(): boolean {
  return platform() !== 'desktop' && !isStandalone()
}

/* ---------------- زر التثبيت في أندرويد (حدث beforeinstallprompt) ---------------- */
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIPEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

export function listenInstall() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BIPEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    notify()
  })
}
export function installState() {
  return { canPrompt: deferred !== null, installed }
}
export function onInstallChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const d = deferred
  await d.prompt()
  const choice = await d.userChoice.catch(() => ({ outcome: 'dismissed' as const }))
  deferred = null
  notify()
  return choice.outcome === 'accepted'
}

/* ---------------- رمز الدعوة: نحفظه عشان التطبيق يفتح الغرفة بعد التثبيت (أندرويد) ---------------- */
const PENDING = 'duo:pendingJoin'
export function joinCodeFromUrl(): string | null {
  const m = (typeof location === 'undefined' ? '' : location.hash).match(/#\/(?:join|room)\/([A-Za-z0-9]{6})/)
  return m ? m[1].toUpperCase() : null
}
export function savePendingJoin(code: string) {
  try {
    localStorage.setItem(PENDING, JSON.stringify({ code, at: Date.now() }))
  } catch {
    /* */
  }
}
export function takePendingJoin(): string | null {
  try {
    const raw = localStorage.getItem(PENDING)
    if (!raw) return null
    localStorage.removeItem(PENDING)
    const v = JSON.parse(raw) as { code: string; at: number }
    return Date.now() - v.at < 3 * 86400e3 ? v.code : null
  } catch {
    return null
  }
}
