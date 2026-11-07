import type { CategoryId, ChoiceItem, GameDef, RankItem, RoundItem, Summary, SummaryCtx, TextItem } from './types'
import { shuffle, type Rng } from '../utils/random'
import { fresh as pick } from './engine/fresh'
import { dares, tdLevels, truths, type TdLevel } from './content/truthDare'
import { moreDares, moreTruths } from './content/truthDareMore'
import {
  allCompat,
  allEmoji,
  allGuess,
  allKnowMe,
  allNever,
  allQuick,
  allRank,
  allRemember,
  allRiddles,
  allStory,
  allTalk,
  allTF,
  allThisOrThat,
  allWhoMore,
  allWhoMoreBold,
  memoryEmoji,
  talkCategories,
} from './banks'
import { byRound, emptyScores, isSkip, nameOf, otherOf, pct, rankSimilarity, subjectOf, winnerHeadline } from './engine/helpers'
import { newGames } from './defs2'

export const categories: { id: CategoryId; label: string; emoji: string }[] = [
  { id: 'laugh', label: 'ضحك', emoji: '😂' },
  { id: 'romance', label: 'رومانسية', emoji: '💞' },
  { id: 'compete', label: 'تحدي', emoji: '🏆' },
  { id: 'acquaint', label: 'نعرف بعض', emoji: '💬' },
  { id: 'deep', label: 'سوالف عميقة', emoji: '🌌' },
  { id: 'memory', label: 'ذكاء وذاكرة', emoji: '🧠' },
  { id: 'quick', label: 'سريعة', emoji: '⚡' },
]

export const roundsOpt = (def: string, values = ['6', '10', '14'], label = 'عدد الجولات', unit = 'جولات') => ({
  key: 'rounds',
  label,
  kind: 'select' as const,
  default: def,
  options: values.map((v) => ({ value: v, label: `${v} ${unit}` })),
})

export const N = (o: Record<string, string>, key: string, d: number) => {
  const n = parseInt(o[key] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : d
}

export function mcq(rng: Rng, q: string, a: string, w: string[], extra: Partial<ChoiceItem> = {}): ChoiceItem {
  const options = shuffle([a, ...w], rng)
  return { type: 'choice', prompt: q, options, correct: options.indexOf(a), ...extra }
}

const items = (s: SummaryCtx) => (s.session.content?.items ?? []) as RoundItem[]

/** نتائج الألعاب ذات الإجابة الصحيحة */
function quizSummary(ctx: SummaryCtx, points: (ms: number, item: ChoiceItem) => number, unit = 'نقطة'): Summary {
  const scores = emptyScores(ctx.players)
  const its = items(ctx)
  for (const a of ctx.answers) {
    const it = its[a.round - 1] as ChoiceItem | undefined
    if (it?.type === 'choice' && typeof a.answer?.choice === 'number' && a.answer.choice === it.correct) {
      scores[a.player_id] = (scores[a.player_id] ?? 0) + points(Number(a.answer._ms ?? 0), it)
    }
  }
  return { scores, unit, headline: winnerHeadline(scores, ctx.players), celebrate: true }
}

function talkSummary(ctx: SummaryCtx): Summary {
  const answered = ctx.answers.filter((a) => !isSkip(a)).length
  const voice = ctx.answers.filter((a) => a.answer?.voice).length
  return {
    headline: 'سوالف حلوة! 💬',
    lines: [`كتبتم ${answered} إجابة`, ...(voice ? [`و${voice} سؤال تكلمتم عنه بالصوت`] : [])],
    note: 'لا يوجد فائز هنا… الهدف إنكم تعرفون بعض أكثر.',
  }
}

/* ---------------- قد إيش تعرفني: اختيارات + كتابة + ذاكرة ---------------- */
function knowMeItemsFor(style: string, n: number, rng: Rng): { items: RoundItem[]; shareCount?: number } {
  const choice = (k: number) => pick(allKnowMe, k, rng).map((x): ChoiceItem => ({ type: 'choice', prompt: x.q, options: [...x.o], guess: true, tag: 'اختيارات' }))
  const write = (k: number) => pick(allGuess, k, rng).map((q): TextItem => ({ type: 'text', prompt: q, guess: true, judge: 'subject', placeholder: 'إجابة قصيرة…', tag: 'اكتب توقعك' }))
  if (style === 'write') return { items: write(n) }
  if (style === 'memory') {
    const k = Math.max(3, Math.round(n / 2))
    const ps = pick(allRemember, k, rng)
    const share: TextItem[] = ps.map((q) => ({ type: 'text', prompt: q, tag: 'شارك 📝', placeholder: 'إجابة قصيرة وواضحة…' }))
    const order = shuffle(
      ps.map((_, i) => i),
      rng,
    )
    const recall: TextItem[] = order.map((i) => ({ type: 'text', prompt: ps[i], recallOf: i + 1, judge: 'mutual', tag: 'تذكّر 🧠', placeholder: 'وش قال شريكك؟' }))
    return { items: [...share, ...recall], shareCount: k }
  }
  if (style === 'mix') {
    // جولتين اختيارات ثم جولتين كتابة… حتى يتبادل الاثنين كل نوع
    const c = choice(Math.ceil(n / 2))
    const w = write(Math.floor(n / 2))
    const out: RoundItem[] = []
    for (let r = 0; out.length < n; r++) {
      const src = Math.floor(r / 2) % 2 === 0 ? c : w
      const alt = src === c ? w : c
      const it = src.shift() ?? alt.shift()
      if (!it) break
      out.push(it)
    }
    return { items: out }
  }
  return { items: choice(n) }
}

function knowMeSummary(ctx: SummaryCtx): Summary {
  const its = items(ctx)
  const scores = emptyScores(ctx.players)
  const share = Number(ctx.session.content?.shareCount ?? 0)
  for (const [r, m] of byRound(ctx.answers)) {
    const it = its[r - 1]
    if (!it) continue
    if (it.type === 'choice' && it.guess) {
      const subject = subjectOf(r, ctx.players)
      const guesser = otherOf(subject, ctx.players)
      if (!subject || !guesser) continue
      const s = m.get(subject)
      const g = m.get(guesser)
      if (s && g && s.answer.choice === g.answer.choice) scores[guesser]++
    } else if (it.type === 'text' && (it.judge === 'subject' || (it.recallOf && r > share))) {
      for (const a of m.values()) if (a.judged === true) scores[a.player_id]++
    }
  }
  return { scores, unit: 'نقطة', headline: winnerHeadline(scores, ctx.players, '{name} يعرفك أكثر! 🏆'), celebrate: true }
}

/* ---------------- ذوقنا: خيارين + أسلوب حياة + ترتيب ---------------- */
function tasteItems(style: string, n: number, rng: Rng): RoundItem[] {
  const q = (k: number) => pick(allThisOrThat, k, rng).map((x): ChoiceItem => ({ type: 'choice', prompt: 'وش تختار؟', options: [...x], tag: 'اختار واحد' }))
  const l = (k: number) => pick(allCompat, k, rng).map((x): ChoiceItem => ({ type: 'choice', prompt: x.q, options: [...x.o], tag: 'أسلوب حياة' }))
  const r = (k: number) => pick(allRank, k, rng).map((x): RankItem => ({ type: 'rank', prompt: x.q, options: [...x.o] }))
  if (style === 'quick') return q(n)
  if (style === 'life') return l(n)
  if (style === 'rank') return r(n)
  const a = Math.ceil(n * 0.45)
  const b = Math.ceil(n * 0.35)
  return shuffle([...q(a), ...l(b), ...r(Math.max(1, n - a - b))], rng).slice(0, n)
}
function tasteSummary(ctx: SummaryCtx): Summary {
  const its = items(ctx)
  const [p1, p2] = ctx.players.map((p) => p.user_id)
  const sims: number[] = []
  for (const [r, m] of byRound(ctx.answers)) {
    const a = m.get(p1)
    const b = m.get(p2)
    if (isSkip(a) || isSkip(b)) continue
    const it = its[r - 1]
    if (it?.type === 'rank' && Array.isArray(a!.answer.order) && Array.isArray(b!.answer.order)) sims.push(rankSimilarity(a!.answer.order, b!.answer.order))
    else sims.push(a!.answer.choice === b!.answer.choice ? 100 : 0)
  }
  const p = sims.length ? Math.round(sims.reduce((x, y) => x + y, 0) / sims.length) : 0
  return {
    percent: p,
    percentLabel: 'نسبة تشابه الذوق',
    headline: p >= 80 ? 'نسخة طبق الأصل! 😍' : p >= 60 ? 'متفاهمين جدًا 💜' : p >= 40 ? 'توازن حلو بين الشبه والاختلاف' : 'الاختلاف يحلّي السوالف 😄',
    lines: [`قارنتوا ذوقكم في ${sims.length} سؤال`],
    celebrate: p >= 60,
    note: 'نتيجة ترفيهية فقط.',
  }
}

const levelOpt = {
  key: 'level',
  label: 'المستوى',
  kind: 'select' as const,
  default: 'normal',
  options: [
    { value: 'normal', label: 'عادي 🙂' },
    { value: 'mix', label: 'منوّع' },
    { value: 'bold', label: 'جريء 🔥' },
  ],
}

const defs: GameDef[] = [
  {
    id: 'know-me',
    title: 'قد إيش تعرفني؟',
    tagline: 'اختيارات، كتابة، أو اختبار ذاكرة',
    emoji: '🔍',
    categories: ['acquaint', 'compete', 'romance'],
    accent: ['#8b5cf6', '#f0509a'],
    minutes: '5–15 د',
    badge: 'popular',
    featured: true,
    stakes: true,
    howTo: [
      'في كل جولة سؤال عن واحد منكم، والأدوار تتبدل.',
      'صاحب السؤال يجاوب عن نفسه، والثاني يتوقع (باختيار أو بالكتابة).',
      'في "اختبار الذاكرة": تشاركون تفاصيل عن نفسكم… وبعدين نسألك وش قال شريكك!',
      'كل توقع صحيح = نقطة.',
    ],
    mode: 'rounds',
    renderer: 'pair',
    setup: [
      {
        key: 'style',
        label: 'طريقة اللعب',
        kind: 'select',
        default: 'mix',
        options: [
          { value: 'mix', label: 'منوّع ✨' },
          { value: 'choice', label: 'اختيارات 🔘' },
          { value: 'write', label: 'تكتب توقعك ✍️' },
          { value: 'memory', label: 'اختبار الذاكرة 🧠' },
        ],
      },
      roundsOpt('10', ['6', '10', '14']),
    ],
    build: (o, rng) => {
      const n = N(o, 'rounds', 10)
      const res = knowMeItemsFor(o.style ?? 'mix', n, rng)
      return { rounds: res.items.length, seconds: null, content: { items: res.items, style: o.style ?? 'mix', shareCount: res.shareCount } }
    },
    summarize: knowMeSummary,
  },
  {
    id: 'talk',
    title: 'سوالف',
    tagline: 'أسئلة تفتح قلوبكم… بأي مستوى تبون',
    emoji: '🌙',
    categories: ['deep', 'romance', 'acquaint'],
    accent: ['#3b2a8f', '#8b5cf6'],
    minutes: '10–40 د',
    featured: true,
    howTo: ['اختاروا نوع الأسئلة (أو أضيفوا أسئلتكم الخاصة).', 'كل واحد يكتب إجابته، أو تختارون "نتكلم بالصوت".', 'الإجابتين تظهر مع بعض.', 'تقدرون تتخطون أي سؤال.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [
      {
        key: 'cat',
        label: 'نوع الأسئلة',
        kind: 'select',
        default: 'all',
        options: [{ value: 'all', label: 'منوّع ✨' }, ...talkCategories.map((c) => ({ value: c, label: c }))],
      },
      roundsOpt('6', ['4', '6', '10']),
      { key: 'custom', label: 'أسئلتك الخاصة (اختياري — سؤال في كل سطر)', kind: 'textarea', placeholder: 'مثال: وش أكثر شي تحبه في نهاية الأسبوع؟', maxLines: 5, maxLen: 140 },
    ],
    build: (o, rng) => {
      const n = N(o, 'rounds', 6)
      const custom = (o.custom ?? '')
        .split('\n')
        .map((s) => s.trim().slice(0, 140))
        .filter(Boolean)
        .slice(0, 5)
      const pool = o.cat && o.cat !== 'all' ? allTalk.filter((t) => t.c === o.cat) : allTalk.filter((t) => t.c !== 'جريئة 🔥')
      const sel = [...custom.map((q) => ({ q, c: 'سؤال خاص 💌' })), ...pick(pool, Math.max(0, n - custom.length), rng)]
      return {
        rounds: sel.length,
        seconds: null,
        content: {
          items: sel.map(
            (x): TextItem => ({ type: 'text', prompt: x.q, tag: x.c, skippable: true, placeholder: x.c === 'كمّلها ✍️' ? 'كمّل الجملة…' : 'اكتب من قلبك…' }),
          ),
        },
      }
    },
    summarize: talkSummary,
  },
  {
    id: 'taste',
    title: 'ذوقنا',
    tagline: 'خيارين، أسلوب حياة، وترتيب… كم تتشابهون؟',
    emoji: '⚖️',
    categories: ['acquaint', 'romance', 'quick'],
    accent: ['#6d6bff', '#f0509a'],
    minutes: '5–10 د',
    howTo: ['كل جولة: اختيار بين شيئين، أو سؤال عن أسلوب حياتك، أو ترتيب ٤ أشياء.', 'كل واحد يجاوب بدون ما يشوف الثاني.', 'في النهاية: نسبة تشابه ذوقكم.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [
      {
        key: 'style',
        label: 'نوع الأسئلة',
        kind: 'select',
        default: 'mix',
        options: [
          { value: 'mix', label: 'منوّع ✨' },
          { value: 'quick', label: 'اختار واحد ⚖️' },
          { value: 'life', label: 'أسلوب حياة 🏡' },
          { value: 'rank', label: 'رتبها 📊' },
        ],
      },
      roundsOpt('10', ['6', '10', '16']),
    ],
    build: (o, rng) => {
      const it = tasteItems(o.style ?? 'mix', N(o, 'rounds', 10), rng)
      return { rounds: it.length, seconds: null, content: { items: it } }
    },
    summarize: tasteSummary,
  },
  {
    id: 'truth-dare',
    title: 'صراحة أو تحدي',
    tagline: 'اختر: تعترف ولا تتحدى؟',
    emoji: '🎭',
    categories: ['laugh', 'romance', 'deep'],
    accent: ['#f0509a', '#ff9a62'],
    minutes: '10–20 د',
    badge: 'popular',
    featured: true,
    howTo: ['صاحب الدور يختار صراحة أو تحدي.', 'تظهر البطاقة للاثنين، وينفذها صاحب الدور.', 'تقدر تتخطى أي بطاقة بدون أي إحراج أو خصم.', 'بعدها ينتقل الدور للثاني.'],
    mode: 'turns',
    renderer: 'truthdare',
    setup: [
      {
        key: 'level',
        label: 'المستوى',
        kind: 'select',
        default: 'mixed',
        options: [{ value: 'mixed', label: 'منوّع' }, ...tdLevels.map((l) => ({ value: l.id, label: `${l.label} — ${l.hint}` }))],
      },
      roundsOpt('10', ['6', '10', '16'], 'عدد البطاقات', 'بطاقات'),
    ],
    build: (o, rng) => {
      const lv = o.level as TdLevel | 'mixed'
      const levels: TdLevel[] = lv === 'mixed' || !truths[lv as TdLevel] ? ['light', 'funny', 'romantic', 'deep'] : [lv as TdLevel]
      const total = N(o, 'rounds', 10)
      return {
        rounds: total,
        seconds: null,
        content: {
          total,
          truths: pick(levels.flatMap((l) => [...truths[l], ...moreTruths[l]]), 30, rng),
          dares: pick(levels.flatMap((l) => [...dares[l], ...moreDares[l]]), 30, rng),
        },
      }
    },
    summarize: (ctx) => {
      const done = emptyScores(ctx.players)
      let skipped = 0
      for (const m of ctx.moves) {
        if (m.move.kind === 'done') done[m.player_id]++
        if (m.move.kind === 'skip') skipped++
      }
      return {
        scores: done,
        unit: 'بطاقة منفذة',
        headline: 'جولة صراحة ممتعة! 🎭',
        lines: skipped ? [`تخطيتم ${skipped} بطاقة — ولا بأس أبدًا`] : ['ما تخطيتم ولا بطاقة! 🔥'],
      }
    },
  },
  {
    id: 'who-more',
    title: 'مين فينا أكثر؟',
    tagline: 'أنا ولا أنت؟ اختاروا بصراحة',
    emoji: '👉',
    categories: ['laugh', 'romance', 'quick'],
    accent: ['#f0509a', '#ffc861'],
    minutes: '5–8 د',
    howTo: ['تظهر صفة أو موقف.', 'كل واحد يختار: أنا أو شريكي.', 'بعد الكشف تشوفون هل اتفقتم!'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [levelOpt, roundsOpt('12', ['8', '12', '18'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 12)
      const pool = o.level === 'bold' ? allWhoMoreBold : o.level === 'mix' ? [...allWhoMore, ...allWhoMoreBold] : allWhoMore
      return { rounds: n, seconds: null, content: { items: pick(pool, n, rng).map((q): ChoiceItem => ({ type: 'choice', prompt: q, options: [], who: true, tag: allWhoMoreBold.includes(q) ? 'جريء 🔥' : undefined })) } }
    },
    summarize: (ctx) => {
      const [p1, p2] = ctx.players.map((p) => p.user_id)
      const tally = emptyScores(ctx.players)
      let agree = 0,
        total = 0
      for (const [, m] of byRound(ctx.answers)) {
        const a = m.get(p1)?.answer?.who
        const b = m.get(p2)?.answer?.who
        if (!a || !b) continue
        total++
        if (a === b) {
          agree++
          tally[a] = (tally[a] ?? 0) + 1
        }
      }
      const p = pct(agree, total)
      return {
        percent: p,
        percentLabel: 'نسبة الاتفاق',
        scores: tally,
        unit: 'صفة اتفقتم عليها',
        headline: p >= 70 ? 'تعرفون بعض زين! 👏' : 'فيه نقاط تحتاج نقاش 😄',
        lines: [`اتفقتم في ${agree} من ${total}`],
        celebrate: p >= 70,
      }
    },
  },
  {
    id: 'never',
    title: 'عمري ما',
    tagline: 'سويتها ولا عمرك ما سويتها؟',
    emoji: '🙊',
    categories: ['laugh', 'acquaint', 'quick'],
    accent: ['#ff9a62', '#f0509a'],
    minutes: '5–10 د',
    howTo: ['تظهر عبارة تبدأ بـ "عمري ما…".', 'كل واحد يختار: سويتها أو عمري ما سويتها.', 'تقدر تتخطى أي عبارة شخصية.', 'شوفوا وش تشتركون فيه!'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [
      {
        key: 'cat',
        label: 'الفئة',
        kind: 'select',
        default: 'all',
        options: [{ value: 'all', label: 'منوّع' }, ...[...new Set(allNever.map((t) => t.c))].map((c) => ({ value: c, label: c }))],
      },
      roundsOpt('10', ['6', '10', '15']),
    ],
    build: (o, rng) => {
      const pool = o.cat && o.cat !== 'all' ? allNever.filter((t) => t.c === o.cat) : allNever.filter((t) => t.c !== 'جريء 🔥')
      const sel = pick(pool, N(o, 'rounds', 10), rng)
      return {
        rounds: sel.length,
        seconds: null,
        content: { items: sel.map((x): ChoiceItem => ({ type: 'choice', prompt: x.t, options: ['سويتها 🙋', 'عمري ما سويتها 🙅'], skippable: true, tag: x.c })) },
      }
    },
    summarize: (ctx) => {
      const [p1, p2] = ctx.players.map((p) => p.user_id)
      let bothDid = 0,
        bothNever = 0,
        diff = 0
      for (const [, m] of byRound(ctx.answers)) {
        const a = m.get(p1)
        const b = m.get(p2)
        if (isSkip(a) || isSkip(b)) continue
        if (a!.answer.choice === b!.answer.choice) a!.answer.choice === 0 ? bothDid++ : bothNever++
        else diff++
      }
      return { headline: 'اكتشافات جديدة! 🙊', lines: [`سويتوها الاثنين: ${bothDid}`, `ما سويتوها الاثنين: ${bothNever}`, `اختلفتوا في: ${diff}`] }
    },
  },
  {
    id: 'memory',
    title: 'ذاكرة DUO',
    tagline: 'اقلب البطاقات وطابق الأزواج',
    emoji: '🃏',
    categories: ['memory', 'compete'],
    accent: ['#7040e0', '#29c4e6'],
    minutes: '5–8 د',
    stakes: true,
    howTo: ['البطاقات مقلوبة ومرتبة سرًا على الخادم.', 'في دورك اقلب بطاقتين.', 'إذا تطابقت تاخذ نقطة وتكمل دورك.', 'إذا ما تطابقت ينتقل الدور للثاني.'],
    mode: 'turns',
    renderer: 'memory',
    setup: [
      {
        key: 'pairs',
        label: 'حجم اللوحة',
        kind: 'select',
        default: '8',
        options: [
          { value: '6', label: 'صغيرة (12 بطاقة)' },
          { value: '8', label: 'متوسطة (16 بطاقة)' },
          { value: '10', label: 'كبيرة (20 بطاقة)' },
        ],
      },
    ],
    build: (o, rng) => {
      const pairs = Math.min(12, Math.max(4, N(o, 'pairs', 8)))
      return { rounds: 1, seconds: null, content: { pairs, symbols: pick(memoryEmoji, pairs, rng) } }
    },
    summarize: (ctx) => {
      const scores = { ...emptyScores(ctx.players), ...(ctx.session.state?.scores ?? {}) } as Record<string, number>
      return { scores, unit: 'زوج', headline: winnerHeadline(scores, ctx.players, '{name} ذاكرته حديد! 🧠'), celebrate: true }
    },
  },
  {
    id: 'quick',
    title: 'تحدي المعلومات',
    tagline: 'معلومات وألغاز… والأسرع يكسب',
    emoji: '⚡',
    categories: ['quick', 'compete', 'memory'],
    accent: ['#ffc861', '#ff6b6b'],
    minutes: '3–6 د',
    stakes: true,
    howTo: ['سؤال بمؤقت موحد للاثنين.', 'الإجابة الصحيحة = 10 نقاط + نقاط سرعة حتى 10.', 'وقت الإجابة يحسبه الخادم لضمان العدالة.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [
      {
        key: 'type',
        label: 'النوع',
        kind: 'select',
        default: 'mix',
        options: [
          { value: 'mix', label: 'منوّع ✨' },
          { value: 'info', label: 'معلومات عامة 📚' },
          { value: 'riddle', label: 'ألغاز 🤔' },
        ],
      },
      roundsOpt('10', ['6', '10', '15']),
    ],
    build: (o, rng) => {
      const n = N(o, 'rounds', 10)
      const t = o.type ?? 'mix'
      const info = (k: number) => pick(allQuick, k, rng).map((x) => mcq(rng, x.q, x.a, x.w, { tag: 'معلومة' }))
      const rid = (k: number) => pick(allRiddles, k, rng).map((x) => mcq(rng, x.q, x.a, x.w, { tag: 'لغز' }))
      const its = t === 'info' ? info(n) : t === 'riddle' ? rid(n) : shuffle([...info(Math.ceil(n / 2)), ...rid(Math.floor(n / 2))], rng)
      return { rounds: its.length, seconds: t === 'info' ? 15 : t === 'riddle' ? 25 : 20, content: { items: its } }
    },
    summarize: (ctx) => {
      const secs = ctx.session.round_seconds ?? 15
      return quizSummary(ctx, (ms) => 10 + Math.max(0, Math.round(10 * (1 - ms / (secs * 1000)))))
    },
  },
  {
    id: 'sixty',
    title: 'تحدي 60 ثانية',
    tagline: 'صح أو خطأ… أكبر عدد في دقيقة',
    emoji: '⏱️',
    categories: ['quick', 'compete'],
    accent: ['#ff6b6b', '#f0509a'],
    minutes: '1 د',
    stakes: true,
    howTo: ['عندكم 60 ثانية بالضبط.', 'كل واحد يجاوب على أكبر عدد من عبارات صح أو خطأ.', 'تشوف تقدم شريكك مباشرة، والنتائج تظهر بعد انتهاء الوقت.'],
    mode: 'sprint',
    renderer: 'sprint',
    build: (_o, rng) => {
      const sel = pick(allTF, 30, rng)
      return { rounds: sel.length, seconds: 60, content: { items: sel.map((x): ChoiceItem => ({ type: 'choice', prompt: x.s, options: ['صح ✅', 'خطأ ❌'], correct: x.a ? 0 : 1 })) } }
    },
    summarize: (ctx) => {
      const s = quizSummary(ctx, () => 1, 'إجابة صحيحة')
      const answered = emptyScores(ctx.players)
      for (const a of ctx.answers) answered[a.player_id]++
      return { ...s, lines: ctx.players.map((p) => `${p.nickname}: جاوب ${answered[p.user_id]} عبارة`) }
    },
  },
  {
    id: 'number',
    title: 'توقع الرقم',
    tagline: 'رقم سري من 1 إلى 100',
    emoji: '🔢',
    categories: ['compete', 'quick'],
    accent: ['#6d6bff', '#f0509a'],
    minutes: '3–6 د',
    stakes: true,
    howTo: ['واحد يختار رقمًا سريًا من 1 إلى 100 (محفوظ في الخادم، والثاني ما يقدر يشوفه).', 'الثاني يخمن، والخادم يعطيه تلميح: أكبر أو أصغر.', 'عندك 8 محاولات: كل ما خمنت أسرع زادت نقاطك.', 'بعدها تتبدل الأدوار.'],
    mode: 'turns',
    renderer: 'number',
    setup: [
      {
        key: 'rounds',
        label: 'عدد الجولات',
        kind: 'select',
        default: '2',
        options: [
          { value: '2', label: 'جولتان (مرة لكل واحد)' },
          { value: '4', label: '4 جولات' },
        ],
      },
    ],
    build: (o) => ({ rounds: N(o, 'rounds', 2), seconds: null, content: { max: 100, attempts: 8 } }),
    summarize: (ctx) => {
      const scores = emptyScores(ctx.players)
      const lines: string[] = []
      for (const m of ctx.moves) {
        if (m.move.kind === 'guess' && m.move.round_over) {
          if (m.move.solved) scores[m.player_id] += 9 - m.move.attempt
          lines.push(`${nameOf(m.player_id, ctx.players)}: ${m.move.solved ? `عرف الرقم ${m.move.secret} في ${m.move.attempt} محاولات` : `ما عرف الرقم ${m.move.secret}`}`)
        }
      }
      return { scores, unit: 'نقطة', headline: winnerHeadline(scores, ctx.players), lines, celebrate: true }
    },
  },
  {
    id: 'story',
    title: 'نبني قصة',
    tagline: 'جملة منك وجملة مني',
    emoji: '📖',
    categories: ['laugh', 'romance'],
    accent: ['#8b5cf6', '#ffc861'],
    minutes: '8–12 د',
    howTo: ['نبدأ ببداية قصة.', 'كل واحد يضيف جملة بالتناوب (حتى 140 حرف).', 'في النهاية تقرؤون قصتكم كاملة وتقدرون تحفظونها في أرشيفكم.'],
    mode: 'turns',
    renderer: 'story',
    setup: [
      {
        key: 'lines',
        label: 'طول القصة',
        kind: 'select',
        default: '10',
        options: [
          { value: '6', label: 'قصيرة (6 جمل)' },
          { value: '10', label: 'متوسطة (10 جمل)' },
          { value: '16', label: 'طويلة (16 جملة)' },
        ],
      },
    ],
    build: (o, rng) => {
      const total = N(o, 'lines', 10)
      return { rounds: total, seconds: null, content: { total, starter: pick(allStory, 1, rng)[0] } }
    },
    summarize: (ctx) => {
      const lines = ctx.moves.filter((m) => m.move.kind === 'line')
      return { headline: 'قصتكم جاهزة! 📖', lines: [`${lines.length} جملة كتبتوها مع بعض`] }
    },
  },
  {
    id: 'emoji',
    title: 'فك الرموز',
    tagline: 'إيموجي = مثل أو عبارة',
    emoji: '🧩',
    categories: ['quick', 'compete', 'laugh'],
    accent: ['#ffc861', '#29c4e6'],
    minutes: '4–6 د',
    stakes: true,
    howTo: ['تظهر مجموعة إيموجي.', 'اختر المثل أو العبارة اللي تعبر عنها قبل نهاية الوقت.', 'كل إجابة صحيحة = نقطة.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('8', ['6', '8', '12'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 8)
      return { rounds: n, seconds: 25, content: { items: pick(allEmoji, n, rng).map((x) => mcq(rng, 'وش تعني هذي الرموز؟', x.a, x.w, { big: x.e })) } }
    },
    summarize: (ctx) => quizSummary(ctx, () => 1, 'إجابة صحيحة'),
  },
]

/** ترتيب العرض في القائمة */
const order = [
  'draw-guess',
  'know-me',
  'truth-dare',
  'taboo',
  'bet',
  'who-more',
  'no-laugh',
  'reflex',
  'compliments',
  'liar',
  'act',
  'dream',
  'draw-describe',
  'two-truths',
  'talk',
  'connect4',
  'hum',
  'vault',
  'word-race',
  'taste',
  'dumb',
  'forbidden',
  'draw-continue',
  'never',
  'twenty',
  'dots',
  'chain',
  'quick',
  'tongue',
  'memory',
  'story',
  'sixty',
  'emoji',
  'number',
]
const allDefs = [...defs, ...newGames]
export const games: GameDef[] = [...allDefs].sort((a, b) => {
  const ia = order.indexOf(a.id)
  const ib = order.indexOf(b.id)
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
})

/** ألوان الهوية: كل لعبة تاخذ تدرّج من ألوان DUO (#000100 · #A1A6B4 · #94C5CC · #B4D2E7 · #F8F8F8) */
export const brandPairs: [string, string][] = [
  ['#94c5cc', '#b4d2e7'],
  ['#b4d2e7', '#a1a6b4'],
  ['#a1a6b4', '#94c5cc'],
  ['#7fb6be', '#dbe9f3'],
  ['#b4d2e7', '#f8f8f8'],
  ['#8d97a8', '#b4d2e7'],
]
games.forEach((g, i) => {
  g.accent = brandPairs[i % brandPairs.length]
})

/** ألعاب قديمة اندمجت في ألعاب جديدة (للغرف اللي كانت مقترحة فيها لعبة قديمة) */
const legacy: Record<string, string> = {
  'guess-answer': 'know-me',
  remember: 'know-me',
  'ask-me': 'talk',
  complete: 'talk',
  'this-or-that': 'taste',
  compat: 'taste',
  rank: 'taste',
  'what-guess': 'quick',
  'open-card': 'truth-dare',
}
export const gameById = (id: string | null | undefined) => allDefs.find((g) => g.id === id)
export const suggestedGame = (id: string | null | undefined) => gameById(id) ?? gameById(legacy[id ?? ''])

export const contentStats: Record<string, number> = {
  'know-me': allKnowMe.length + allGuess.length + allRemember.length,
  talk: allTalk.length,
  taste: allThisOrThat.length + allCompat.length + allRank.length,
  'truth-dare': 500,
  'who-more': allWhoMore.length + allWhoMoreBold.length,
  never: allNever.length,
  quick: allQuick.length + allRiddles.length,
  sixty: allTF.length,
  emoji: allEmoji.length,
  story: allStory.length,
}
