import { shuffle, type Rng } from '../../utils/random'

/**
 * اختيار محتوى بدون تكرار داخل الغرفة:
 * يفضّل العناصر التي لم تُلعب بعد، وعند انتهائها يبدأ دورة جديدة.
 */
let seen = new Set<string>()
let picked: string[] = []

export function hashKey(x: unknown): string {
  const s = typeof x === 'string' ? x : JSON.stringify(x)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function beginBuild(prev: Iterable<string>) {
  seen = new Set(prev)
  picked = []
}

export function endBuild(): string[] {
  const out = picked
  picked = []
  seen = new Set()
  return out
}

export function fresh<T>(arr: readonly T[], n: number, rng: Rng = Math.random): T[] {
  const want = Math.min(n, arr.length)
  const unseen = arr.filter((x) => !seen.has(hashKey(x)))
  let out: T[]
  if (unseen.length >= want) out = shuffle(unseen, rng).slice(0, want)
  else {
    // انتهت الأسئلة الجديدة: نكمل من القديمة (دورة جديدة)
    const rest = shuffle(arr.filter((x) => seen.has(hashKey(x))), rng)
    out = [...shuffle(unseen, rng), ...rest].slice(0, want)
    picked.push('__cycle__')
  }
  for (const x of out) picked.push(hashKey(x))
  return out
}

const KEY = (room: string, game: string) => `duo:seen:${room}:${game}`

export function loadSeen(room: string, game: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY(room, game)) ?? '[]')
  } catch {
    return []
  }
}

export function saveSeen(room: string, game: string, prev: string[], added: string[]) {
  try {
    const cycle = added.includes('__cycle__')
    const next = cycle ? added.filter((x) => x !== '__cycle__') : [...prev, ...added]
    localStorage.setItem(KEY(room, game), JSON.stringify(next.slice(-3000)))
  } catch {
    /* التخزين غير متاح */
  }
}
