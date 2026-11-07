/** هل الموقع مفتوح كتطبيق مثبّت (من أيقونة الشاشة الرئيسية)؟ */
export function isStandalone() {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

export type Platform = 'ios' | 'android' | 'desktop'
export function platform(): Platform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/** متصفح داخل تطبيق ثاني (إنستقرام، سناب، تيك توك…) ما يقدر يثبّت */
export function inAppBrowser() {
  return /FBAN|FBAV|Instagram|Snapchat|TikTok|musical_ly|Line\/|Twitter|LinkedInApp|GSA\//i.test(navigator.userAgent)
}

/** آيفون: هل المتصفح غير Safari؟ (كروم وغيره يدعمون الإضافة من iOS 16.4 بس الطريقة تختلف شوي) */
export function iosBrowser(): 'safari' | 'chrome' | 'other' {
  const ua = navigator.userAgent
  if (/CriOS/i.test(ua)) return 'chrome'
  if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i.test(ua)) return 'other'
  return 'safari'
}

/** هل نمنع اللعب من المتصفح؟ (الجوالات فقط — الكمبيوتر يلعب عادي) */
export function mustInstall() {
  if (import.meta.env.VITE_ALLOW_BROWSER === 'true') return false
  return platform() !== 'desktop' && !isStandalone()
}

/* ---------- زر التثبيت في أندرويد ---------- */
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIPEvent | null = null
const listeners = new Set<() => void>()
export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BIPEvent
    listeners.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    try {
      localStorage.setItem('duo:installed', '1')
    } catch {
      /* */
    }
    listeners.forEach((f) => f())
  })
}
export const canPromptInstall = () => deferred !== null
export const onInstallChange = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}
export async function promptInstall() {
  if (!deferred) return 'unavailable' as const
  await deferred.prompt()
  const r = await deferred.userChoice
  deferred = null
  listeners.forEach((f) => f())
  return r.outcome
}
export const wasInstalled = () => {
  try {
    return localStorage.getItem('duo:installed') === '1'
  } catch {
    return false
  }
}
