import type { Answer, Player } from '../../types/db'

export function byRound(answers: Answer[]) {
  const m = new Map<number, Map<string, Answer>>()
  for (const a of answers) {
    if (!m.has(a.round)) m.set(a.round, new Map())
    m.get(a.round)!.set(a.player_id, a)
  }
  return m
}

/** في ألعاب التوقع: صاحب السؤال يتبدل كل جولة (المقعد 1 ثم 2…) */
export function subjectOf(round: number, players: Player[]): string | undefined {
  const sorted = [...players].sort((a, b) => a.seat - b.seat)
  return sorted[(round - 1) % 2]?.user_id
}

export function otherOf(id: string | undefined, players: Player[]) {
  return players.find((p) => p.user_id !== id)?.user_id
}

export function nameOf(id: string | undefined, players: Player[]) {
  return players.find((p) => p.user_id === id)?.nickname ?? '—'
}

export function emptyScores(players: Player[]) {
  return Object.fromEntries(players.map((p) => [p.user_id, 0])) as Record<string, number>
}

export function winnerHeadline(scores: Record<string, number>, players: Player[], winText = 'فاز {name}!', tie = 'تعادل! 🤝') {
  const ids = players.map((p) => p.user_id)
  if (ids.length < 2) return tie
  const [a, b] = ids
  if ((scores[a] ?? 0) === (scores[b] ?? 0)) return tie
  const w = (scores[a] ?? 0) > (scores[b] ?? 0) ? a : b
  return winText.replace('{name}', nameOf(w, players))
}

export function isSkip(a: Answer | undefined) {
  return !a || a.answer?.skip === true
}

/** تشابه ترتيبين (0–100) بمقياس Spearman footrule */
export function rankSimilarity(a: number[], b: number[]): number {
  const n = a.length
  if (!n || n !== b.length) return 0
  const posB = new Map(b.map((v, i) => [v, i]))
  let d = 0
  a.forEach((v, i) => (d += Math.abs(i - (posB.get(v) ?? i))))
  const max = Math.floor((n * n) / 2)
  return Math.round(100 * (1 - d / max))
}

export function pct(n: number, d: number) {
  return d ? Math.round((100 * n) / d) : 0
}
