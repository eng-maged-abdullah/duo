/** الألعاب الجديدة (النسخة الثانية) */
import type { GameDef, Summary, SummaryCtx, TextItem } from './types'
import { shuffle } from '../utils/random'
import { fresh as pick } from './engine/fresh'
import { byRound, emptyScores, nameOf, otherOf, pct, winnerHeadline } from './engine/helpers'
import { continueThemes, drawEasy, drawHard, drawMedium } from './content/v2/draw'
import {
  actRoles,
  complimentTopics,
  forbiddenRules,
  forbiddenTopics,
  humCategories,
  noLaughIdeas,
  raceCategories,
  raceLetters,
  tabooCards,
  tongueTwisters,
  twentyCategories,
  twoTruthsThemes,
} from './content/v2/voice'
import { dreamPlans } from './content/v2/dream'
import { allKnowMe, allQuick, allRiddles } from './banks'
import { makeReflex, makeScene, makeVault } from './engine/generators'
import { c4Replay, chainReplay, dotsReplay, liarReplay, normWord } from './engine/boards'

const N = (o: Record<string, string>, key: string, d: number) => {
  const n = parseInt(o[key] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : d
}
const sel = (key: string, label: string, def: string, opts: [string, string][]) => ({
  key,
  label,
  kind: 'select' as const,
  default: def,
  options: opts.map(([value, l]) => ({ value, label: l })),
})
const turnsOpt = (def: string, values: string[], label = 'عدد الأدوار') => sel('turns', label, def, values.map((v) => [v, `${v} (${Number(v) / 2} لكل واحد)`]))
const secsOpt = (def: string, values: string[]) => sel('secs', 'الوقت لكل دور', def, values.map((v) => [v, `${v} ثانية`]))
/** صاحب الدور رقم i: الأول للأدوار الفردية */
const ownerOf = (i: number) => (i % 2 === 1 ? 'first' : 'second')
const mv = (ctx: SummaryCtx, kind: string) => ctx.moves.filter((m) => m.move.kind === kind)
/* =========================== ارسم وخمّن =========================== */
const drawGuess: GameDef = {
  id: 'draw-guess',
  title: 'ارسم وخمّن',
  tagline: 'ترسم على الشاشة… وهو يشوف الرسم وهو ينرسم!',
  emoji: '🎨',
  categories: ['laugh', 'compete'],
  accent: ['#f0509a', '#ffc861'],
  minutes: '8–15 د',
  badge: 'new',
  featured: true,
  stakes: true,
  howTo: [
    'الرسام يختار كلمة من ثلاث (سهلة، متوسطة، صعبة) — الكلمة مخفية عن شريكه.',
    'يرسمها على الشاشة، وشريكه يشوف الرسم مباشرة ويكتب تخميناته.',
    'إذا عرفها: الاثنين ياخذون نقاط (الصعبة نقاطها أكثر، والسرعة تزيد النقاط).',
    'ممنوع تكتب حروف أو أرقام في الرسم 😄',
  ],
  mode: 'turns',
  renderer: 'drawguess',
  setup: [turnsOpt('4', ['4', '6', '8']), secsOpt('80', ['60', '80', '100'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 4)
    const e = pick(drawEasy, n, rng)
    const m = pick(drawMedium, n, rng)
    const h = pick(drawHard, n, rng)
    return {
      rounds: n,
      seconds: null,
      content: {
        free: true,
        turns: n,
        seconds: N(o, 'secs', 80),
        _secrets: Array.from({ length: n }, (_, k) => ({ slot: `w${k + 1}`, owner: ownerOf(k + 1), value: [e[k], m[k], h[k]] })),
      },
    }
  },
  summarize: (ctx) => {
    const scores = emptyScores(ctx.players)
    const lines: string[] = []
    const secs = Number(ctx.session.content?.seconds ?? 80)
    for (const ch of mv(ctx, 'chosen')) {
      const slot = String(ch.move.slot)
      const d = Number(ch.move.d ?? 0)
      const drawer = ch.player_id
      const g = ctx.moves.find((x) => x.move.kind === 'guess' && x.move.slot === slot && x.move.correct)
      const word = (g?.move.value as { w?: string })?.w ?? (ctx.moves.find((x) => x.move.kind === 'reveal' && x.move.slot === slot)?.move.value as { w?: string })?.w ?? '؟'
      if (g) {
        const took = (new Date(g.created_at).getTime() - new Date(ch.created_at).getTime()) / 1000
        const bonus = took < secs / 3 ? 2 : took < (2 * secs) / 3 ? 1 : 0
        scores[drawer] = (scores[drawer] ?? 0) + d + 1
        scores[g.player_id] = (scores[g.player_id] ?? 0) + d + 1 + bonus
        lines.push(`🎨 ${nameOf(drawer, ctx.players)} رسم «${word}» — عرفها ${nameOf(g.player_id, ctx.players)} في ${Math.max(1, Math.round(took))} ث ✅`)
      } else lines.push(`🎨 ${nameOf(drawer, ctx.players)} رسم «${word}» — ما انعرفت 😅`)
    }
    return { scores, unit: 'نقطة', headline: winnerHeadline(scores, ctx.players, '{name} فنان الليلة! 🎨'), lines, celebrate: true }
  },
}

/* =========================== ارسم اللي أوصفه =========================== */
const drawDescribe: GameDef = {
  id: 'draw-describe',
  title: 'ارسم اللي أوصفه',
  tagline: 'أوصف لك صورة… وأنت ترسمها بدون ما تشوفها',
  emoji: '🖌️',
  categories: ['laugh', 'romance'],
  accent: ['#29c4e6', '#f0509a'],
  minutes: '8–12 د',
  badge: 'new',
  voice: true,
  howTo: [
    'الواصف يشوف صورة فيها أشكال وألوان — شريكه ما يشوفها.',
    'يوصفها بالصوت (وين كل شكل، لونه، حجمه)، والثاني يرسم.',
    'بعد الوقت تنكشف الصورة جنب الرسمة… والضحك مضمون 😂',
    'الواصف يقيّم الشبه من ٥ نجوم، وبعدين تتبدل الأدوار.',
  ],
  mode: 'turns',
  renderer: 'drawdescribe',
  setup: [turnsOpt('4', ['2', '4', '6']), sel('level', 'الصعوبة', '3', [['2', 'سهلة (شكلين)'], ['3', 'متوسطة (٣ أشكال)'], ['5', 'صعبة (٥ أشكال)']]), secsOpt('90', ['60', '90', '120'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 4)
    const k = Math.min(6, Math.max(2, N(o, 'level', 3)))
    return {
      rounds: n,
      seconds: null,
      content: {
        free: true,
        turns: n,
        seconds: N(o, 'secs', 90),
        _secrets: Array.from({ length: n }, (_, i) => ({ slot: `p${i + 1}`, owner: ownerOf(i + 1), value: makeScene(rng, k) })),
      },
    }
  },
  summarize: (ctx) => {
    const rates = mv(ctx, 'rate').map((m) => Number(m.move.stars ?? 0))
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
    const p = Math.round((avg / 5) * 100)
    return {
      percent: p,
      percentLabel: 'نسبة تفاهمكم بالوصف',
      headline: p >= 75 ? 'تفاهم خرافي! 🤝' : p >= 45 ? 'مو سيئين أبدًا 😄' : 'رسمات تستاهل تنحفظ للتاريخ 😂',
      lines: rates.map((r, i) => `الرسمة ${i + 1}: ${'⭐'.repeat(r)}`),
      celebrate: p >= 60,
    }
  },
}

/* =========================== كمّل رسمتي =========================== */
const drawContinue: GameDef = {
  id: 'draw-continue',
  title: 'كمّل رسمتي',
  tagline: 'خط منك وخط مني… ووش يطلع؟',
  emoji: '🖍️',
  categories: ['laugh', 'romance'],
  accent: ['#ffc861', '#8b5cf6'],
  minutes: '5–10 د',
  badge: 'new',
  howTo: ['يطلع لكم موضوع (أو ارسموا اللي تبون).', 'كل واحد يرسم خط واحد بالدور.', 'في الآخر كل واحد يعطي اللوحة اسم… ونشوف الاسمين!', 'تقدرون تحفظون اللوحة صورة في جوالكم.'],
  mode: 'turns',
  renderer: 'drawcontinue',
  setup: [sel('strokes', 'عدد الخطوط', '16', [['10', '10 خطوط'], ['16', '16 خط'], ['24', '24 خط']]), sel('theme', 'الموضوع', 'random', [['random', 'موضوع عشوائي 🎲'], ['free', 'رسم حر ✨']])],
  build: (o, rng) => ({
    rounds: 1,
    seconds: null,
    content: { free: true, strokes: N(o, 'strokes', 16), theme: o.theme === 'free' ? null : pick(continueThemes, 1, rng)[0] },
  }),
  summarize: (ctx) => {
    const titles = mv(ctx, 'title')
    return { headline: 'لوحتكم جاهزة! 🖼️', lines: titles.map((t) => `${nameOf(t.player_id, ctx.players)} سمّاها: «${t.move.text}»`) }
  },
}

/* =========================== الكلمة الممنوعة / مثّلها =========================== */
function cardsSummary(ctx: SummaryCtx, label: string): Summary {
  const scores = emptyScores(ctx.players)
  const lines: string[] = []
  const turns = Number(ctx.session.content?.turns ?? 0)
  for (let t = 1; t <= turns; t++) {
    const cards = ctx.moves.filter((m) => m.move.kind === 'card' && Number(m.move.turn) === t)
    if (!cards.length) continue
    const who = cards[0].player_id
    const got = cards.filter((c) => c.move.res === 'got').length
    const foul = cards.filter((c) => c.move.res === 'foul').length
    scores[who] = (scores[who] ?? 0) + got - foul
    lines.push(`${nameOf(who, ctx.players)}: ${got} ${label}${foul ? ` · ${foul} مخالفة 🚫` : ''}`)
  }
  for (const k of Object.keys(scores)) scores[k] = Math.max(0, scores[k])
  return { scores, unit: 'نقطة', headline: winnerHeadline(scores, ctx.players, '{name} أفضل ' + (label === 'كلمة' ? 'واصف! 🗣️' : 'ممثل! 🎭')), lines, celebrate: true }
}
const taboo: GameDef = {
  id: 'taboo',
  title: 'الكلمة الممنوعة',
  tagline: 'وصّف الكلمة… بدون الكلمات الممنوعة!',
  emoji: '🤐',
  categories: ['laugh', 'compete'],
  accent: ['#ff6b6b', '#ffc861'],
  minutes: '6–12 د',
  badge: 'new',
  featured: true,
  voice: true,
  stakes: true,
  howTo: [
    'صاحب الدور يشوف كلمة وتحتها ٤ كلمات ممنوع يقولها.',
    'يوصفها بالصوت، وشريكه يحاول يعرفها بأسرع وقت.',
    'عرفها؟ ✅ نقطة. قلت كلمة ممنوعة؟ 🚫 تنخصم نقطة. تقدر تتخطى.',
    'شريكك يقدر يضغط 🚨 إذا سمعك تقول كلمة ممنوعة!',
    'أكبر عدد كلمات قبل ما يخلص الوقت.',
  ],
  mode: 'turns',
  renderer: 'cards',
  setup: [turnsOpt('4', ['2', '4', '6']), secsOpt('60', ['45', '60', '90'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 4)
    const cards = shuffle(pick(tabooCards, n * 14, rng), rng)
    return {
      rounds: n,
      seconds: null,
      content: {
        free: true,
        variant: 'taboo',
        turns: n,
        seconds: N(o, 'secs', 60),
        _secrets: Array.from({ length: n }, (_, i) => ({ slot: `d${i + 1}`, owner: ownerOf(i + 1), value: cards.slice(i * 14, i * 14 + 14) })),
      },
    }
  },
  summarize: (ctx) => cardsSummary(ctx, 'كلمة'),
}
const act: GameDef = {
  id: 'act',
  title: 'مثّلها بالصوت',
  tagline: 'قلّد الشخصية بصوتك… وهو يخمّن',
  emoji: '🎭',
  categories: ['laugh'],
  accent: ['#8b5cf6', '#ff9a62'],
  minutes: '6–12 د',
  badge: 'new',
  voice: true,
  howTo: ['صاحب الدور تطلع له شخصية أو موقف (مخفي عن شريكه).', 'يمثّلها بصوته في المكالمة بدون ما يقول اسمها.', 'شريكه يخمّن بالصوت، وإذا عرفها اضغط ✅.', 'أكبر عدد قبل ما يخلص الوقت!'],
  mode: 'turns',
  renderer: 'cards',
  setup: [turnsOpt('4', ['2', '4', '6']), secsOpt('60', ['45', '60', '90'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 4)
    const cards = shuffle(pick(actRoles, n * 10, rng), rng).map((w) => ({ w, f: [] as string[] }))
    return {
      rounds: n,
      seconds: null,
      content: {
        free: true,
        variant: 'act',
        turns: n,
        seconds: N(o, 'secs', 60),
        _secrets: Array.from({ length: n }, (_, i) => ({ slot: `d${i + 1}`, owner: ownerOf(i + 1), value: cards.slice(i * 10, i * 10 + 10) })),
      },
    }
  },
  summarize: (ctx) => cardsSummary(ctx, 'شخصية'),
}

/* =========================== دندن وخمّن =========================== */
const hum: GameDef = {
  id: 'hum',
  title: 'دندن وخمّن',
  tagline: 'دندن اللحن بدون كلام… وهو يعرف الأغنية!',
  emoji: '🎵',
  categories: ['laugh', 'romance'],
  accent: ['#29c4e6', '#8b5cf6'],
  minutes: '6–10 د',
  badge: 'new',
  voice: true,
  howTo: [
    'صاحب الدور يطلع له نوع أغنية (مثلًا: شارة كرتون من طفولتك).',
    'يختار أغنية في باله ويكتب اسمها سرًا.',
    'يدندن اللحن في المكالمة — بدون ولا كلمة من الأغنية!',
    'شريكه يكتب تخمينه، أو المدندن يضغط ✅ إذا عرفها.',
  ],
  mode: 'turns',
  renderer: 'hum',
  setup: [turnsOpt('4', ['2', '4', '6']), secsOpt('45', ['30', '45', '60'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 4)
    return { rounds: n, seconds: null, content: { free: true, turns: n, seconds: N(o, 'secs', 45), cats: pick(humCategories, n, rng) } }
  },
  summarize: (ctx) => {
    const turns = Number(ctx.session.content?.turns ?? 0)
    const scores = emptyScores(ctx.players)
    let solved = 0
    for (let t = 1; t <= turns; t++) {
      const slot = `h${t}`
      const g = ctx.moves.find((m) => (m.move.kind === 'guess' && m.move.slot === slot && m.move.correct) || (m.move.kind === 'got' && Number(m.move.turn) === t))
      if (g) {
        solved++
        const set = ctx.moves.find((m) => m.move.kind === 'secret_set' && m.move.slot === slot)
        const guesser = set ? otherOf(set.player_id, ctx.players) : undefined
        if (guesser) scores[guesser]++
      }
    }
    return { scores, unit: 'أغنية عرفها', headline: `عرفتوا ${solved} من ${turns} أغاني 🎵`, celebrate: solved > turns / 2 }
  },
}

/* =========================== كذبة وحدة =========================== */
const twoTruths: GameDef = {
  id: 'two-truths',
  title: 'كذبة وحدة',
  tagline: '٣ معلومات عنك… وحدة منها كذب!',
  emoji: '🤥',
  categories: ['acquaint', 'laugh', 'romance'],
  accent: ['#ff9a62', '#8b5cf6'],
  minutes: '8–12 د',
  badge: 'new',
  stakes: true,
  howTo: [
    'صاحب الدور يكتب ٣ معلومات عن نفسه: ٢ صح وواحدة كذب.',
    'يحدد الكذبة سرًا (محفوظة في الخادم).',
    'شريكه يحاول يكتشف الكذبة.',
    'اكتشفها؟ نقطة له. ما اكتشفها؟ نقطة لك! وبعدها احكوا القصة 😄',
  ],
  mode: 'turns',
  renderer: 'twotruths',
  setup: [turnsOpt('4', ['2', '4', '6'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 4)
    return { rounds: n, seconds: null, content: { free: true, turns: n, themes: pick(twoTruthsThemes, n, rng) } }
  },
  summarize: (ctx) => {
    const scores = emptyScores(ctx.players)
    const lines: string[] = []
    for (const s of mv(ctx, 'statements')) {
      const t = Number(s.move.turn)
      const g = ctx.moves.find((m) => m.move.kind === 'guess' && m.move.slot === `lie${t}`)
      if (!g) continue
      if (g.move.correct) {
        scores[g.player_id]++
        lines.push(`${nameOf(g.player_id, ctx.players)} كشف كذبة ${nameOf(s.player_id, ctx.players)} 🕵️`)
      } else {
        scores[s.player_id]++
        lines.push(`${nameOf(s.player_id, ctx.players)} ضحك على ${nameOf(g.player_id, ctx.players)} 😏`)
      }
    }
    return { scores, unit: 'نقطة', headline: winnerHeadline(scores, ctx.players, '{name} أذكى كذّاب 😂'), lines, celebrate: true }
  },
}

/* =========================== سباق الكلمات =========================== */
export type RaceItem = { type: 'race'; prompt: string; cat: string; letter: string | null }
export function raceScore(a: string[] = [], b: string[] = [], letter: string | null) {
  const clean = (ws: string[]) => {
    const out = new Map<string, string>()
    for (const w of ws) {
      const n = normWord(w)
      if (n.length < 2) continue
      if (letter) {
        const L = normWord(letter)
        const first = n.startsWith('ال') && n.length > 3 ? n[2] : n[0]
        if (first !== L && n[0] !== L) continue
      }
      if (!out.has(n)) out.set(n, w.trim())
    }
    return out
  }
  const A = clean(a)
  const B = clean(b)
  const shared = [...A.keys()].filter((k) => B.has(k))
  return {
    a: A.size - shared.length,
    b: B.size - shared.length,
    shared: shared.map((k) => A.get(k)!),
    validA: [...A.values()],
    validB: [...B.values()],
  }
}
const wordRace: GameDef = {
  id: 'word-race',
  title: 'سباق الكلمات',
  tagline: 'أكثر عدد كلمات في ٣٠ ثانية!',
  emoji: '🏃',
  categories: ['quick', 'compete', 'laugh'],
  accent: ['#22c55e', '#29c4e6'],
  minutes: '4–6 د',
  badge: 'new',
  stakes: true,
  howTo: [
    'يطلع تصنيف (مثلًا: أكلات تبدأ بحرف م).',
    'اكتب أكبر عدد كلمات قبل ما يخلص الوقت — اضغط Enter بعد كل كلمة.',
    'الكلمات اللي كتبتوها الاثنين تنلغي! فكّر بشي ما بيفكر فيه شريكك 😏',
    'كل كلمة صحيحة ما كتبها شريكك = نقطة.',
  ],
  mode: 'rounds',
  renderer: 'wordrace',
  setup: [sel('rounds', 'عدد الجولات', '5', [['3', '3 جولات'], ['5', '5 جولات'], ['8', '8 جولات']]), sel('secs', 'الوقت', '30', [['20', '20 ثانية'], ['30', '30 ثانية'], ['45', '45 ثانية']])],
  build: (o, rng) => {
    const n = N(o, 'rounds', 5)
    const cats = pick(raceCategories, n, rng)
    const its: RaceItem[] = cats.map((cat, i) => {
      const letter = i % 2 === 0 ? pick(raceLetters, 1, rng)[0] : null
      return { type: 'race', cat, letter, prompt: letter ? `${cat} تبدأ بحرف «${letter}»` : cat }
    })
    return { rounds: n, seconds: N(o, 'secs', 30), content: { items: its } }
  },
  summarize: (ctx) => {
    const [p1, p2] = ctx.players.map((p) => p.user_id)
    const scores = emptyScores(ctx.players)
    const its = (ctx.session.content?.items ?? []) as RaceItem[]
    let shared = 0
    for (const [r, m] of byRound(ctx.answers)) {
      const it = its[r - 1]
      if (!it) continue
      const s = raceScore(m.get(p1)?.answer?.words, m.get(p2)?.answer?.words, it.letter)
      scores[p1] += s.a
      scores[p2] += s.b
      shared += s.shared.length
    }
    return { scores, unit: 'كلمة', headline: winnerHeadline(scores, ctx.players, '{name} قاموس متنقل! 📚'), lines: shared ? [`فكرتوا بنفس ${shared} كلمة 🧠💞`] : [], celebrate: true }
  },
}

/* =========================== تحدي لا تضحك =========================== */
const noLaugh: GameDef = {
  id: 'no-laugh',
  title: 'تحدي لا تضحك',
  tagline: '٣٠ ثانية تحاول تضحّكه… وهو يقاوم!',
  emoji: '😂',
  categories: ['laugh', 'compete'],
  accent: ['#ffc861', '#f0509a'],
  minutes: '5–10 د',
  badge: 'new',
  featured: true,
  voice: true,
  stakes: true,
  howTo: [
    'صاحب الدور عنده ٣٠ ثانية يحاول يضحّك شريكه بالصوت (فيه أفكار تساعدك).',
    'شريكه لازم يكون أمين: أول ما يضحك يضغط "ضحكت 😂".',
    'ضحك؟ نقطة لك. صمد؟ نقطة له.',
    'بعدها تتبدل الأدوار.',
  ],
  mode: 'turns',
  renderer: 'nolaugh',
  setup: [turnsOpt('6', ['4', '6', '8']), secsOpt('30', ['20', '30', '45'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 6)
    const ideas = pick(noLaughIdeas, n * 3, rng)
    return { rounds: n, seconds: null, content: { free: true, turns: n, seconds: N(o, 'secs', 30), ideas: Array.from({ length: n }, (_, i) => ideas.slice(i * 3, i * 3 + 3)) } }
  },
  summarize: (ctx) => {
    const scores = emptyScores(ctx.players)
    let laughs = 0
    for (const m of ctx.moves) {
      if (m.move.kind === 'laughed') {
        laughs++
        const performer = otherOf(m.player_id, ctx.players)
        if (performer) scores[performer]++
      }
      if (m.move.kind === 'held') {
        const w = String(m.move.watcher)
        scores[w] = (scores[w] ?? 0) + 1
      }
    }
    return { scores, unit: 'نقطة', headline: winnerHeadline(scores, ctx.players, '{name} ملك الضحك 👑'), lines: [`ضحكتوا ${laughs} مرة 😂`], celebrate: true }
  },
}

/* =========================== الحرف الممنوع =========================== */
const forbidden: GameDef = {
  id: 'forbidden',
  title: 'الحرف الممنوع',
  tagline: 'سولفوا دقيقة… بدون الكلمة الممنوعة!',
  emoji: '🚫',
  categories: ['laugh', 'compete'],
  accent: ['#ef4444', '#8b5cf6'],
  minutes: '4–8 د',
  badge: 'new',
  voice: true,
  stakes: true,
  howTo: [
    'كل جولة فيها قاعدة (مثلًا: ممنوع تقول "لا") وموضوع تسولفون فيه.',
    'سولفوا بالصوت عادي… وركّزوا!',
    'أول ما يغلط شريكك اضغط "مسكتك! 🫵" وتاخذ نقطة.',
    'كونوا أمناء، والضحك مسموح 😂',
  ],
  mode: 'turns',
  renderer: 'forbidden',
  setup: [sel('rounds', 'عدد الجولات', '4', [['3', '3 جولات'], ['4', '4 جولات'], ['6', '6 جولات']]), secsOpt('60', ['45', '60', '90'])],
  build: (o, rng) => {
    const n = N(o, 'rounds', 4)
    const rules = pick(forbiddenRules, n, rng)
    const topics = pick(forbiddenTopics, n, rng)
    return { rounds: n, seconds: null, content: { free: true, rounds: rules.map((r, i) => ({ ...r, topic: topics[i] })), seconds: N(o, 'secs', 60) } }
  },
  summarize: (ctx) => {
    const scores = emptyScores(ctx.players)
    for (const m of mv(ctx, 'catch')) scores[m.player_id]++
    return { scores, unit: 'مسكة', headline: winnerHeadline(scores, ctx.players, '{name} صقر! ما يفوته شي 🦅'), celebrate: true }
  },
}

/* =========================== قولها بسرعة =========================== */
const tongue: GameDef = {
  id: 'tongue',
  title: 'قولها بسرعة',
  tagline: 'جمل تعقّد اللسان… قلها ٣ مرات ورا بعض!',
  emoji: '👅',
  categories: ['laugh', 'quick'],
  accent: ['#f0509a', '#29c4e6'],
  minutes: '4–6 د',
  badge: 'new',
  voice: true,
  howTo: ['صاحب الدور تطلع له جملة صعبة النطق.', 'يقولها ٣ مرات ورا بعض بسرعة في المكالمة.', 'شريكه يقيّمه من ٥ نجوم 😂', 'بعدها يتبدل الدور.'],
  mode: 'turns',
  renderer: 'tongue',
  setup: [turnsOpt('6', ['4', '6', '10'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 6)
    return { rounds: n, seconds: null, content: { free: true, turns: n, phrases: pick(tongueTwisters, n, rng) } }
  },
  summarize: (ctx) => {
    const scores = emptyScores(ctx.players)
    for (const m of mv(ctx, 'rate')) {
      const speaker = otherOf(m.player_id, ctx.players)
      if (speaker) scores[speaker] += Number(m.move.stars ?? 0)
    }
    return { scores, unit: 'نجمة ⭐', headline: winnerHeadline(scores, ctx.players, '{name} لسانه ذهب! 🏅'), celebrate: true }
  },
}

/* =========================== أغبى إجابة =========================== */
const dumb: GameDef = {
  id: 'dumb',
  title: 'أغبى إجابة',
  tagline: 'سؤال جاد… جاوب بأضحك إجابة غلط!',
  emoji: '🤪',
  categories: ['laugh'],
  accent: ['#ffc861', '#ff6b6b'],
  minutes: '5–10 د',
  badge: 'new',
  stakes: true,
  howTo: ['يطلع سؤال جاد (معلومات عامة أو لغز).', 'ممنوع الإجابة الصحيحة! اكتب أضحك إجابة غلط تقدر عليها.', 'بعد الكشف كل واحد يقيّم إجابة الثاني من ٥ 🤣', 'أكثر نجوم يفوز.'],
  mode: 'rounds',
  renderer: 'rated',
  setup: [sel('rounds', 'عدد الجولات', '6', [['4', '4 جولات'], ['6', '6 جولات'], ['10', '10 جولات']])],
  build: (o, rng) => {
    const n = N(o, 'rounds', 6)
    const qs = shuffle([...pick(allQuick, Math.ceil(n * 0.7), rng).map((x) => ({ q: x.q, a: x.a })), ...pick(allRiddles, n, rng).map((x) => ({ q: x.q, a: x.a }))], rng).slice(0, n)
    return { rounds: n, seconds: null, content: { items: qs.map((x): TextItem & { real: string } => ({ type: 'text', prompt: x.q, placeholder: 'أضحك إجابة غلط…', real: x.a })) } }
  },
  summarize: (ctx) => {
    const scores = emptyScores(ctx.players)
    for (const a of ctx.answers) if (a.rating) scores[a.player_id] += Number(a.rating)
    return { scores, unit: 'نجمة ⭐', headline: winnerHeadline(scores, ctx.players, '{name} أخف دم! 🤣'), celebrate: true }
  },
}

/* =========================== ٢٠ سؤال =========================== */
const twenty: GameDef = {
  id: 'twenty',
  title: '٢٠ سؤال',
  tagline: 'في بالي شي… اعرفه بأسئلة "إيه أو لا"',
  emoji: '❓',
  categories: ['acquaint', 'compete'],
  accent: ['#6d6bff', '#29c4e6'],
  minutes: '6–15 د',
  badge: 'new',
  voice: true,
  stakes: true,
  howTo: [
    'واحد يختار شي في باله (من الفئة اللي تطلع) ويكتبه سرًا.',
    'الثاني يسأل بالصوت أسئلة جوابها "إيه" أو "لا".',
    'اللي في باله الشي يضغط الجواب، والعداد ينقص.',
    'عرفها بأقل أسئلة = نقاط أكثر. ما عرفها في ٢٠؟ النقاط لصاحب السر!',
  ],
  mode: 'turns',
  renderer: 'twenty',
  setup: [turnsOpt('2', ['2', '4', '6'])],
  build: (o, rng) => {
    const n = N(o, 'turns', 2)
    return { rounds: n, seconds: null, content: { free: true, turns: n, cats: pick(twentyCategories, n, rng) } }
  },
  summarize: (ctx) => {
    const scores = emptyScores(ctx.players)
    const lines: string[] = []
    const turns = Number(ctx.session.content?.turns ?? 0)
    for (let t = 1; t <= turns; t++) {
      const set = ctx.moves.find((m) => m.move.kind === 'secret_set' && m.move.slot === `t${t}`)
      if (!set) continue
      const chooser = set.player_id
      const asker = otherOf(chooser, ctx.players)!
      const asked = ctx.moves.filter((m) => m.move.kind === 'ans' && Number(m.move.turn) === t).length
      const solved = ctx.moves.some((m) => (m.move.kind === 'guess' && m.move.slot === `t${t}` && m.move.correct) || (m.move.kind === 'got' && Number(m.move.turn) === t))
      const val = ctx.moves.find((m) => (m.move.kind === 'reveal' || (m.move.kind === 'guess' && m.move.correct)) && m.move.slot === `t${t}`)?.move.value
      const revealed = ctx.moves.some((m) => m.move.kind === 'reveal' && m.move.slot === `t${t}`)
      if (!solved && !revealed) continue
      if (solved) {
        scores[asker] += Math.max(1, 21 - asked)
        lines.push(`${nameOf(asker, ctx.players)} عرف «${val ?? '؟'}» بعد ${asked} سؤال 🎯`)
      } else {
        scores[chooser] += 10
        lines.push(`«${val ?? '؟'}» — ${nameOf(asker, ctx.players)} ما عرفها 😏`)
      }
    }
    return { scores, unit: 'نقطة', headline: winnerHeadline(scores, ctx.players), lines, celebrate: true }
  },
}

/* =========================== ضغطة الانعكاس =========================== */
const reflex: GameDef = {
  id: 'reflex',
  title: 'ضغطة الانعكاس',
  tagline: 'أسرع واحد يضغط… بس انتبه للخدع!',
  emoji: '⚡',
  categories: ['quick', 'compete', 'laugh'],
  accent: ['#22c55e', '#ffc861'],
  minutes: '2–4 د',
  badge: 'new',
  stakes: true,
  howTo: ['الشاشة تتغير فجأة عند الاثنين بنفس اللحظة.', 'اضغط أول ما يطلع المطلوب بالضبط.', 'انتبه! فيه ألوان وإيموجي وكلمات تخدعك — الضغط الغلط يخسّرك الجولة.', 'الأسرع يكسب الجولة.'],
  mode: 'rounds',
  renderer: 'reflex',
  setup: [sel('rounds', 'عدد الجولات', '7', [['5', '5 جولات'], ['7', '7 جولات'], ['10', '10 جولات']])],
  build: (o, rng) => {
    const n = N(o, 'rounds', 7)
    return { rounds: n, seconds: 10, content: { items: Array.from({ length: n }, () => makeReflex(rng)) } }
  },
  summarize: (ctx) => {
    const [p1, p2] = ctx.players.map((p) => p.user_id)
    const scores = emptyScores(ctx.players)
    const best: Record<string, number> = {}
    for (const [, m] of byRound(ctx.answers)) {
      const v = (id: string) => {
        const a = m.get(id)?.answer
        return a && !a.early && typeof a.rt === 'number' ? Number(a.rt) : Infinity
      }
      const a = v(p1)
      const b = v(p2)
      for (const [id, x] of [
        [p1, a],
        [p2, b],
      ] as const)
        if (x < (best[id] ?? Infinity)) best[id] = x
      if (a === Infinity && b === Infinity) continue
      if (a < b) scores[p1]++
      else if (b < a) scores[p2]++
    }
    return {
      scores,
      unit: 'جولة',
      headline: winnerHeadline(scores, ctx.players, '{name} أسرع من البرق ⚡'),
      lines: ctx.players.filter((p) => best[p.user_id] !== undefined).map((p) => `أسرع ضغطة لـ${p.nickname}: ${best[p.user_id]} جزء من الثانية (ms)`),
      celebrate: true,
    }
  },
}

/* =========================== معركة المدح =========================== */
const compliments: GameDef = {
  id: 'compliments',
  title: 'معركة المدح',
  tagline: 'مدحة منك ومدحة مني… واللي يسكت يخسر 💘',
  emoji: '💘',
  categories: ['romance', 'compete'],
  accent: ['#f0509a', '#8b5cf6'],
  minutes: '5–8 د',
  badge: 'new',
  featured: true,
  howTo: ['كل دور: اكتب مدحة لشريكك قبل ما يخلص الوقت (فيه موضوع يلهمك).', 'ممنوع تكرر نفس المدحة!', 'شريكك يقدر يعطيك ❤️ على المدحة اللي ذوّبته.', 'النقاط = عدد المدحات + القلوب اللي جاتك.'],
  mode: 'turns',
  renderer: 'compliments',
  setup: [sel('total', 'عدد المدحات لكل واحد', '6', [['4', '4'], ['6', '6'], ['10', '10']]), secsOpt('25', ['15', '25', '40'])],
  build: (o, rng) => {
    const t = N(o, 'total', 6)
    return { rounds: t * 2, seconds: null, content: { free: true, total: t, seconds: N(o, 'secs', 25), topics: pick(complimentTopics, t * 2, rng) } }
  },
  summarize: (ctx) => {
    const scores = emptyScores(ctx.players)
    const hearts = emptyScores(ctx.players)
    for (const m of ctx.moves) {
      if (m.move.kind === 'c') scores[m.player_id]++
      if (m.move.kind === 'react') {
        const to = String(m.move.to)
        scores[to] = (scores[to] ?? 0) + 1
        hearts[to] = (hearts[to] ?? 0) + 1
      }
    }
    return {
      scores,
      unit: 'نقطة حب',
      headline: winnerHeadline(scores, ctx.players, '{name} أحلى لسان 🍯', 'تعادل… الحب ما فيه خسران 💞'),
      lines: ctx.players.map((p) => `${p.nickname} جاه ${hearts[p.user_id] ?? 0} ❤️`),
      celebrate: true,
    }
  },
}

/* =========================== نخطط حلمنا =========================== */
export type DreamItem = { type: 'dream'; prompt: string; e: string; o: { t: string; c: number }[] }
export function dreamFlip(sessionId: string, round: number) {
  let h = 0
  const s = `${sessionId}:${round}`
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 2
}
const dream: GameDef = {
  id: 'dream',
  title: 'نخطط حلمنا',
  tagline: 'رحلة، بيت، سهرة… بميزانية وحدة 💰',
  emoji: '🏝️',
  categories: ['romance', 'acquaint'],
  accent: ['#29c4e6', '#f0509a'],
  minutes: '5–8 د',
  badge: 'new',
  howTo: [
    'اختاروا وش تخططون: رحلة، بيت، يوم مثالي، حفلة، أو سهرتكم الجاية.',
    'كل خطوة فيها ٤ خيارات، وكل خيار له تكلفة 💰 من ميزانيتك.',
    'إذا اخترتوا نفس الشي = "اتفقنا 💞". إذا اختلفتوا… القرعة تختار 🎲',
    'في النهاية: خطة حلمكم كاملة، وتقدرون تحفظونها.',
  ],
  mode: 'rounds',
  renderer: 'dream',
  setup: [sel('plan', 'وش نخطط؟', 'trip', dreamPlans.map((p) => [p.id, `${p.emoji} ${p.label}`]))],
  build: (o) => {
    const plan = dreamPlans.find((p) => p.id === o.plan) ?? dreamPlans[0]
    const its: DreamItem[] = plan.steps.map((s) => ({ type: 'dream', prompt: s.q, e: s.e, o: s.o }))
    const budget = Math.round(plan.steps.length * 2.4)
    return { rounds: its.length, seconds: null, content: { items: its, plan: plan.id, label: plan.label, emoji: plan.emoji, intro: plan.intro, budget } }
  },
  summarize: (ctx) => {
    const [p1, p2] = ctx.players.map((p) => p.user_id)
    const its = (ctx.session.content?.items ?? []) as DreamItem[]
    let agree = 0
    const lines: string[] = []
    for (const [r, m] of byRound(ctx.answers)) {
      const it = its[r - 1]
      const a = m.get(p1)?.answer?.choice
      const b = m.get(p2)?.answer?.choice
      if (!it || a === undefined || b === undefined) continue
      if (a === b) {
        agree++
        lines.push(`${it.e} ${it.prompt} ${it.o[a]?.t} 💞`)
      } else lines.push(`${it.e} ${it.prompt} ${it.o[dreamFlip(ctx.session.id, r) ? b : a]?.t} 🎲`)
    }
    const p = pct(agree, Math.max(1, lines.length))
    return { percent: p, percentLabel: 'نسبة اتفاقكم', headline: `${ctx.session.content?.emoji ?? '✨'} ${ctx.session.content?.label ?? 'خطتكم'} جاهزة!`, lines, celebrate: p >= 50 }
  },
}

/* =========================== راهن على شريكك =========================== */
export type BetItem = { type: 'bet'; prompt: string; options: string[] }
export function betChips(ctx: SummaryCtx) {
  const [p1, p2] = ctx.players.map((p) => p.user_id)
  const chips: Record<string, number> = { [p1]: 100, [p2]: 100 }
  for (const [, m] of [...byRound(ctx.answers)].sort((x, y) => x[0] - y[0])) {
    const a = m.get(p1)?.answer
    const b = m.get(p2)?.answer
    if (!a || !b) continue
    for (const [me, mine, theirs] of [
      [p1, a, b],
      [p2, b, a],
    ] as const) {
      const bet = Math.min(Number(mine.bet ?? 0), chips[me])
      chips[me] += mine.guess === theirs.self ? bet : -bet
    }
  }
  return chips
}
const bet: GameDef = {
  id: 'bet',
  title: 'راهن على شريكك',
  tagline: 'تعرفه؟ راهن بنقاطك!',
  emoji: '🎰',
  categories: ['compete', 'acquaint', 'romance'],
  accent: ['#ffc861', '#8b5cf6'],
  minutes: '6–10 د',
  badge: 'new',
  featured: true,
  stakes: true,
  howTo: [
    'كل واحد يبدأ بـ ١٠٠ نقطة 🪙',
    'كل جولة: جاوب عن نفسك، وتوقع جواب شريكك، وراهن على توقعك.',
    'توقعك صح؟ تكسب رهانك. غلط؟ تخسره!',
    'الأكثر نقاط في النهاية يفوز.',
  ],
  mode: 'rounds',
  renderer: 'bet',
  setup: [sel('rounds', 'عدد الجولات', '8', [['5', '5 جولات'], ['8', '8 جولات'], ['12', '12 جولة']])],
  build: (o, rng) => {
    const n = N(o, 'rounds', 8)
    return { rounds: n, seconds: null, content: { items: pick(allKnowMe, n, rng).map((x): BetItem => ({ type: 'bet', prompt: x.q, options: [...x.o] })) } }
  },
  summarize: (ctx) => {
    const chips = betChips(ctx)
    return { scores: chips, unit: 'نقطة 🪙', headline: winnerHeadline(chips, ctx.players, '{name} يعرفك وكسب الرهان! 🎰'), celebrate: true }
  },
}

/* =========================== كذّاب =========================== */
const liar: GameDef = {
  id: 'liar',
  title: 'كذّاب 🎲',
  tagline: 'نرد مخفي، مزايدة، وكشف الكذب!',
  emoji: '🎲',
  categories: ['compete', 'laugh'],
  accent: ['#ef4444', '#6d6bff'],
  minutes: '8–15 د',
  badge: 'new',
  stakes: true,
  howTo: [
    'كل واحد يرمي نرده — تشوف نردك بس، ونرد شريكك مخفي.',
    'بالدور: تزايد على كل النرد اللي على الطاولة، مثلًا "فيه ٣ نردات على ٥".',
    'المزايدة الجاية لازم تكون أعلى (عدد أكبر، أو نفس العدد بوجه أعلى).',
    'ما صدقت شريكك؟ اضغط "كذّاب!" وينكشف كل النرد. اللي غلطان يخسر نرد.',
    'اللي يخلص نرده أول يخسر اللعبة.',
  ],
  mode: 'turns',
  renderer: 'liar',
  setup: [sel('dice', 'عدد النرد لكل واحد', '4', [['3', '3 (سريعة)'], ['4', '4'], ['5', '5 (طويلة)']])],
  build: (o) => ({ rounds: 1, seconds: null, content: { start: Math.min(5, Math.max(2, N(o, 'dice', 4))) } }),
  summarize: (ctx) => {
    const st = liarReplay(ctx.moves, ctx.players, Number(ctx.session.content?.start ?? 4))
    return {
      scores: st.dice,
      unit: 'نرد باقي',
      headline: st.over ? `${nameOf(st.over, ctx.players)} أشطر كذّاب! 🎲` : winnerHeadline(st.dice, ctx.players),
      lines: st.history.map((h) => `جولة ${h.round}: ${h.count} × ${'⚀⚁⚂⚃⚄⚅'[h.bid.f - 1]} (المزايدة ${h.bid.q}) — خسر ${nameOf(h.loser, ctx.players)}`),
      celebrate: true,
    }
  },
}

/* =========================== النقاط والمربعات =========================== */
const dots: GameDef = {
  id: 'dots',
  title: 'النقاط والمربعات',
  tagline: 'خط بخط… واللي يقفل المربع ياخذه!',
  emoji: '🔲',
  categories: ['compete', 'memory'],
  accent: ['#8b5cf6', '#29c4e6'],
  minutes: '5–10 د',
  badge: 'new',
  stakes: true,
  howTo: ['بالدور: ارسم خط بين نقطتين متجاورتين.', 'إذا قفلت مربع ياخذ لونك وتلعب مرة ثانية!', 'انتبه لا تعطي شريكك الخط الثالث 😏', 'أكثر مربعات يفوز.'],
  mode: 'turns',
  renderer: 'dots',
  setup: [sel('size', 'حجم اللوحة', '4', [['3', 'صغيرة 3×3'], ['4', 'متوسطة 4×4'], ['5', 'كبيرة 5×5']])],
  build: (o) => ({ rounds: 1, seconds: null, content: { size: Math.min(6, Math.max(2, N(o, 'size', 4))) } }),
  summarize: (ctx) => {
    const st = dotsReplay(ctx.moves, Number(ctx.session.content?.size ?? 4))
    const scores = { ...emptyScores(ctx.players), ...st.scores }
    return { scores, unit: 'مربع', headline: winnerHeadline(scores, ctx.players), celebrate: true }
  },
}

/* =========================== أربعة في صف =========================== */
const connect4: GameDef = {
  id: 'connect4',
  title: 'أربعة في صف',
  tagline: 'أول واحد يصف ٤… يفوز!',
  emoji: '🔴',
  categories: ['compete', 'quick'],
  accent: ['#ef4444', '#facc15'],
  minutes: '3–10 د',
  badge: 'new',
  stakes: true,
  howTo: ['بالدور: اختر عمود وتنزل قطعتك لتحت.', 'أول واحد يصف ٤ قطع (أفقي، عمودي، أو مايل) يفوز.', 'في "أفضل من ٣": اللي يفوز بمباراتين أول.'],
  mode: 'turns',
  renderer: 'connect4',
  setup: [sel('best', 'المباريات', '3', [['1', 'مباراة وحدة'], ['3', 'أفضل من ٣'], ['5', 'أفضل من ٥']])],
  build: (o) => ({ rounds: 1, seconds: null, content: { best: N(o, 'best', 3) } }),
  summarize: (ctx) => {
    const st = c4Replay(ctx.moves)
    const scores = { ...emptyScores(ctx.players), ...st.wins }
    return { scores, unit: 'فوز', headline: winnerHeadline(scores, ctx.players), celebrate: true }
  },
}

/* =========================== سلسلة الكلمات =========================== */
const chain: GameDef = {
  id: 'chain',
  title: 'سلسلة الكلمات',
  tagline: 'كلمتك تبدأ بآخر حرف من كلمته… والوقت يقصر!',
  emoji: '🔗',
  categories: ['compete', 'quick'],
  accent: ['#22c55e', '#8b5cf6'],
  minutes: '4–8 د',
  badge: 'new',
  stakes: true,
  howTo: [
    'اكتب كلمة تبدأ بآخر حرف من كلمة شريكك.',
    'ممنوع تكرر كلمة انقالت، والوقت يقصر كل ما طالت السلسلة ⏱️',
    'خلص وقتك؟ نقطة لشريكك. شريكك كتب كلمة مو حقيقية أو مو من الفئة؟ اضغط "اعتراض ✋".',
    'أول واحد يوصل للنقاط المطلوبة يفوز.',
  ],
  mode: 'turns',
  renderer: 'chain',
  setup: [
    sel('cat', 'الفئة', 'any', [['any', 'أي كلمة'], ['أكلات', 'أكلات 🍽️'], ['حيوانات', 'حيوانات 🐾'], ['دول ومدن', 'دول ومدن 🌍'], ['أسماء', 'أسماء أشخاص 👤']]),
    sel('target', 'الفوز عند', '3', [['3', '3 نقاط'], ['5', '5 نقاط']]),
  ],
  build: (o) => ({ rounds: 1, seconds: null, content: { free: true, cat: o.cat === 'any' ? null : o.cat, target: N(o, 'target', 3) } }),
  summarize: (ctx) => {
    const st = chainReplay(ctx.moves)
    const scores = { ...emptyScores(ctx.players), ...st.points }
    const words = mv(ctx, 'word').length
    return { scores, unit: 'نقطة', headline: winnerHeadline(scores, ctx.players), lines: [`قلتوا ${words} كلمة 🔗`], celebrate: true }
  },
}

/* =========================== خزنة الكنز =========================== */
const vault: GameDef = {
  id: 'vault',
  title: 'خزنة الكنز',
  tagline: 'كل واحد عنده نص التلميحات… افتحوها مع بعض!',
  emoji: '🔐',
  categories: ['memory', 'romance', 'compete'],
  accent: ['#ffc861', '#7040e0'],
  minutes: '6–15 د',
  badge: 'new',
  featured: true,
  voice: true,
  howTo: [
    'لعبة تعاون: أنتم فريق واحد ضد الخزنة 🤝',
    'كل واحد يشوف نص التلميحات بس — والثاني يشوف النص الثاني.',
    'تكلموا وفكروا مع بعض لين تعرفون الرقم السري.',
    'أي واحد يقدر يكتب الرقم. حاولوا تفتحون كل الخزائن بأقل وقت!',
  ],
  mode: 'turns',
  renderer: 'vault',
  setup: [sel('n', 'عدد الخزائن', '3', [['2', '2'], ['3', '3'], ['5', '5']]), sel('digits', 'الصعوبة', '3', [['3', 'عادية (٣ أرقام)'], ['4', 'صعبة (٤ أرقام)']]), sel('secs', 'الوقت لكل خزنة', '180', [['120', 'دقيقتين'], ['180', '٣ دقايق'], ['300', '٥ دقايق']])],
  build: (o, rng) => {
    const n = N(o, 'n', 3)
    const digits = (N(o, 'digits', 3) === 4 ? 4 : 3) as 3 | 4
    const secrets: { slot: string; owner: string; value: unknown }[] = []
    for (let i = 1; i <= n; i++) {
      const v = makeVault(rng, digits)
      secrets.push({ slot: `c${i}a`, owner: 'first', value: v.a }, { slot: `c${i}b`, owner: 'second', value: v.b }, { slot: `k${i}`, owner: 'none', value: v.code })
    }
    return { rounds: n, seconds: null, content: { free: true, n, digits, seconds: N(o, 'secs', 180), _secrets: secrets } }
  },
  summarize: (ctx) => {
    const n = Number(ctx.session.content?.n ?? 0)
    let opened = 0
    let total = 0
    const lines: string[] = []
    for (let i = 1; i <= n; i++) {
      const start = ctx.moves.find((m) => m.move.kind === 'start' && Number(m.move.v) === i)
      const ok = ctx.moves.find((m) => m.move.kind === 'guess' && m.move.slot === `k${i}` && m.move.correct)
      const tries = ctx.moves.filter((m) => m.move.kind === 'guess' && m.move.slot === `k${i}`).length
      if (ok && start) {
        opened++
        const s = Math.round((new Date(ok.created_at).getTime() - new Date(start.created_at).getTime()) / 1000)
        total += s
        lines.push(`🔓 الخزنة ${i}: انفتحت في ${s} ثانية (${tries} محاولة)`)
      } else if (start) lines.push(`🔒 الخزنة ${i}: ما انفتحت`)
    }
    const p = pct(opened, n)
    return { percent: p, percentLabel: `فتحتوا ${opened} من ${n}`, headline: p === 100 ? 'فريق أسطوري! 🏆💞' : opened ? 'شغل حلو يا فريق 🤝' : 'الخزنة كسبت هالمرة 😅', lines, celebrate: p >= 50, note: opened ? `مجموع الوقت: ${total} ثانية` : undefined }
  },
}

export const newGames: GameDef[] = [
  drawGuess,
  drawDescribe,
  drawContinue,
  taboo,
  act,
  hum,
  twoTruths,
  wordRace,
  noLaugh,
  forbidden,
  tongue,
  dumb,
  twenty,
  reflex,
  compliments,
  dream,
  bet,
  liar,
  dots,
  connect4,
  chain,
  vault,
]
