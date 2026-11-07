import type { Answer, GameMode, GameSession, Move, Player } from '../types/db'
import type { Rng } from '../utils/random'

export type CategoryId = 'acquaint' | 'laugh' | 'romance' | 'compete' | 'memory' | 'deep' | 'quick'

export type RendererId =
  | 'pair'
  | 'sprint'
  | 'truthdare'
  | 'story'
  | 'memory'
  | 'drawguess'
  | 'drawdescribe'
  | 'drawcontinue'
  | 'cards' // الكلمة الممنوعة + مثّلها بالصوت
  | 'hum'
  | 'twotruths'
  | 'wordrace'
  | 'nolaugh'
  | 'forbidden'
  | 'rated' // أغبى إجابة
  | 'twenty'
  | 'reflex'
  | 'compliments'
  | 'dream'
  | 'bet'
  | 'liar'
  | 'dots'
  | 'connect4'
  | 'chain'
  | 'vault'

export type ChoiceItem = {
  type: 'choice'
  prompt: string
  options: string[]
  correct?: number // للألعاب ذات الإجابة الصحيحة
  guess?: boolean // لاعب يجيب عن نفسه والآخر يتوقع
  who?: boolean // الخيارات هي اللاعبان
  skippable?: boolean
  tag?: string
  big?: string // رمز كبير يظهر فوق السؤال (إيموجي)
}

export type TextItem = {
  type: 'text'
  prompt: string
  placeholder?: string
  guess?: boolean
  judge?: 'subject' | 'mutual'
  recallOf?: number // رقم جولة المشاركة التي يتذكرها اللاعب
  skippable?: boolean
  tag?: string
}

export type RankItem = { type: 'rank'; prompt: string; options: string[] }

export type RoundItem = ChoiceItem | TextItem | RankItem

export type SetupOption =
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; kind: 'textarea'; placeholder: string; maxLines: number; maxLen: number }

export type Built = { rounds: number; seconds: number | null; content: Record<string, unknown> }

export type SummaryCtx = {
  session: GameSession
  answers: Answer[]
  moves: Move[]
  players: Player[] // مرتبة حسب المقعد
}

export type Summary = {
  scores?: Record<string, number>
  unit?: string
  percent?: number
  percentLabel?: string
  headline: string
  lines?: string[]
  celebrate?: boolean
  note?: string
}

export type GameDef = {
  id: string
  title: string
  tagline: string
  emoji: string
  categories: CategoryId[]
  accent: [string, string]
  minutes: string
  badge?: 'new' | 'popular'
  featured?: boolean
  /** يدعم الرهان على الخسران */
  stakes?: boolean
  /** يحتاج مكالمة صوتية ليكون ممتع */
  voice?: boolean
  howTo: string[]
  mode: GameMode
  renderer: RendererId
  setup?: SetupOption[]
  build: (opts: Record<string, string>, rng: Rng) => Built
  summarize: (ctx: SummaryCtx) => Summary
}
