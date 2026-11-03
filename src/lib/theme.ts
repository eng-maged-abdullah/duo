/** الوضع الليلي والصباحي: تلقائي (حسب الجهاز) أو فاتح أو داكن */
export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'duo:theme'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function resolvedTheme(pref = getThemePref()): 'light' | 'dark' {
  if (pref !== 'auto') return pref
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(pref = getThemePref()) {
  const t = resolvedTheme(pref)
  document.documentElement.classList.toggle('light', t === 'light')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#faf7fc' : '#0d0714')
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', t)
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* */
  }
  applyTheme(pref)
}

// متابعة تغيير وضع الجهاز عند اختيار "تلقائي"
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
  if (getThemePref() === 'auto') applyTheme('auto')
})
