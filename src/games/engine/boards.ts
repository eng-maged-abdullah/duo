/** منطق ألعاب اللوح: يُعاد بناء الحالة من سجل الحركات بنفس الطريقة عند الاثنين */
import type { Move } from '../../types/db'

/* ============================ النقاط والمربعات ============================ */
// شبكة n×n مربعات. الخطوط الأفقية: (n+1) صف × n، والعمودية: n صف × (n+1)
export function dotsLineCount(n: number) {
  return 2 * n * (n + 1)
}
/** المربعات التي يحيط بها الخط */
export function dotsBoxesOf(id: number, n: number): number[] {
  const H = n * (n + 1)
  if (id < H) {
    const r = Math.floor(id / n)
    const c = id % n
    const out: number[] = []
    if (r > 0) out.push((r - 1) * n + c)
    if (r < n) out.push(r * n + c)
    return out
  }
  const v = id - H
  const r = Math.floor(v / (n + 1))
  const c = v % (n + 1)
  const out: number[] = []
  if (c > 0) out.push(r * n + c - 1)
  if (c < n) out.push(r * n + c)
  return out
}
export function dotsBoxLines(box: number, n: number): number[] {
  const r = Math.floor(box / n)
  const c = box % n
  const H = n * (n + 1)
  return [r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1]
}
export type DotsState = { lines: Map<number, string>; boxes: Map<number, string>; scores: Record<string, number>; last?: number }
export function dotsReplay(moves: Move[], n: number): DotsState {
  const lines = new Map<number, string>()
  const boxes = new Map<number, string>()
  const scores: Record<string, number> = {}
  let last: number | undefined
  for (const m of moves) {
    if (m.move.kind !== 'line') continue
    const id = Number(m.move.id)
    if (lines.has(id)) continue
    lines.set(id, m.player_id)
    last = id
    for (const b of dotsBoxesOf(id, n)) {
      if (!boxes.has(b) && dotsBoxLines(b, n).every((l) => lines.has(l))) {
        boxes.set(b, m.player_id)
        scores[m.player_id] = (scores[m.player_id] ?? 0) + 1
      }
    }
  }
  return { lines, boxes, scores, last }
}
/** نتيجة إضافة خط: هل يقفل مربع؟ وهل انتهت اللعبة؟ */
export function dotsOutcome(state: DotsState, id: number, n: number) {
  const lines = new Set(state.lines.keys())
  lines.add(id)
  const closes = dotsBoxesOf(id, n).some((b) => !state.boxes.has(b) && dotsBoxLines(b, n).every((l) => lines.has(l)))
  return { closes, finished: lines.size >= dotsLineCount(n) }
}

/* ============================ أربعة في صف ============================ */
export const C4_COLS = 7
export const C4_ROWS = 6
export type C4Game = { board: (string | null)[][]; winner: string | null; draw: boolean; line: [number, number][]; starter: string | null }
export type C4State = { games: C4Game[]; wins: Record<string, number>; current: C4Game }

function c4Win(board: (string | null)[][], r: number, c: number): [number, number][] | null {
  const p = board[r][c]
  if (!p) return null
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const cells: [number, number][] = [[r, c]]
    for (const s of [1, -1]) {
      let rr = r + dr * s
      let cc = c + dc * s
      while (rr >= 0 && rr < C4_ROWS && cc >= 0 && cc < C4_COLS && board[rr][cc] === p) {
        cells.push([rr, cc])
        rr += dr * s
        cc += dc * s
      }
    }
    if (cells.length >= 4) return cells
  }
  return null
}
const emptyC4 = (starter: string | null): C4Game => ({
  board: Array.from({ length: C4_ROWS }, () => Array<string | null>(C4_COLS).fill(null)),
  winner: null,
  draw: false,
  line: [],
  starter,
})
export function c4Replay(moves: Move[]): C4State {
  const games: C4Game[] = []
  let cur = emptyC4(null)
  const wins: Record<string, number> = {}
  for (const m of moves) {
    if (m.move.kind === 'reset') {
      games.push(cur)
      cur = emptyC4(m.player_id)
      continue
    }
    if (m.move.kind !== 'drop' || cur.winner || cur.draw) continue
    const col = Number(m.move.col)
    if (cur.starter === null) cur.starter = m.player_id
    let row = -1
    for (let r = C4_ROWS - 1; r >= 0; r--)
      if (!cur.board[r][col]) {
        row = r
        break
      }
    if (row < 0) continue
    cur.board[row][col] = m.player_id
    const w = c4Win(cur.board, row, col)
    if (w) {
      cur.winner = m.player_id
      cur.line = w
      wins[m.player_id] = (wins[m.player_id] ?? 0) + 1
    } else if (cur.board.every((r) => r.every(Boolean))) cur.draw = true
  }
  return { games, wins, current: cur }
}
/** نتيجة إسقاط قطعة قبل إرسالها */
export function c4Outcome(state: C4State, col: number, me: string) {
  const board = state.current.board.map((r) => [...r])
  let row = -1
  for (let r = C4_ROWS - 1; r >= 0; r--)
    if (!board[r][col]) {
      row = r
      break
    }
  if (row < 0) return null
  board[row][col] = me
  const win = Boolean(c4Win(board, row, col))
  const draw = !win && board.every((r) => r.every(Boolean))
  return { row, win, draw }
}

/* ============================ سلسلة الكلمات ============================ */
const norm = (w: string) =>
  w
    .trim()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[^ء-يa-z0-9]/gi, '')
    .toLowerCase()
export const normWord = norm
/** الحروف المقبولة لبداية الكلمة الجاية (ة = ه أو ت، ى = ي أو ا، والهمزة الأخيرة تُتجاهل) */
export function nextLetters(w: string): string[] {
  const raw = w.trim().replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  let n = norm(raw)
  if (n.endsWith('اء') && n.length > 3) n = n.slice(0, -2)
  else if (n.endsWith('ء') && n.length > 2) n = n.slice(0, -1)
  const last = raw.slice(-1)
  const ch = n.slice(-1)
  if (last === 'ة') return ['ه', 'ت']
  if (last === 'ى') return ['ي', 'ا']
  return [ch]
}
export function lastLetter(w: string) {
  return nextLetters(w)[0]
}
export function firstLetter(w: string) {
  const n = norm(w)
  return n.startsWith('ال') && n.length > 3 ? n[2] : n[0]
}
export type ChainState = {
  chain: { word: string; by: string }[]
  points: Record<string, number>
  used: Set<string>
  round: number
  lastEnd?: { kind: 'timeout' | 'challenge'; winner: string; loser: string; word?: string }
}
export function chainReplay(moves: Move[]): ChainState {
  const points: Record<string, number> = {}
  let chain: ChainState['chain'] = []
  const used = new Set<string>()
  let round = 1
  let lastEnd: ChainState['lastEnd']
  for (const m of moves) {
    const k = m.move.kind
    if (k === 'word') {
      chain.push({ word: String(m.move.text), by: m.player_id })
      used.add(norm(String(m.move.text)))
    } else if (k === 'timeout' || k === 'challenge') {
      const winner = String(m.move.winner)
      const loser = String(m.move.loser)
      points[winner] = (points[winner] ?? 0) + 1
      lastEnd = { kind: k, winner, loser, word: chain.at(-1)?.word }
      chain = []
      round++
    }
  }
  return { chain, points, used, round, lastEnd }
}
export function chainCheck(state: ChainState, word: string): string | null {
  const n = norm(word)
  if (n.length < 2) return 'الكلمة قصيرة'
  if (state.used.has(n)) return 'هذي الكلمة انقالت قبل!'
  const prev = state.chain.at(-1)
  if (prev) {
    const need = nextLetters(prev.word)
    if (!need.includes(firstLetter(word))) return `لازم تبدأ بحرف «${need.join('» أو «')}»`
  }
  return null
}
/** وقت الدور يقصر كل ما طالت السلسلة */
export function chainSeconds(len: number) {
  return Math.max(8, 20 - Math.floor(len / 2))
}

/* ============================ كذّاب (نرد) ============================ */
export type LiarBid = { q: number; f: number; by: string }
export type LiarState = {
  round: number
  dice: Record<string, number> // عدد النرد لكل لاعب
  rolled: Set<string> // أرقام الخانات اللي انرمت في الجولة الحالية
  bids: LiarBid[]
  reveal?: { values: Record<string, number[]>; bid: LiarBid; caller: string; count: number; loser: string }
  history: { round: number; loser: string; count: number; bid: LiarBid }[]
  over: string | null // الفائز
}
export function liarSlot(round: number, seat: number) {
  return `d${round}s${seat}`
}
export function liarReplay(moves: Move[], players: { user_id: string; seat: number }[], start = 5): LiarState {
  const dice: Record<string, number> = Object.fromEntries(players.map((p) => [p.user_id, start]))
  let round = 1
  let rolled = new Set<string>()
  let bids: LiarBid[] = []
  let reveal: LiarState['reveal']
  const history: LiarState['history'] = []
  let over: string | null = null
  for (const m of moves) {
    const k = m.move.kind
    if (k === 'rolled' && String(m.move.slot).startsWith(`d${round}s`)) rolled.add(String(m.move.slot))
    else if (k === 'bid' && !reveal) bids.push({ q: Number(m.move.q), f: Number(m.move.f), by: m.player_id })
    else if (k === 'reveal_all' && String(m.move.prefix) === `d${round}s` && bids.length) {
      const values: Record<string, number[]> = {}
      for (const p of players) values[p.user_id] = ((m.move.values ?? {})[liarSlot(round, p.seat)] ?? []) as number[]
      const bid = bids.at(-1)!
      const count = Object.values(values)
        .flat()
        .filter((v) => v === bid.f).length
      const caller = m.player_id
      const loser = count >= bid.q ? caller : bid.by
      reveal = { values, bid, caller, count, loser }
    } else if (k === 'next_round' && reveal) {
      dice[reveal.loser] = Math.max(0, (dice[reveal.loser] ?? 0) - 1)
      history.push({ round, loser: reveal.loser, count: reveal.count, bid: reveal.bid })
      if (dice[reveal.loser] === 0) over = players.find((p) => p.user_id !== reveal!.loser)?.user_id ?? null
      round++
      rolled = new Set()
      bids = []
      reveal = undefined
    }
  }
  return { round, dice, rolled, bids, reveal, history, over }
}
export function liarValidBid(prev: LiarBid | undefined, q: number, f: number, total: number) {
  if (f < 1 || f > 6 || q < 1 || q > total) return false
  if (!prev) return true
  return q > prev.q || (q === prev.q && f > prev.f)
}
