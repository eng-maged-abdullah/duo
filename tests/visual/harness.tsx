// صفحة اختبار مرئي فقط (لا تدخل في البناء النهائي): تعرض شاشات الغرفة ببيانات وهمية
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '../../src/styles/index.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/readex-pro/arabic-600.css'
import '@fontsource/readex-pro/latin-600.css'
import { RoomCtx, type RoomCtxValue } from '../../src/lib/rooms/RoomProvider'
import { RoomScreen } from '../../src/pages/RoomPage'
import { ToastProvider } from '../../src/components/ui/Toast'
import { gameById } from '../../src/games/registry'
import { seededRng } from '../../src/utils/random'
import type { Answer, GameSession, Move, Player } from '../../src/types/db'

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'
const now = Date.now()
const players: Player[] = [
  { room_id: 'r', user_id: A, nickname: 'مها', seat: 1, joined_at: '' },
  { room_id: 'r', user_id: B, nickname: 'سعد', seat: 2, joined_at: '' },
]
const view = new URLSearchParams(location.search).get('view') ?? 'lobby'

function sess(game: string, extra: Partial<GameSession> = {}, opts: Record<string, string> = {}): GameSession {
  const def = gameById(game)!
  const b = def.build(opts, seededRng(4))
  return {
    id: 's1', room_id: 'r', game_id: game, request_id: 'q', status: 'playing', mode: def.mode, round: 1,
    rounds_total: b.rounds, phase: 'answering', round_seconds: b.seconds, round_started_at: new Date(now).toISOString(),
    round_deadline: b.seconds ? new Date(now + b.seconds * 1000 - 3000).toISOString() : null, answered: [], progress: {},
    turn_player: A, content: b.content, state: {}, version: 1, started_by: A, created_at: '', finished_at: null, ...extra,
  }
}
const ans = (round: number, p: string, answer: Record<string, unknown>, judged: boolean | null = null): Answer => ({ session_id: 's1', room_id: 'r', round, player_id: p, answer, judged, created_at: '' })
const mv = (seq: number, p: string, move: Record<string, unknown>): Move => ({ session_id: 's1', room_id: 'r', seq, player_id: p, move, created_at: '' })

let session: GameSession | null = null
let answers: Answer[] = []
let moves: Move[] = []
let solo = false
switch (view) {
  case 'waiting': solo = true; break
  case 'pair': session = sess('know-me', { answered: [B] }); break
  case 'pair-reveal': session = sess('know-me', { phase: 'revealed' }); answers = [ans(1, A, { choice: 1 }), ans(1, B, { choice: 1 })]; break
  case 'quick': session = sess('quick'); break
  case 'emoji-reveal': session = sess('emoji', { phase: 'revealed' }); answers = [ans(1, A, { choice: 0 }), ans(1, B, { choice: 2 })]; break
  case 'text': session = sess('talk'); break
  case 'rank': session = sess('rank'); break
  case 'who': session = sess('who-more'); break
  case 'memory': session = sess('memory', { state: { pending: 3, matched: [0, 5], scores: { [A]: 1 } } }); moves = [mv(1, A, { card: 0, value: 2 }), mv(2, A, { card: 5, value: 2, first: 0, match: true }), mv(3, A, { card: 3, value: 4 })]; break
  case 'truth': session = sess('truth-dare'); moves = [mv(1, A, { kind: 'pick', choice: 'dare', text: 'غنّ مقطع من أغنية تحبها.' })]; break
  case 'number': session = sess('number', { turn_player: B, state: { round: 1, setter: A, phase: 'guess', attempts: 2 } }); moves = [mv(1, A, { kind: 'set', round: 1 }), mv(2, B, { kind: 'guess', round: 1, value: 50, hint: 'lower', attempt: 1 }), mv(3, B, { kind: 'guess', round: 1, value: 25, hint: 'higher', attempt: 2 })]; break
  case 'story': session = sess('story'); moves = [mv(1, B, { kind: 'line', text: 'فتحنا الباب ببطء،' }), mv(2, A, { kind: 'line', text: 'ولقينا قطة تلبس نظارة!' })]; break
  case 'sixty': session = sess('sixty', { progress: { [B]: 7 } }); answers = [1, 2, 3, 4, 5].map((r) => ans(r, A, { choice: 0 })); break
  case 'results': session = sess('know-me', { status: 'finished', round: 10 }); answers = [ans(1, A, { choice: 1 }), ans(1, B, { choice: 1 }), ans(2, B, { choice: 2 }), ans(2, A, { choice: 2 }), ans(3, A, { choice: 0 }), ans(3, B, { choice: 0 })]; break
}

const value: RoomCtxValue = {
  status: 'ready', error: null, myId: A,
  room: { id: 'r', code: 'K7PX3M', host_id: A, status: 'open', current_game: view === 'lobby' ? 'compat' : null, created_at: '', expires_at: new Date(now + 23 * 3600e3).toISOString() },
  players: solo ? [players[0]] : players, me: players[0], partner: solo ? undefined : players[1], isHost: true,
  online: new Set([A, B]), connection: 'live', session, answers, moves, refreshGame: async () => {}, serverNow: () => Date.now(),
  messages: view === 'chat' ? [
    { id: '1', room_id: 'r', sender_id: B, nickname: 'سعد', body: 'جاهزة؟ 😄', client_id: '1', created_at: new Date(now - 60000).toISOString(), mine: false },
    { id: '2', room_id: 'r', sender_id: A, nickname: 'مها', body: 'أكيد! نبدأ بقد إيش تعرفني', client_id: '2', created_at: new Date(now - 30000).toISOString(), mine: true },
    { id: '3', room_id: 'r', sender_id: A, nickname: 'مها', body: 'ولا اختبار التوافق 💜', client_id: '3', created_at: new Date(now).toISOString(), mine: true, pending: true },
  ] : [],
  sendMessage: async () => {}, retryMessage: async () => {}, unread: view === 'lobby' ? 2 : 0, setChatOpen: () => {}, partnerTyping: view === 'chat', notifyTyping: () => {},
  voice: null,
  voiceState: { status: view === 'pair' ? 'connected' : 'idle', micOn: view === 'pair', muted: false, remoteMuted: false, remoteAudio: view === 'pair', localSpeaking: false, remoteSpeaking: view === 'pair', needsTap: false, error: null, endedByPartner: false, relay: false },
  leave: async () => {},
}

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <HashRouter>
      <RoomCtx.Provider value={value}>
        <RoomScreen code="K7PX3M" />
      </RoomCtx.Provider>
    </HashRouter>
  </ToastProvider>,
)
if (view === 'chat') setTimeout(() => (document.querySelector('[aria-label="المحادثة"]') as HTMLElement)?.click(), 300)
