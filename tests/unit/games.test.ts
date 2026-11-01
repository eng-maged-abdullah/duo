import { describe, expect, it } from 'vitest'
import { games, gameById } from '../../src/games/registry'
import type { ChoiceItem, RoundItem } from '../../src/games/types'
import { rankSimilarity, subjectOf } from '../../src/games/engine/helpers'
import { seededRng } from '../../src/utils/random'
import type { Answer, GameSession, Move, Player } from '../../src/types/db'

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const players: Player[] = [
  { room_id: 'r', user_id: A, nickname: 'مها', seat: 1, joined_at: '' },
  { room_id: 'r', user_id: B, nickname: 'سعد', seat: 2, joined_at: '' },
]

function session(game: string, content: unknown, extra: Partial<GameSession> = {}): GameSession {
  return {
    id: 's',
    room_id: 'r',
    game_id: game,
    request_id: 'q',
    status: 'finished',
    mode: 'rounds',
    round: 1,
    rounds_total: 10,
    phase: 'revealed',
    round_seconds: null,
    round_started_at: '',
    round_deadline: null,
    answered: [],
    progress: {},
    turn_player: null,
    content,
    state: {},
    version: 1,
    started_by: A,
    created_at: '',
    finished_at: null,
    ...extra,
  }
}
const ans = (round: number, player: string, answer: Record<string, unknown>, judged: boolean | null = null): Answer => ({
  session_id: 's',
  room_id: 'r',
  round,
  player_id: player,
  answer,
  judged,
  created_at: '',
})

describe('كل الألعاب', () => {
  it('عشرون لعبة بمعرفات فريدة', () => {
    expect(games.length).toBe(20)
    expect(new Set(games.map((g) => g.id)).size).toBe(20)
    for (const g of games) expect(g.id).toMatch(/^[a-z0-9_-]{2,32}$/)
  })

  for (const g of games) {
    it(`${g.title}: تبني محتوى صالحًا بكل الإعدادات`, () => {
      const variants: Record<string, string>[] = [{}]
      for (const o of g.setup ?? []) if (o.kind === 'select') for (const op of o.options) variants.push({ [o.key]: op.value })
      for (const v of variants) {
        for (let seed = 1; seed <= 5; seed++) {
          const b = g.build(v, seededRng(seed))
          expect(b.rounds).toBeGreaterThanOrEqual(1)
          expect(b.rounds).toBeLessThanOrEqual(60)
          const size = new TextEncoder().encode(JSON.stringify(b.content)).length
          expect(size).toBeLessThan(50000)
          if (g.mode === 'sprint') expect(b.seconds).toBeTruthy()
          const items = b.content.items as RoundItem[] | undefined
          if (g.mode !== 'turns') {
            expect(items?.length).toBe(b.rounds)
            for (const it of items!) {
              expect(it.prompt.length).toBeGreaterThan(2)
              if (it.type === 'choice' && !it.who) {
                expect(it.options.length).toBeGreaterThanOrEqual(2)
                expect(new Set(it.options).size).toBe(it.options.length)
                if (it.correct !== undefined) expect(it.options[it.correct]).toBeDefined()
              }
              if (it.type === 'rank') expect(it.options.length).toBe(4)
            }
          }
        }
      }
    })
  }

  it('ألعاب الإجابة الصحيحة تحافظ على الإجابة بعد خلط الخيارات', () => {
    const g = gameById('quick')!
    const b = g.build({ rounds: '15' }, seededRng(7))
    for (const it of b.content.items as ChoiceItem[]) {
      expect(typeof it.correct).toBe('number')
    }
  })

  it('اسألني: الأسئلة الخاصة تأتي أولًا ومحدودة بخمسة', () => {
    const g = gameById('ask-me')!
    const b = g.build({ rounds: '6', custom: 'س1\nس2\n\nس3\nس4\nس5\nس6', cat: 'all' }, seededRng(1))
    const items = b.content.items as RoundItem[]
    expect(items.slice(0, 5).map((i) => i.prompt)).toEqual(['س1', 'س2', 'س3', 'س4', 'س5'])
    expect(items.length).toBe(6)
  })

  it('تذكر التفاصيل: كل جولة تذكّر تشير إلى جولة مشاركة صحيحة', () => {
    const b = gameById('remember')!.build({ n: '4' }, seededRng(3))
    const items = b.content.items as RoundItem[]
    expect(items.length).toBe(8)
    const recalls = items.slice(4)
    expect(recalls.map((r) => (r.type === 'text' ? r.recallOf : 0)).sort()).toEqual([1, 2, 3, 4])
    recalls.forEach((r) => r.type === 'text' && expect(r.prompt).toBe(items[r.recallOf! - 1].prompt))
  })
})

describe('احتساب النتائج', () => {
  it('قد إيش تعرفني: النقطة للمتوقع فقط وتتبدل الأدوار', () => {
    expect(subjectOf(1, players)).toBe(A)
    expect(subjectOf(2, players)).toBe(B)
    const sum = gameById('know-me')!.summarize({
      session: session('know-me', {}),
      players,
      moves: [],
      answers: [ans(1, A, { choice: 2 }), ans(1, B, { choice: 2 }), ans(2, B, { choice: 1 }), ans(2, A, { choice: 3 }), ans(3, A, { choice: 0 }), ans(3, B, { choice: 0 })],
    })
    expect(sum.scores).toEqual({ [A]: 0, [B]: 2 })
  })

  it('جاوب بسرعة: صحيح + نقاط سرعة، والخطأ صفر', () => {
    const content = { items: [{ type: 'choice', prompt: 'x', options: ['a', 'b'], correct: 1 }] }
    const sum = gameById('quick')!.summarize({
      session: session('quick', content),
      players,
      moves: [],
      answers: [ans(1, A, { choice: 1, _ms: 0 }), ans(1, B, { choice: 0, _ms: 100 })],
    })
    expect(sum.scores).toEqual({ [A]: 20, [B]: 0 })
  })

  it('اختار واحد: نسبة التطابق تتجاهل التخطي', () => {
    const sum = gameById('this-or-that')!.summarize({
      session: session('this-or-that', {}),
      players,
      moves: [],
      answers: [ans(1, A, { choice: 0 }), ans(1, B, { choice: 0 }), ans(2, A, { choice: 1 }), ans(2, B, { choice: 0 }), ans(3, A, { skip: true }), ans(3, B, { choice: 1 })],
    })
    expect(sum.percent).toBe(50)
  })

  it('مين فينا أكثر: الاتفاق يحسب عند اختيار نفس الشخص', () => {
    const sum = gameById('who-more')!.summarize({
      session: session('who-more', {}),
      players,
      moves: [],
      answers: [ans(1, A, { who: A }), ans(1, B, { who: A }), ans(2, A, { who: B }), ans(2, B, { who: A })],
    })
    expect(sum.percent).toBe(50)
    expect(sum.scores![A]).toBe(1)
  })

  it('توقع جوابي: الحكم الصحيح فقط يعطي نقطة', () => {
    const sum = gameById('guess-answer')!.summarize({
      session: session('guess-answer', {}),
      players,
      moves: [],
      answers: [ans(1, A, { text: 'قهوة' }), ans(1, B, { text: 'قهوة' }, true), ans(2, B, { text: 'شاي' }), ans(2, A, { text: 'عصير' }, false)],
    })
    expect(sum.scores).toEqual({ [A]: 0, [B]: 1 })
  })

  it('توقع الرقم: نقاط أكثر للتخمين الأسرع', () => {
    const moves: Move[] = [
      { session_id: 's', room_id: 'r', seq: 4, player_id: B, created_at: '', move: { kind: 'guess', round: 1, value: 42, hint: 'correct', attempt: 3, round_over: true, solved: true, secret: 42 } },
      { session_id: 's', room_id: 'r', seq: 9, player_id: A, created_at: '', move: { kind: 'guess', round: 2, value: 7, hint: 'higher', attempt: 8, round_over: true, solved: false, secret: 9 } },
    ]
    const sum = gameById('number')!.summarize({ session: session('number', {}, { mode: 'turns' }), players, moves, answers: [] })
    expect(sum.scores).toEqual({ [A]: 0, [B]: 6 })
  })

  it('ذاكرة DUO: النقاط من حالة الخادم', () => {
    const sum = gameById('memory')!.summarize({ session: session('memory', {}, { state: { scores: { [A]: 5, [B]: 3 } } }), players, moves: [], answers: [] })
    expect(sum.scores).toEqual({ [A]: 5, [B]: 3 })
    expect(sum.headline).toContain('مها')
  })

  it('تشابه الترتيب', () => {
    expect(rankSimilarity([0, 1, 2, 3], [0, 1, 2, 3])).toBe(100)
    expect(rankSimilarity([0, 1, 2, 3], [3, 2, 1, 0])).toBe(0)
    expect(rankSimilarity([0, 1, 2, 3], [1, 0, 2, 3])).toBe(75)
  })
})
