import type { CategoryId, ChoiceItem, GameDef, RankItem, RoundItem, Summary, SummaryCtx, TextItem } from './types'
import { shuffle, type Rng } from '../utils/random'
import { fresh as pick } from './engine/fresh'
import { knowMeItems } from './content/knowMe'
import { moreDares, moreTruths } from './content/truthDareMore'
import { talkMore } from './content/talkMore'
import { thisOrThatMore } from './content/thisOrThatMore'
import { dares, tdLevels, truths, type TdLevel } from './content/truthDare'
import { compatItems, neverItems, thisOrThat, whoMore } from './content/choices'
import { askMeBank, completeItems, guessAnswerItems, rememberPrompts, talkItems } from './content/talk'
import { emojiPuzzles, quickQuiz, riddles, trueFalse } from './content/quiz'
import { memorySymbols, openCards, rankSets, storyStarters } from './content/misc'
import { byRound, emptyScores, isSkip, nameOf, otherOf, pct, rankSimilarity, subjectOf, winnerHeadline } from './engine/helpers'

export const categories: { id: CategoryId; label: string; emoji: string }[] = [
  { id: 'acquaint', label: 'أسئلة وتعارف', emoji: '💬' },
  { id: 'laugh', label: 'ضحك وتحديات', emoji: '😂' },
  { id: 'romance', label: 'رومانسية', emoji: '💞' },
  { id: 'compete', label: 'ألعاب تنافسية', emoji: '🏆' },
  { id: 'memory', label: 'ألعاب الذاكرة', emoji: '🧠' },
  { id: 'deep', label: 'أسئلة عميقة', emoji: '🌌' },
  { id: 'quick', label: 'ألعاب سريعة', emoji: '⚡' },
]

const roundsOpt = (def: string, values = ['6', '10', '14']) => ({
  key: 'rounds',
  label: 'عدد الجولات',
  kind: 'select' as const,
  default: def,
  options: values.map((v) => ({ value: v, label: `${v} جولات` })),
})

const N = (o: Record<string, string>, key: string, d: number) => {
  const n = parseInt(o[key] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : d
}

function mcq(rng: Rng, q: string, a: string, w: string[], extra: Partial<ChoiceItem> = {}): ChoiceItem {
  const options = shuffle([a, ...w], rng)
  return { type: 'choice', prompt: q, options, correct: options.indexOf(a), ...extra }
}

const allThisOrThat: [string, string][] = [...thisOrThat, ...thisOrThatMore]
const allTalk: { c: string; q: string }[] = [...talkItems, ...Object.entries(talkMore).flatMap(([c, qs]) => qs.map((q) => ({ c, q })))]

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

/** نسبة تطابق الاختيارات بين اللاعبين */
function matchSummary(ctx: SummaryCtx, label: string): Summary {
  const [p1, p2] = ctx.players.map((p) => p.user_id)
  let same = 0
  let total = 0
  for (const [, m] of byRound(ctx.answers)) {
    const a = m.get(p1)
    const b = m.get(p2)
    if (isSkip(a) || isSkip(b)) continue
    total++
    if (JSON.stringify(a!.answer.choice) === JSON.stringify(b!.answer.choice)) same++
  }
  const p = pct(same, total)
  return {
    percent: p,
    percentLabel: label,
    headline: p >= 80 ? 'نسخة طبق الأصل! 😍' : p >= 60 ? 'متفاهمين جدًا 💜' : p >= 40 ? 'توازن حلو بين الشبه والاختلاف' : 'الاختلاف يحلّي السوالف 😄',
    lines: [`تطابقتم في ${same} من ${total}`],
    celebrate: p >= 60,
  }
}

function judgedSummary(ctx: SummaryCtx, rounds?: (r: number) => boolean): Summary {
  const scores = emptyScores(ctx.players)
  for (const a of ctx.answers) if ((!rounds || rounds(a.round)) && a.judged === true) scores[a.player_id] = (scores[a.player_id] ?? 0) + 1
  return { scores, unit: 'إجابة صحيحة', headline: winnerHeadline(scores, ctx.players, '{name} أقوى ذاكرة وتركيز! 🏆'), celebrate: true }
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

const defs: GameDef[] = [
  {
    id: 'know-me',
    title: 'قد إيش تعرفني؟',
    tagline: 'واحد يجاوب عن نفسه، والثاني يتوقع',
    emoji: '🔍',
    categories: ['acquaint', 'compete', 'romance'],
    accent: ['#8b5cf6', '#f0509a'],
    minutes: '5–10 د',
    badge: 'popular',
    featured: true,
    howTo: [
      'في كل جولة يكون سؤال عن واحد منكم.',
      'صاحب السؤال يختار إجابته الحقيقية، والثاني يحاول يتوقعها.',
      'لا تظهر الإجابات إلا بعد ما يجاوب الاثنين.',
      'كل توقع صحيح = نقطة، والأدوار تتبدل كل جولة.',
    ],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('10')],
    build: (o, rng) => {
      const n = N(o, 'rounds', 10)
      return {
        rounds: n,
        seconds: null,
        content: { items: pick(knowMeItems, n, rng).map((x): ChoiceItem => ({ type: 'choice', prompt: x.q, options: [...x.o], guess: true })) },
      }
    },
    summarize: (ctx) => {
      const scores = emptyScores(ctx.players)
      for (const [r, m] of byRound(ctx.answers)) {
        const subject = subjectOf(r, ctx.players)
        const guesser = otherOf(subject, ctx.players)
        if (!subject || !guesser) continue
        const s = m.get(subject)
        const g = m.get(guesser)
        if (s && g && s.answer.choice === g.answer.choice) scores[guesser]++
      }
      return { scores, unit: 'توقع صحيح', headline: winnerHeadline(scores, ctx.players, '{name} يعرفك أكثر! 🏆'), celebrate: true }
    },
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
    howTo: [
      'صاحب الدور يختار صراحة أو تحدي.',
      'تظهر البطاقة للاثنين، وينفذها صاحب الدور.',
      'تقدر تتخطى أي بطاقة بدون أي إحراج أو خصم.',
      'بعدها ينتقل الدور للثاني.',
    ],
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
      roundsOpt('10', ['6', '10', '16']),
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
    id: 'this-or-that',
    title: 'اختار واحد',
    tagline: 'خياران… وشوفوا كم تتشابهون',
    emoji: '⚖️',
    categories: ['quick', 'acquaint'],
    accent: ['#6d6bff', '#29c4e6'],
    minutes: '3–5 د',
    howTo: ['يظهر لكم خياران.', 'كل واحد يختار بدون ما يشوف اختيار الثاني.', 'بعد ما تختارون الاثنين تظهر النتيجة، وفي النهاية نسبة التطابق.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('12', ['8', '12', '20'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 12)
      return {
        rounds: n,
        seconds: null,
        content: { items: pick(allThisOrThat, n, rng).map((x): ChoiceItem => ({ type: 'choice', prompt: 'وش تختار؟', options: [...x] })) },
      }
    },
    summarize: (ctx) => matchSummary(ctx, 'نسبة التشابه'),
  },
  {
    id: 'compat',
    title: 'اختبار التوافق',
    tagline: 'أسلوب حياتكم… كم يتشابه؟',
    emoji: '💞',
    categories: ['romance', 'acquaint'],
    accent: ['#f0509a', '#8b5cf6'],
    minutes: '5–8 د',
    featured: true,
    howTo: ['أسئلة عن أسلوب الحياة والقيم.', 'كل واحد يجاوب عن نفسه بصراحة.', 'في النهاية تظهر نسبة توافق ترفيهية.', 'النتيجة للمتعة فقط وليست قياسًا نفسيًا علميًا.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('10', ['6', '10', '16'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 10)
      return {
        rounds: n,
        seconds: null,
        content: { items: pick(compatItems, n, rng).map((x): ChoiceItem => ({ type: 'choice', prompt: x.q, options: [...x.o] })) },
      }
    },
    summarize: (ctx) => ({ ...matchSummary(ctx, 'نسبة التوافق'), note: 'نتيجة ترفيهية فقط، وليست اختبارًا نفسيًا علميًا.' }),
  },
  {
    id: 'talk',
    title: 'خلنا نتكلم',
    tagline: 'أسئلة عميقة لسوالف حقيقية',
    emoji: '🌌',
    categories: ['deep', 'romance', 'acquaint'],
    accent: ['#3b2a8f', '#8b5cf6'],
    minutes: '15–30 د',
    howTo: ['سؤال عميق في كل جولة.', 'اكتب إجابتك، أو اختر "نتكلم عنه بالصوت" إذا المكالمة شغالة.', 'تقدر تتخطى أي سؤال ما ترتاح له.', 'تظهر الإجابتان بعد ما يجاوب الاثنين.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [
      {
        key: 'cat',
        label: 'نوع الأسئلة',
        kind: 'select',
        default: 'all',
        options: [{ value: 'all', label: 'منوّع' }, ...[...new Set(allTalk.map((t) => t.c))].map((c) => ({ value: c, label: c }))],
      },
      roundsOpt('6', ['4', '6', '10']),
    ],
    build: (o, rng) => {
      const pool = o.cat && o.cat !== 'all' ? allTalk.filter((t) => t.c === o.cat) : allTalk
      const sel = pick(pool, N(o, 'rounds', 6), rng)
      return {
        rounds: sel.length,
        seconds: null,
        content: { items: sel.map((x): TextItem => ({ type: 'text', prompt: x.q, tag: x.c, skippable: true, placeholder: 'اكتب من قلبك…' })) },
      }
    },
    summarize: talkSummary,
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
        options: [{ value: 'all', label: 'منوّع' }, ...[...new Set(neverItems.map((t) => t.c))].map((c) => ({ value: c, label: c }))],
      },
      roundsOpt('10', ['6', '10', '15']),
    ],
    build: (o, rng) => {
      const pool = o.cat && o.cat !== 'all' ? neverItems.filter((t) => t.c === o.cat) : neverItems
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
    id: 'guess-answer',
    title: 'توقع جوابي',
    tagline: 'اكتب توقعك… وهو يحكم!',
    emoji: '🎯',
    categories: ['acquaint', 'compete'],
    accent: ['#29c4e6', '#8b5cf6'],
    minutes: '8–12 د',
    howTo: ['سؤال عن واحد منكم: هو يكتب إجابته الحقيقية، والثاني يكتب توقعه.', 'بعد الكشف، صاحب السؤال يحكم: هل التوقع صح؟', 'كل توقع صحيح = نقطة، والأدوار تتبدل.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('8', ['6', '8', '12'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 8)
      return {
        rounds: n,
        seconds: null,
        content: { items: pick(guessAnswerItems, n, rng).map((q): TextItem => ({ type: 'text', prompt: q, guess: true, judge: 'subject', placeholder: 'إجابة قصيرة…' })) },
      }
    },
    summarize: (ctx) => {
      const s = judgedSummary(ctx)
      return { ...s, unit: 'توقع صحيح', headline: winnerHeadline(s.scores!, ctx.players, '{name} يقرأ أفكارك! 🎯') }
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
    setup: [roundsOpt('12', ['8', '12', '18'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 12)
      return { rounds: n, seconds: null, content: { items: pick(whoMore, n, rng).map((q): ChoiceItem => ({ type: 'choice', prompt: q, options: [], who: true })) } }
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
    id: 'memory',
    title: 'ذاكرة DUO',
    tagline: 'اقلب البطاقات وطابق الأزواج',
    emoji: '🃏',
    categories: ['memory', 'compete'],
    accent: ['#7040e0', '#29c4e6'],
    minutes: '5–8 د',
    badge: 'popular',
    featured: true,
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
      return { rounds: 1, seconds: null, content: { pairs, symbols: pick(memorySymbols, pairs, rng) } }
    },
    summarize: (ctx) => {
      const scores = { ...emptyScores(ctx.players), ...(ctx.session.state?.scores ?? {}) } as Record<string, number>
      return { scores, unit: 'زوج', headline: winnerHeadline(scores, ctx.players, '{name} ذاكرته حديد! 🧠'), celebrate: true }
    },
  },
  {
    id: 'quick',
    title: 'جاوب بسرعة',
    tagline: 'معلومات عامة… والأسرع يكسب',
    emoji: '⚡',
    categories: ['quick', 'compete'],
    accent: ['#ffc861', '#ff6b6b'],
    minutes: '3–5 د',
    badge: 'new',
    howTo: ['سؤال معلومات عامة بمؤقت موحد للاثنين.', 'الإجابة الصحيحة = 10 نقاط + نقاط سرعة حتى 10.', 'وقت الإجابة يحسبه الخادم لضمان العدالة.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('10', ['6', '10', '15'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 10)
      return { rounds: n, seconds: 15, content: { items: pick(quickQuiz, n, rng).map((x) => mcq(rng, x.q, x.a, x.w)) } }
    },
    summarize: (ctx) => quizSummary(ctx, (ms) => 10 + Math.max(0, Math.round(10 * (1 - ms / 15000)))),
  },
  {
    id: 'complete',
    title: 'كملها',
    tagline: 'بداية جملة… وكل واحد يكملها',
    emoji: '✍️',
    categories: ['acquaint', 'laugh'],
    accent: ['#8b5cf6', '#29c4e6'],
    minutes: '5–10 د',
    howTo: ['تظهر بداية جملة.', 'كل واحد يكملها بطريقته.', 'تظهر الإجابتان مع بعض بعد ما يكتب الاثنين.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('8', ['5', '8', '12'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 8)
      return { rounds: n, seconds: null, content: { items: pick(completeItems, n, rng).map((q): TextItem => ({ type: 'text', prompt: q, skippable: true, placeholder: 'كمّل الجملة…' })) } }
    },
    summarize: talkSummary,
  },
  {
    id: 'what-guess',
    title: 'وش تتوقع؟',
    tagline: 'ألغاز ووصف… خمّن الجواب',
    emoji: '🤔',
    categories: ['compete', 'quick'],
    accent: ['#29c4e6', '#6d6bff'],
    minutes: '4–6 د',
    howTo: ['يظهر لغز أو وصف.', 'اختر الإجابة قبل نهاية الوقت.', 'كل إجابة صحيحة = نقطة.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('8', ['6', '8', '12'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 8)
      return { rounds: n, seconds: 25, content: { items: pick(riddles, n, rng).map((x) => mcq(rng, x.q, x.a, x.w)) } }
    },
    summarize: (ctx) => quizSummary(ctx, () => 1, 'إجابة صحيحة'),
  },
  {
    id: 'sixty',
    title: 'تحدي 60 ثانية',
    tagline: 'صح أو خطأ… أكبر عدد في دقيقة',
    emoji: '⏱️',
    categories: ['quick', 'compete'],
    accent: ['#ff6b6b', '#f0509a'],
    minutes: '1 د',
    badge: 'new',
    howTo: ['عندكم 60 ثانية بالضبط.', 'كل واحد يجاوب على أكبر عدد من عبارات صح أو خطأ.', 'تشوف تقدم شريكك مباشرة، والنتائج تظهر بعد انتهاء الوقت.'],
    mode: 'sprint',
    renderer: 'sprint',
    build: (_o, rng) => {
      const sel = pick(trueFalse, 30, rng)
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
    id: 'open-card',
    title: 'افتح السؤال',
    tagline: 'اختر بطاقة… ووش يطلع لك!',
    emoji: '🎴',
    categories: ['laugh', 'acquaint', 'romance'],
    accent: ['#ffc861', '#8b5cf6'],
    minutes: '10–15 د',
    howTo: ['قدامكم بطاقات مرقمة مقلوبة.', 'صاحب الدور يختار رقم ويفتح البطاقة.', 'ممكن تكون سؤال أو تحدي — جاوب أو نفذ ثم اضغط التالي.'],
    mode: 'turns',
    renderer: 'opencard',
    setup: [
      {
        key: 'cards',
        label: 'عدد البطاقات',
        kind: 'select',
        default: '12',
        options: [
          { value: '9', label: '9 بطاقات' },
          { value: '12', label: '12 بطاقة' },
          { value: '16', label: '16 بطاقة' },
        ],
      },
    ],
    build: (o, rng) => {
      const n = N(o, 'cards', 12)
      return { rounds: n, seconds: null, content: { cards: pick(openCards, n, rng) } }
    },
    summarize: (ctx) => {
      const opened = emptyScores(ctx.players)
      for (const m of ctx.moves) if (m.move.kind === 'open') opened[m.player_id]++
      return { scores: opened, unit: 'بطاقة', headline: 'فتحتوا كل الأسرار! 🎴' }
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
    howTo: ['نبدأ ببداية قصة.', 'كل واحد يضيف جملة بالتناوب (حتى 140 حرف).', 'في النهاية تقرؤون قصتكم كاملة وتقدرون تنسخونها.'],
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
      return { rounds: total, seconds: null, content: { total, starter: pick(storyStarters, 1, rng)[0] } }
    },
    summarize: (ctx) => {
      const lines = ctx.moves.filter((m) => m.move.kind === 'line')
      return { headline: 'قصتكم جاهزة! 📖', lines: [`${lines.length} جملة كتبتوها مع بعض`] }
    },
  },
  {
    id: 'rank',
    title: 'رتبها',
    tagline: 'رتب حسب ذوقك… وقارن',
    emoji: '📊',
    categories: ['acquaint', 'romance'],
    accent: ['#29c4e6', '#f0509a'],
    minutes: '5–8 د',
    howTo: ['تظهر أربعة خيارات.', 'اضغط عليها بالترتيب من الأحب إلى الأقل.', 'بعد الكشف تشوفون نسبة تشابه ترتيبكم.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('6', ['4', '6', '10'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 6)
      return { rounds: n, seconds: null, content: { items: pick(rankSets, n, rng).map((x): RankItem => ({ type: 'rank', prompt: x.q, options: [...x.o] })) } }
    },
    summarize: (ctx) => {
      const [p1, p2] = ctx.players.map((p) => p.user_id)
      const sims: number[] = []
      for (const [, m] of byRound(ctx.answers)) {
        const a = m.get(p1)?.answer?.order
        const b = m.get(p2)?.answer?.order
        if (Array.isArray(a) && Array.isArray(b)) sims.push(rankSimilarity(a, b))
      }
      const p = sims.length ? Math.round(sims.reduce((x, y) => x + y, 0) / sims.length) : 0
      return { percent: p, percentLabel: 'تشابه الذوق', headline: p >= 70 ? 'ذوقكم واحد! 💜' : 'لكل واحد ذوقه 😄', celebrate: p >= 70 }
    },
  },
  {
    id: 'ask-me',
    title: 'اسألني',
    tagline: 'بنك أسئلة… وأسئلتك الخاصة',
    emoji: '❓',
    categories: ['acquaint', 'deep', 'romance'],
    accent: ['#6d6bff', '#8b5cf6'],
    minutes: '10–20 د',
    badge: 'new',
    howTo: ['اختر نوع الأسئلة، وتقدر تضيف أسئلة من عندك.', 'كل واحد يجاوب على نفس السؤال.', 'تقدر تتخطى أو تختار "نتكلم بالصوت".'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [
      {
        key: 'cat',
        label: 'نوع الأسئلة',
        kind: 'select',
        default: 'all',
        options: [{ value: 'all', label: 'منوّع' }, ...Object.keys(askMeBank).map((k) => ({ value: k, label: k }))],
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
      const pool = o.cat && o.cat !== 'all' && askMeBank[o.cat] ? askMeBank[o.cat] : Object.values(askMeBank).flat()
      const qs = [...custom.map((q) => ({ q, tag: 'سؤال خاص' })), ...pick(pool, Math.max(0, n - custom.length), rng).map((q) => ({ q, tag: o.cat !== 'all' ? o.cat : undefined }))]
      return {
        rounds: qs.length,
        seconds: null,
        content: { items: qs.map((x): TextItem => ({ type: 'text', prompt: x.q, tag: x.tag, skippable: true, placeholder: 'اكتب إجابتك…' })) },
      }
    },
    summarize: talkSummary,
  },
  {
    id: 'emoji',
    title: 'فك الرموز',
    tagline: 'إيموجي = مثل أو عبارة',
    emoji: '🧩',
    categories: ['quick', 'compete', 'laugh'],
    accent: ['#ffc861', '#29c4e6'],
    minutes: '4–6 د',
    howTo: ['تظهر مجموعة إيموجي.', 'اختر المثل أو العبارة اللي تعبر عنها قبل نهاية الوقت.', 'كل إجابة صحيحة = نقطة.'],
    mode: 'rounds',
    renderer: 'pair',
    setup: [roundsOpt('8', ['6', '8', '12'])],
    build: (o, rng) => {
      const n = N(o, 'rounds', 8)
      return { rounds: n, seconds: 25, content: { items: pick(emojiPuzzles, n, rng).map((x) => mcq(rng, 'وش تعني هذي الرموز؟', x.a, x.w, { big: x.e })) } }
    },
    summarize: (ctx) => quizSummary(ctx, () => 1, 'إجابة صحيحة'),
  },
  {
    id: 'remember',
    title: 'تذكر التفاصيل',
    tagline: 'شارك… ثم اختبر ذاكرة شريكك',
    emoji: '🧠',
    categories: ['memory', 'acquaint', 'compete'],
    accent: ['#8b5cf6', '#29c4e6'],
    minutes: '8–12 د',
    howTo: [
      'المرحلة الأولى: كل واحد يشارك إجابات قصيرة عن نفسه.',
      'اقرأ إجابات شريكك زين وركّز!',
      'المرحلة الثانية: نسألك وش قال شريكك، وتكتب من ذاكرتك.',
      'شريكك يحكم إذا كانت إجابتك صحيحة.',
    ],
    mode: 'rounds',
    renderer: 'pair',
    setup: [
      {
        key: 'n',
        label: 'عدد التفاصيل',
        kind: 'select',
        default: '4',
        options: [
          { value: '3', label: '3 تفاصيل' },
          { value: '4', label: '4 تفاصيل' },
          { value: '6', label: '6 تفاصيل' },
        ],
      },
    ],
    build: (o, rng) => {
      const n = N(o, 'n', 4)
      const ps = pick(rememberPrompts, n, rng)
      const share: TextItem[] = ps.map((q) => ({ type: 'text', prompt: q, tag: 'شارك', placeholder: 'إجابة قصيرة وواضحة…' }))
      const order = shuffle(
        ps.map((_, i) => i),
        rng,
      )
      const recall: TextItem[] = order.map((i) => ({ type: 'text', prompt: ps[i], recallOf: i + 1, judge: 'mutual', tag: 'تذكّر', placeholder: 'وش قال شريكك؟' }))
      return { rounds: n * 2, seconds: null, content: { items: [...share, ...recall], shareCount: n } }
    },
    summarize: (ctx) => {
      const n = Number(ctx.session.content?.shareCount ?? 0)
      return judgedSummary(ctx, (r) => r > n)
    },
  },
]

export const games: GameDef[] = defs
export const gameById = (id: string | null | undefined) => defs.find((g) => g.id === id)
