/**
 * مؤثرات صوتية خفيفة مولّدة بالكود (بدون ملفات).
 * لا تعمل إلا بعد أول تفاعل من المستخدم، ويمكن إيقافها من الإعدادات.
 */
type Sfx = 'tap' | 'select' | 'match' | 'win' | 'message' | 'join' | 'flip' | 'wrong' | 'tick'

let enabled = true
let unlocked = false
let ctx: AudioContext | null = null

try {
  enabled = localStorage.getItem('duo:sfx') !== 'off'
} catch {
  /* */
}

export function setSfxEnabled(v: boolean) {
  enabled = v
  try {
    localStorage.setItem('duo:sfx', v ? 'on' : 'off')
  } catch {
    /* */
  }
}
export const sfxEnabled = () => enabled

function unlock() {
  unlocked = true
  window.removeEventListener('pointerdown', unlock)
  window.removeEventListener('keydown', unlock)
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}

function audio(): AudioContext | null {
  if (!unlocked) return null
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = C ? new C() : null
    }
    if (ctx?.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, c.currentTime + start)
  g.gain.setValueAtTime(0, c.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + dur + 0.02)
}

export function sfx(kind: Sfx) {
  if (!enabled || document.visibilityState !== 'visible') return
  const c = audio()
  if (!c) return
  switch (kind) {
    case 'tap':
      tone(c, 660, 0, 0.06, 'triangle', 0.04)
      break
    case 'select':
      tone(c, 523, 0, 0.09, 'triangle', 0.06)
      tone(c, 784, 0.05, 0.12, 'sine', 0.05)
      break
    case 'flip':
      tone(c, 440, 0, 0.07, 'triangle', 0.05)
      break
    case 'match':
      ;[659, 831, 988].forEach((f, i) => tone(c, f, i * 0.07, 0.22, 'sine', 0.07))
      break
    case 'win':
      ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, f, i * 0.09, 0.35, 'sine', 0.07))
      break
    case 'message':
      tone(c, 880, 0, 0.08, 'sine', 0.05)
      tone(c, 1175, 0.07, 0.1, 'sine', 0.04)
      break
    case 'join':
      tone(c, 392, 0, 0.12, 'sine', 0.06)
      tone(c, 587, 0.1, 0.18, 'sine', 0.06)
      break
    case 'wrong':
      tone(c, 220, 0, 0.18, 'sawtooth', 0.03)
      break
    case 'tick':
      tone(c, 1200, 0, 0.03, 'square', 0.015)
      break
  }
}

export function vibrate(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* */
  }
}
