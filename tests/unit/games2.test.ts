import { describe, expect, it } from 'vitest'
import { gameById } from '../../src/games/registry'
import { seededRng } from '../../src/utils/random'
import { checkClueText, makeReflex, makeScene, makeVault, vaultSolutions } from '../../src/games/engine/generators'
import { c4Outcome, c4Replay, chainCheck, chainReplay, dotsBoxLines, dotsLineCount, dotsOutcome, dotsReplay, lastLetter, liarReplay, liarValidBid } from '../../src/games/engine/boards'
import { betChips, dreamFlip, raceScore } from '../../src/games/defs2'
import { decodePoints, encodePoint, visibleStrokes } from '../../src/games/renderers/DrawCanvas'
import { nights } from '../../src/games/nights'
import { tabooCards } from '../../src/games/content/v2/voice'
import type { Answer, GameSession, Move, Player } from '../../src/types/db'

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const players: Player[] = [
  { room_id: 'r', user_id: A, nickname: 'مها', seat: 1, joined_at: '' },
  { room_id: 'r', user_id: B, nickname: 'سعد', seat: 2, joined_at: '' },
]
let seq = 0
const mv = (p: string, move: Record<string, unknown>, at = 0): Move => ({ session_id: 's', room_id: 'r', seq: ++seq, player_id: p, move, created_at: new Date(1_700_000_000_000 + at).toISOString() })
const ans = (round: number, player: string, answer: Record<string, unknown>, rating: number | null = null): Answer => ({ session_id: 's', room_id: 'r', round, player_id: player, answer, judged: null, rating, created_at: '' })
const sess = (game: string, content: unknown, extra: Partial<GameSession> = {}): GameSession => ({
  id: 'sess-1', room_id: 'r', game_id: game, request_id: 'q', status: 'finished', mode: 'turns', round: 1, rounds_total: 4, phase: 'revealed',
  round_seconds: null, round_started_at: '', round_deadline: null, answered: [], progress: {}, turn_player: A, content, state: {}, version: 1,
  started_by: A, created_at: '', finished_at: null, ...extra,
})
const sum = (game: string, content: unknown, moves: Move[] = [], answers: Answer[] = []) =>
  gameById(game)!.summarize({ session: sess(game, content), players, moves, answers })

describe('خزنة الكنز', () => {
  it('كل خزنة لها حل واحد فقط، وكل نص تلميحات لحاله ما يكفي', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const d of [3, 4] as const) {
        const v = makeVault(seededRng(seed * 7 + d), d)
        expect(v.code).toMatch(new RegExp(`^\\d{${d}}$`))
        expect(vaultSolutions(v)).toEqual([v.code])
        const only = (cl: string[]) => {
          let n = 0
          for (let x = 0; x < 10 ** d; x++) if (cl.every((t) => checkClueText(t, String(x).padStart(d, '0').split('').map(Number)))) n++
          return n
        }
        expect(only(v.a)).toBeGreaterThan(1)
        expect(only(v.b)).toBeGreaterThan(1)
      }
    }
  })
})

describe('مولدات الصور والانعكاس', () => {
  it('الصورة: أشكال في خانات مختلفة', () => {
    const sc = makeScene(seededRng(3), 5)
    expect(new Set(sc.map((x) => x.cell)).size).toBe(5)
    expect(new Set(sc.map((x) => x.k)).size).toBe(5)
  })
  it('الانعكاس: الهدف يجي في وقت الضغط، والخدع قبله وما تشبه الهدف', () => {
    for (let s = 1; s < 200; s++) {
      const r = makeReflex(seededRng(s))
      const target = r.events.at(-1)!
      expect(target.fake).toBe(false)
      expect(target.at).toBe(r.go)
      expect(r.go).toBeLessThanOrEqual(6200)
      for (const e of r.events.slice(0, -1)) {
        expect(e.at).toBeLessThan(r.go)
        expect(e.show).not.toBe(r.target)
      }
    }
  })
})

describe('الرسم', () => {
  it('ترميز النقاط وفكها', () => {
    const p = encodePoint(0, 1023) + encodePoint(512.4, 7) + encodePoint(-5, 2000)
    expect(decodePoints(p)).toEqual([
      [0, 1023],
      [512, 7],
      [0, 1023],
    ])
  })
  it('المسح والتراجع', () => {
    const s = (k: string, by = A, extra = {}) => ({ k, c: '#000', w: 4, p: 'aaaa', by, ...extra })
    expect(visibleStrokes([s('1'), s('2', B), s('3'), s('u', A, { undo: true })]).map((x) => x.k)).toEqual(['1', '2'])
    expect(visibleStrokes([s('1'), s('c', A, { clear: true }), s('2')]).map((x) => x.k)).toEqual(['2'])
  })
  it('ارسم وخمّن: نقاط حسب الصعوبة والسرعة', () => {
    seq = 0
    const moves = [
      mv(A, { kind: 'chosen', slot: 'w1', d: 2, len: 3 }, 0),
      mv(B, { kind: 'guess', slot: 'w1', text: 'كلب', correct: false }, 5000),
      mv(B, { kind: 'guess', slot: 'w1', text: 'قطة', correct: true, value: { w: 'قطة' } }, 10000),
      mv(A, { kind: 'next', pass_turn: true }, 12000),
      mv(B, { kind: 'chosen', slot: 'w2', d: 0, len: 3 }, 13000),
      mv(B, { kind: 'reveal', slot: 'w2', value: { w: 'قمر' } }, 93000),
    ]
    const r = sum('draw-guess', { seconds: 80 }, moves)
    expect(r.scores).toEqual({ [A]: 3, [B]: 5 })
    expect(r.lines?.[1]).toContain('قمر')
  })
})

describe('ألعاب البطاقات والصوت', () => {
  it('الكلمة الممنوعة: كل بطاقة فيها ٤ كلمات ممنوعة ومافيه تكرار', () => {
    expect(tabooCards.length).toBeGreaterThanOrEqual(150)
    for (const c of tabooCards) expect(c.f.length, c.w).toBe(4)
    expect(new Set(tabooCards.map((c) => c.w)).size).toBe(tabooCards.length)
  })
  it('الكلمة الممنوعة: النقاط = صح − مخالفات', () => {
    seq = 0
    const moves = [
      mv(A, { kind: 'card', turn: 1, res: 'got', w: 'x' }),
      mv(A, { kind: 'card', turn: 1, res: 'got', w: 'y' }),
      mv(A, { kind: 'card', turn: 1, res: 'foul', w: 'z' }),
      mv(A, { kind: 'end', turn: 1 }),
      mv(B, { kind: 'card', turn: 2, res: 'skip', w: 'q' }),
    ]
    expect(sum('taboo', { turns: 2 }, moves).scores).toEqual({ [A]: 1, [B]: 0 })
  })
  it('لا تضحك: الضحك نقطة للمضحك والصمود للمقاوم', () => {
    seq = 0
    const r = sum('no-laugh', {}, [mv(B, { kind: 'laughed', turn: 1 }), mv(A, { kind: 'held', turn: 2, watcher: A })])
    expect(r.scores).toEqual({ [A]: 2, [B]: 0 })
  })
  it('كذبة وحدة: الكشف نقطة للمخمّن، والخداع نقطة للكاتب', () => {
    seq = 0
    const r = sum('two-truths', {}, [
      mv(A, { kind: 'statements', turn: 1, items: ['a', 'b', 'c'] }),
      mv(B, { kind: 'guess', slot: 'lie1', text: '2', correct: true }),
      mv(B, { kind: 'statements', turn: 2, items: ['a', 'b', 'c'] }),
      mv(A, { kind: 'guess', slot: 'lie2', text: '0', correct: false }),
    ])
    expect(r.scores).toEqual({ [A]: 0, [B]: 2 })
  })
  it('٢٠ سؤال: أقل أسئلة = نقاط أكثر', () => {
    seq = 0
    const r = sum('twenty', { turns: 2 }, [
      mv(A, { kind: 'secret_set', slot: 't1' }),
      mv(A, { kind: 'ans', turn: 1, v: 'yes' }),
      mv(A, { kind: 'ans', turn: 1, v: 'no' }),
      mv(B, { kind: 'guess', slot: 't1', text: 'قطة', correct: true, value: 'قطة' }),
      mv(B, { kind: 'next', turn: 1 }),
      mv(B, { kind: 'secret_set', slot: 't2' }),
      mv(B, { kind: 'reveal', slot: 't2', value: 'برج' }),
    ])
    expect(r.scores).toEqual({ [A]: 0, [B]: 29 })
  })
  it('المدح: المدحات + القلوب', () => {
    seq = 0
    const r = sum('compliments', {}, [mv(A, { kind: 'c', text: 'x' }), mv(B, { kind: 'react', seq: 1, to: A }), mv(B, { kind: 'c', text: 'y' }), mv(A, { kind: 'timeout' })])
    expect(r.scores).toEqual({ [A]: 2, [B]: 1 })
  })
})

describe('ألعاب الجولات', () => {
  it('سباق الكلمات: المشترك ينلغي والحرف لازم يطابق', () => {
    const r = raceScore(['موز', 'مانجو', 'تفاح', 'المشمش', 'م'], ['مانجا', 'مانجو', 'ملوخية'], 'م')
    expect(r.a).toBe(2) // موز، المشمش
    expect(r.b).toBe(2) // مانجا، ملوخية
    expect(r.shared).toEqual(['مانجو'])
  })
  it('راهن على شريكك: يكسب أو يخسر رهانه', () => {
    const answers = [ans(1, A, { self: 0, guess: 1, bet: 30 }), ans(1, B, { self: 1, guess: 2, bet: 50 }), ans(2, A, { self: 3, guess: 0, bet: 50 }), ans(2, B, { self: 0, guess: 3, bet: 20 })]
    expect(betChips({ session: sess('bet', {}), players, moves: [], answers })).toEqual({ [A]: 180, [B]: 70 })
  })
  it('نخطط حلمنا: القرعة ثابتة لنفس الجولة', () => {
    expect(dreamFlip('abc', 1)).toBe(dreamFlip('abc', 1))
    const flips = new Set(Array.from({ length: 20 }, (_, i) => dreamFlip('x', i)))
    expect(flips.size).toBe(2)
  })
  it('ضغطة الانعكاس: البدري يخسر الجولة', () => {
    const r = sum('reflex', {}, [], [ans(1, A, { rt: 300 }), ans(1, B, { early: true }), ans(2, A, { rt: 400 }), ans(2, B, { rt: 250 })])
    expect(r.scores).toEqual({ [A]: 1, [B]: 1 })
  })
  it('أغبى إجابة: مجموع النجوم', () => {
    const r = sum('dumb', {}, [], [ans(1, A, { text: 'x' }, 4), ans(1, B, { text: 'y' }, 5), ans(2, A, { text: 'z' }, 2)])
    expect(r.scores).toEqual({ [A]: 6, [B]: 5 })
  })
})

describe('ألعاب اللوح', () => {
  it('النقاط والمربعات: قفل المربع يعطي نقطة', () => {
    const n = 2
    expect(dotsLineCount(n)).toBe(12)
    const lines = dotsBoxLines(0, n)
    seq = 0
    const moves = lines.slice(0, 3).map((id, i) => mv(i % 2 ? B : A, { kind: 'line', id }))
    const st = dotsReplay(moves, n)
    const out = dotsOutcome(st, lines[3], n)
    expect(out.closes).toBe(true)
    const st2 = dotsReplay([...moves, mv(B, { kind: 'line', id: lines[3] })], n)
    expect(st2.scores[B]).toBe(1)
    // كل مربع يتكوّن من 4 خطوط مختلفة
    for (let b = 0; b < 9; b++) expect(new Set(dotsBoxLines(b, 3)).size).toBe(4)
  })
  it('أربعة في صف: فوز عمودي وأفقي', () => {
    seq = 0
    const moves = [mv(A, { kind: 'drop', col: 0 }), mv(B, { kind: 'drop', col: 1 }), mv(A, { kind: 'drop', col: 0 }), mv(B, { kind: 'drop', col: 1 }), mv(A, { kind: 'drop', col: 0 }), mv(B, { kind: 'drop', col: 1 })]
    const st = c4Replay(moves)
    expect(c4Outcome(st, 0, A)?.win).toBe(true)
    const st2 = c4Replay([...moves, mv(A, { kind: 'drop', col: 0 })])
    expect(st2.current.winner).toBe(A)
    expect(st2.wins[A]).toBe(1)
    const st3 = c4Replay([...moves, mv(A, { kind: 'drop', col: 0 }), mv(B, { kind: 'reset' }), mv(B, { kind: 'drop', col: 3 })])
    expect(st3.games.length).toBe(1)
    expect(st3.current.board[5][3]).toBe(B)
  })
  it('سلسلة الكلمات: الحرف الأخير والتكرار', () => {
    expect(lastLetter('قطة')).toBe('ه')
    expect(lastLetter('سماء')).toBe('م')
    expect(lastLetter('دنيا')).toBe('ا')
    const stT = chainReplay([mv(A, { kind: 'word', text: 'قطة' })])
    expect(chainCheck(stT, 'تفاح')).toBeNull()
    expect(chainCheck(stT, 'هدهد')).toBeNull()
    seq = 0
    const st = chainReplay([mv(A, { kind: 'word', text: 'قلم' }), mv(B, { kind: 'word', text: 'موز' })])
    expect(chainCheck(st, 'زرافة')).toBeNull()
    expect(chainCheck(st, 'الزيت')).toBeNull()
    expect(chainCheck(st, 'قمر')).toContain('ز')
    expect(chainCheck(st, 'موز')).toContain('انقالت')
    const st2 = chainReplay([mv(A, { kind: 'word', text: 'قلم' }), mv(B, { kind: 'timeout', winner: A, loser: B })])
    expect(st2.points[A]).toBe(1)
    expect(st2.chain.length).toBe(0)
  })
  it('كذّاب: الكشف يحدد الخسران والنرد ينقص', () => {
    expect(liarValidBid(undefined, 1, 3, 8)).toBe(true)
    expect(liarValidBid({ q: 2, f: 4, by: A }, 2, 3, 8)).toBe(false)
    expect(liarValidBid({ q: 2, f: 4, by: A }, 2, 5, 8)).toBe(true)
    expect(liarValidBid({ q: 2, f: 4, by: A }, 3, 1, 8)).toBe(true)
    seq = 0
    const moves = [
      mv(A, { kind: 'rolled', slot: 'd1s1', n: 2 }),
      mv(B, { kind: 'rolled', slot: 'd1s2', n: 2 }),
      mv(A, { kind: 'bid', q: 3, f: 6 }),
      mv(B, { kind: 'reveal_all', prefix: 'd1s', values: { d1s1: [6, 2], d1s2: [6, 1] } }),
    ]
    const st = liarReplay(moves, players, 2)
    expect(st.reveal?.count).toBe(2)
    expect(st.reveal?.loser).toBe(A)
    const st2 = liarReplay([...moves, mv(B, { kind: 'next_round' })], players, 2)
    expect(st2.dice[A]).toBe(1)
    expect(st2.round).toBe(2)
    const st3 = liarReplay(
      [...moves, mv(B, { kind: 'next_round' }), mv(A, { kind: 'rolled', slot: 'd2s1', n: 1 }), mv(B, { kind: 'rolled', slot: 'd2s2', n: 2 }), mv(A, { kind: 'bid', q: 1, f: 2 }), mv(B, { kind: 'reveal_all', prefix: 'd2s', values: { d2s1: [3], d2s2: [4, 5] } }), mv(B, { kind: 'next_round' })],
      players,
      2,
    )
    expect(st3.over).toBe(B)
  })
})

describe('وضع السهرة', () => {
  it('كل محطة لعبة موجودة وإعداداتها صحيحة', () => {
    for (const n of nights) {
      expect(n.steps.length).toBeGreaterThanOrEqual(5)
      for (const st of n.steps) {
        const g = gameById(st.game)
        expect(g, st.game).toBeDefined()
        for (const [k, v] of Object.entries(st.opts)) {
          const o = g!.setup?.find((x) => x.key === k)
          expect(o, `${n.id}:${st.game}:${k}`).toBeDefined()
          if (o?.kind === 'select') expect(o.options.map((x) => x.value), `${n.id}:${st.game}:${k}=${v}`).toContain(v)
        }
        const b = g!.build(st.opts, seededRng(1))
        expect(b.rounds).toBeGreaterThan(0)
      }
    }
  })
})
