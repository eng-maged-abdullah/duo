import type { Rng } from '../../utils/random'
import { shapeColors, shapeKinds, type ShapeKind } from '../content/v2/draw'

const ri = (rng: Rng, a: number, b: number) => a + Math.floor(rng() * (b - a + 1))
const pickOne = <T,>(rng: Rng, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)]

/* ============================ خزنة الكنز ============================ */
export const POS = ['①', '②', '③', '④']
type Clue = { text: string; test: (c: number[]) => boolean; direct?: boolean }

function clueFor(code: number[], rng: Rng, allowDirect: boolean): Clue {
  const n = code.length
  const P = (i: number) => `الخانة ${POS[i]}`
  const i = ri(rng, 0, n - 1)
  let j = ri(rng, 0, n - 2)
  if (j >= i) j++
  const sum = code.reduce((a, b) => a + b, 0)
  const kind = ri(rng, 0, allowDirect ? 10 : 9)
  switch (kind) {
    case 0: {
      const even = code[i] % 2 === 0
      return { text: `${P(i)} رقم ${even ? 'زوجي' : 'فردي'}`, test: (c) => (c[i] % 2 === 0) === even }
    }
    case 1: {
      if (code[i] > 0) {
        const k = ri(rng, 0, code[i] - 1)
        return { text: `${P(i)} أكبر من ${k}`, test: (c) => c[i] > k }
      }
      return { text: `${P(i)} أصغر من 1`, test: (c) => c[i] < 1 }
    }
    case 2: {
      if (code[i] < 9) {
        const k = ri(rng, code[i] + 1, 9)
        return { text: `${P(i)} أصغر من ${k}`, test: (c) => c[i] < k }
      }
      return { text: `${P(i)} أكبر من 8`, test: (c) => c[i] > 8 }
    }
    case 3:
      return { text: `مجموع كل الأرقام = ${sum}`, test: (c) => c.reduce((a, b) => a + b, 0) === sum }
    case 4: {
      if (code[i] === code[j]) return { text: `${P(i)} نفس ${P(j)}`, test: (c) => c[i] === c[j] }
      const [a, b] = code[i] > code[j] ? [i, j] : [j, i]
      return { text: `${P(a)} أكبر من ${P(b)}`, test: (c) => c[a] > c[b] }
    }
    case 5: {
      const [a, b] = code[i] >= code[j] ? [i, j] : [j, i]
      const d = code[a] - code[b]
      if (d === 0) return { text: `${P(a)} نفس ${P(b)}`, test: (c) => c[a] === c[b] }
      return { text: `${P(a)} = ${P(b)} + ${d}`, test: (c) => c[a] === c[b] + d }
    }
    case 6: {
      const d = ri(rng, 0, 9)
      const has = code.includes(d)
      return { text: has ? `الرقم ${d} موجود في الكود` : `الرقم ${d} مو موجود في الكود`, test: (c) => c.includes(d) === has }
    }
    case 7: {
      const rep = new Set(code).size < n
      return { text: rep ? 'فيه رقم مكرر في الكود' : 'ما فيه ولا رقم مكرر', test: (c) => new Set(c).size < n === rep }
    }
    case 8: {
      const x = code[i] * code[j]
      const [a, b] = i < j ? [i, j] : [j, i]
      return { text: `${P(a)} × ${P(b)} = ${x}`, test: (c) => c[a] * c[b] === x }
    }
    case 9: {
      const s = code[i] + code[j]
      const [a, b] = i < j ? [i, j] : [j, i]
      return { text: `${P(a)} + ${P(b)} = ${s}`, test: (c) => c[a] + c[b] === s }
    }
    default:
      return { text: `${P(i)} هي ${code[i]}`, test: (c) => c[i] === code[i], direct: true }
  }
}

export type Vault = { code: string; a: string[]; b: string[]; n: number }

/** يولّد خزنة لها حل واحد فقط، ونصفا التلميحات كل واحد لحاله ما يكفي */
export function makeVault(rng: Rng, digits: 3 | 4): Vault {
  const all: number[][] = []
  for (let v = 0; v < 10 ** digits; v++) all.push(String(v).padStart(digits, '0').split('').map(Number))
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = Array.from({ length: digits }, () => ri(rng, 0, 9))
    const clues: Clue[] = []
    let cand = all
    let directUsed = false
    for (let k = 0; k < 60 && cand.length > 1 && clues.length < (digits === 3 ? 7 : 9); k++) {
      const c = clueFor(code, rng, !directUsed && digits === 3)
      if (clues.some((x) => x.text === c.text)) continue
      const next = cand.filter(c.test)
      if (next.length === cand.length) continue
      // لا نسمح لتلميح واحد يحل الخزنة كلها
      if (next.length === 1 && clues.length < 3) continue
      if (c.direct) directUsed = true
      clues.push(c)
      cand = next
    }
    if (cand.length !== 1 || clues.length < 4) continue
    for (let s = 0; s < 12; s++) {
      const order = [...clues].sort(() => rng() - 0.5)
      const a = order.filter((_, x) => x % 2 === 0)
      const b = order.filter((_, x) => x % 2 === 1)
      const solA = all.filter((c) => a.every((cl) => cl.test(c))).length
      const solB = all.filter((c) => b.every((cl) => cl.test(c))).length
      if (solA > 1 && solB > 1) return { code: code.join(''), a: a.map((x) => x.text), b: b.map((x) => x.text), n: digits }
    }
  }
  // احتياط نادر جدًا
  return { code: '123'.slice(0, digits).padEnd(digits, '4'), a: ['الخانة ① هي 1', 'مجموع كل الأرقام = ' + (digits === 3 ? 6 : 10)], b: ['الخانة ② هي 2', 'ما فيه ولا رقم مكرر'], n: digits }
}

/** يعدّ الحلول الممكنة لتلميحات مكتوبة (للاختبار فقط) */
export function vaultSolutions(v: Vault): string[] {
  const clues = [...v.a, ...v.b]
  const out: string[] = []
  for (let x = 0; x < 10 ** v.n; x++) {
    const s = String(x).padStart(v.n, '0')
    if (clues.every((t) => checkClueText(t, s.split('').map(Number)))) out.push(s)
  }
  return out
}

/** يقرأ نص التلميح ويتحقق منه (يُستخدم في الاختبارات للتأكد إن النص يطابق المنطق) */
export function checkClueText(t: string, c: number[]): boolean {
  const pos = (s: string) => POS.indexOf(s)
  let m: RegExpMatchArray | null
  if ((m = t.match(/^الخانة (.) رقم (زوجي|فردي)$/))) return (c[pos(m[1])] % 2 === 0) === (m[2] === 'زوجي')
  if ((m = t.match(/^الخانة (.) أكبر من (\d)$/))) return c[pos(m[1])] > +m[2]
  if ((m = t.match(/^الخانة (.) أصغر من (\d)$/))) return c[pos(m[1])] < +m[2]
  if ((m = t.match(/^مجموع كل الأرقام = (\d+)$/))) return c.reduce((a, b) => a + b, 0) === +m[1]
  if ((m = t.match(/^الخانة (.) نفس الخانة (.)$/))) return c[pos(m[1])] === c[pos(m[2])]
  if ((m = t.match(/^الخانة (.) أكبر من الخانة (.)$/))) return c[pos(m[1])] > c[pos(m[2])]
  if ((m = t.match(/^الخانة (.) = الخانة (.) \+ (\d)$/))) return c[pos(m[1])] === c[pos(m[2])] + +m[3]
  if ((m = t.match(/^الرقم (\d) موجود في الكود$/))) return c.includes(+m[1])
  if ((m = t.match(/^الرقم (\d) مو موجود في الكود$/))) return !c.includes(+m[1])
  if (t === 'فيه رقم مكرر في الكود') return new Set(c).size < c.length
  if (t === 'ما فيه ولا رقم مكرر') return new Set(c).size === c.length
  if ((m = t.match(/^الخانة (.) × الخانة (.) = (\d+)$/))) return c[pos(m[1])] * c[pos(m[2])] === +m[3]
  if ((m = t.match(/^الخانة (.) \+ الخانة (.) = (\d+)$/))) return c[pos(m[1])] + c[pos(m[2])] === +m[3]
  if ((m = t.match(/^الخانة (.) هي (\d)$/))) return c[pos(m[1])] === +m[2]
  throw new Error('unknown clue: ' + t)
}

/* ============================ ارسم اللي أوصفه ============================ */
export type ShapeItem = { k: ShapeKind; c: string; cell: number; big: boolean }
export function makeScene(rng: Rng, count: number): ShapeItem[] {
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => rng() - 0.5)
  const kinds = [...shapeKinds].sort(() => rng() - 0.5)
  return Array.from({ length: count }, (_, i) => ({
    k: kinds[i],
    c: pickOne(rng, shapeColors).id,
    cell: cells[i],
    big: rng() < 0.4,
  }))
}

/* ============================ ضغطة الانعكاس ============================ */
export type ReflexRound = {
  type: 'reflex'
  variant: 'green' | 'emoji' | 'word'
  prompt: string
  target: string
  go: number // ms من بداية الجولة
  events: { at: number; show: string; fake: boolean }[]
}
const decoyEmojis = ['🍔', '🍟', '🌭', '🥨', '🍩', '🍪', '🧁', '🍉', '🍓', '🍍', '🥑', '🌶️', '🍋', '🥥', '🍇', '🍒']
const decoyWords: Record<string, string[]> = {
  الحين: ['الحيين', 'لاحين', 'الحن', 'حين', 'الحنين', 'ينحال'],
  اضغط: ['اضعط', 'ضغط', 'اظغط', 'اصغط', 'لا تضغط', 'اضغطط'],
  يلا: ['يلي', 'لايا', 'ييلا', 'يالا', 'لا يلا', 'يلاا'],
}
export function makeReflex(rng: Rng): ReflexRound {
  const variant = pickOne(rng, ['green', 'green', 'emoji', 'emoji', 'word'] as const)
  const go = ri(rng, 2600, 6200)
  const events: ReflexRound['events'] = []
  const fakes = ri(rng, 0, 3)
  let t = 1300
  if (variant === 'green') {
    for (let i = 0; i < fakes && t < go - 700; i++) {
      t += ri(rng, 400, 1300)
      if (t < go - 500) events.push({ at: t, show: pickOne(rng, ['yellow', 'orange', 'blue']), fake: true })
    }
    events.push({ at: go, show: 'green', fake: false })
    return { type: 'reflex', variant, prompt: 'اضغط أول ما تصير الشاشة خضراء 🟢', target: 'green', go, events }
  }
  if (variant === 'emoji') {
    const target = pickOne(rng, ['🍕', '🌮', '🍦', '🍫', '🥐', '🍌'])
    while (t < go - 450) {
      t += ri(rng, 350, 800)
      if (t < go - 300) events.push({ at: t, show: pickOne(rng, decoyEmojis), fake: true })
    }
    events.push({ at: go, show: target, fake: false })
    return { type: 'reflex', variant, prompt: `اضغط أول ما يطلع ${target}`, target, go, events }
  }
  const target = pickOne(rng, Object.keys(decoyWords))
  while (t < go - 450) {
    t += ri(rng, 400, 900)
    if (t < go - 300) events.push({ at: t, show: pickOne(rng, decoyWords[target]), fake: true })
  }
  events.push({ at: go, show: target, fake: false })
  return { type: 'reflex', variant, prompt: `اضغط أول ما تشوف كلمة «${target}» بالضبط`, target, go, events }
}
