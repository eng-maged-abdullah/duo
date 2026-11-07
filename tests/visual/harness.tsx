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
import { roomsApi } from '../../src/lib/rooms/api'
import { makeScene, makeVault } from '../../src/games/engine/generators'
import type { Answer, GameSession, Move, Player } from '../../src/types/db'

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'
const now = Date.now()
const players: Player[] = [
  { room_id: 'r', user_id: A, nickname: 'مها', seat: 1, joined_at: '' },
  { room_id: 'r', user_id: B, nickname: 'سعد', seat: 2, joined_at: '' },
]
const view = new URLSearchParams(location.search).get('view') ?? 'lobby'
if (new URLSearchParams(location.search).get('theme') === 'light') document.documentElement.classList.add('light')

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
const mv = (seq: number, p: string, move: Record<string, unknown>, ago = 5): Move => ({ session_id: 's1', room_id: 'r', seq, player_id: p, move, created_at: new Date(now - ago * 1000).toISOString() })
let secrets: Record<string, { v: unknown; mine: boolean; revealed: boolean }> = {}
const api = roomsApi as unknown as Record<string, unknown>
api.secrets = async () => ({ ok: true, secrets })
api.dailyGet = async () => ({ ok: true, mine: 'أحب لما نضحك على نفس الشي بنفس اللحظة 😂', theirs: 'لما تتصل فجأة بس عشان تسمع صوتي 💜', their_done: true, streak: 6, history: [] })
api.letterList = async () => ({ ok: true, now: new Date(now).toISOString(), letters: [
  { id: '1', author_id: B, unlock_at: new Date(now + 3 * 86400e3).toISOString(), created_at: '', open: false, body: null },
  { id: '2', author_id: A, unlock_at: new Date(now - 86400e3).toISOString(), created_at: '', open: true, body: 'صباح الخير يا أحلى شي صار لي 🌸' },
] })
api.stats = async () => ({ ok: true, games: 42, days: 12, since: new Date(now - 30 * 86400e3).toISOString(), letters: 5, moments: 8, dreams: 10, dreams_done: 3, daily: 9 })

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
  case 'drawguess-choose': session = sess('draw-guess', { turn_player: A }); secrets = { w1: { v: [{ w: 'قطة' }, { w: 'رائد فضاء' }, { w: 'برج خليفة' }], mine: true, revealed: false } }; break
  case 'drawguess-draw': session = sess('draw-guess', { turn_player: A }); secrets = { w1: { v: { w: 'رائد فضاء' }, mine: true, revealed: false } }; moves = [mv(1, A, { kind: 'chosen', slot: 'w1', d: 1, len: 8, words: 2 }, 20)]; break
  case 'drawguess-guess': session = sess('draw-guess', { turn_player: B }); moves = [mv(1, B, { kind: 'chosen', slot: 'w1', d: 1, len: 8, words: 2 }, 30), mv(2, A, { kind: 'guess', slot: 'w1', text: 'طيار', correct: false }), mv(3, A, { kind: 'guess', slot: 'w1', text: 'صاروخ', correct: false })]; break
  case 'describe': session = sess('draw-describe', { turn_player: A }); secrets = { p1: { v: makeScene(seededRng(5), 3), mine: true, revealed: false } }; moves = [mv(1, A, { kind: 'start', turn: 1 }, 25)]; break
  case 'describe-reveal': session = sess('draw-describe', { turn_player: A }); moves = [mv(1, A, { kind: 'start', turn: 1 }, 95), mv(2, A, { kind: 'reveal', slot: 'p1', value: makeScene(seededRng(5), 3) })]; break
  case 'taboo': session = sess('taboo', { turn_player: A }); secrets = { d1: { v: [{ w: 'قهوة', f: ['بن', 'فنجان', 'كافيين', 'صباح'] }], mine: true, revealed: false } }; moves = [mv(1, A, { kind: 'start', turn: 1 }, 20)]; break
  case 'taboo-guess': session = sess('taboo', { turn_player: B }); moves = [mv(1, B, { kind: 'start', turn: 1 }, 20), mv(2, B, { kind: 'card', turn: 1, res: 'got', w: 'شاي' })]; break
  case 'nolaugh': session = sess('no-laugh', { turn_player: B }); moves = [mv(1, B, { kind: 'start', turn: 1 }, 8)]; break
  case 'forbidden': session = sess('forbidden'); moves = [mv(1, A, { kind: 'start', round: 1 }, 15), mv(2, B, { kind: 'catch', round: 1 }, 6)]; break
  case 'tongue': session = sess('tongue', { turn_player: B }); break
  case 'hum': session = sess('hum', { turn_player: B }); moves = [mv(1, B, { kind: 'secret_set', slot: 'h1' }, 12), mv(2, A, { kind: 'guess', slot: 'h1', text: 'طيور الجنة', correct: false })]; break
  case 'twenty': session = sess('twenty', { turn_player: A }); secrets = { t1: { v: 'زرافة', mine: true, revealed: false } }; moves = [mv(1, A, { kind: 'secret_set', slot: 't1' }), mv(2, A, { kind: 'ans', turn: 1, v: 'yes' }), mv(3, A, { kind: 'ans', turn: 1, v: 'no' }), mv(4, A, { kind: 'ans', turn: 1, v: 'maybe' })]; break
  case 'twotruths': session = sess('two-truths', { turn_player: B }); moves = [mv(1, B, { kind: 'secret_set', slot: 'lie1' }), mv(2, B, { kind: 'statements', turn: 1, items: ['سافرت اليابان لحالي', 'عمري ما ركبت دراجة', 'أعرف أطبخ كبسة'] })]; break
  case 'twotruths-write': session = sess('two-truths', { turn_player: A }); break
  case 'compliments': session = sess('compliments', { turn_player: A }); moves = [mv(1, A, { kind: 'start' }, 40), mv(2, A, { kind: 'c', text: 'ضحكتك تخلي يومي أحلى 😍' }, 30), mv(3, B, { kind: 'react', seq: 2, to: A }, 28), mv(4, B, { kind: 'c', text: 'وأنت صوتك أحلى أغنية 🎶' }, 10)]; break
  case 'reflex': session = sess('reflex', { round_started_at: new Date(now - 1500).toISOString() }); break
  case 'wordrace': session = sess('word-race'); break
  case 'wordrace-reveal': session = sess('word-race', { phase: 'revealed' }); answers = [ans(1, A, { words: ['موز', 'مانجو', 'مشمش', 'ملوخية'] }), ans(1, B, { words: ['مانجو', 'مكرونة', 'مندي'] })]; break
  case 'bet': session = sess('bet'); break
  case 'bet-reveal': session = sess('bet', { phase: 'revealed' }); answers = [ans(1, A, { self: 0, guess: 1, bet: 30 }), ans(1, B, { self: 1, guess: 2, bet: 20 })]; break
  case 'dream': session = sess('dream', { round: 2 }, { plan: 'trip' }); answers = [ans(1, A, { choice: 1 }), ans(1, B, { choice: 1 })]; break
  case 'dumb': session = sess('dumb', { phase: 'revealed' }); answers = [ans(1, A, { text: 'عشان الغيم يحب اللون الأزرق ويغار منه البحر' }), { ...ans(1, B, { text: 'لأن أحد نسى يطفي الشاشة 😂' }) }]; break
  case 'liar': { session = sess('liar', { turn_player: A }, { dice: '4' }); secrets = { d1s1: { v: [6, 2, 6, 4], mine: true, revealed: false } }; moves = [mv(1, A, { kind: 'rolled', slot: 'd1s1', n: 4 }), mv(2, B, { kind: 'rolled', slot: 'd1s2', n: 4 }), mv(3, B, { kind: 'bid', q: 2, f: 6 })]; break }
  case 'liar-reveal': { session = sess('liar', { turn_player: A }, { dice: '4' }); moves = [mv(1, A, { kind: 'rolled', slot: 'd1s1', n: 4 }), mv(2, B, { kind: 'rolled', slot: 'd1s2', n: 4 }), mv(3, B, { kind: 'bid', q: 4, f: 6 }), mv(4, A, { kind: 'reveal_all', prefix: 'd1s', values: { d1s1: [6, 2, 6, 4], d1s2: [1, 3, 5, 5] } })]; break }
  case 'dots': session = sess('dots', { turn_player: A }); moves = [0, 4, 12, 13, 20, 1, 5, 14].map((id, i) => mv(i + 1, i % 2 ? B : A, { kind: 'line', id })); break
  case 'connect4': session = sess('connect4', { turn_player: A }); moves = [3, 3, 4, 2, 5, 4, 2].map((c, i) => mv(i + 1, i % 2 ? B : A, { kind: 'drop', col: c })); break
  case 'chain': session = sess('chain', { turn_player: A }); moves = [mv(1, A, { kind: 'start' }, 30), mv(2, A, { kind: 'word', text: 'قلم' }, 25), mv(3, B, { kind: 'word', text: 'موز' }, 4)]; break
  case 'vault': { const v = makeVault(seededRng(9), 3); session = sess('vault', { turn_player: A }); secrets = { c1a: { v: v.a, mine: true, revealed: false } }; moves = [mv(1, A, { kind: 'start', v: 1 }, 40), mv(2, B, { kind: 'guess', slot: 'k1', text: '123', correct: false }, 10)]; break }
  case 'continue': session = sess('draw-continue', { turn_player: A }); moves = [mv(1, B, { kind: 'stroke' })]; break
  case 'results-night': session = sess('bet', { status: 'finished', round: 1 }, {}); session.content = { ...session.content, night: { id: 'mix', step: 3 }, stake: 'الخسران يعزم الثاني على قهوة ☕' }; answers = [ans(1, A, { self: 0, guess: 1, bet: 30 }), ans(1, B, { self: 1, guess: 2, bet: 20 })]; break
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
  deleteRoom: async () => null,
  sendLive: () => {},
  onLive: () => () => {},
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
if (view === 'corner' || view === 'corner-letters' || view === 'corner-stats')
  setTimeout(() => {
    ;(document.querySelector('[aria-label="ركننا"]') as HTMLElement)?.click()
    if (view !== 'corner') setTimeout(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(view === 'corner-letters' ? 'رسائل' : 'إحصائيات'))?.click(), 400)
  }, 400)
if (view === 'setup')
  setTimeout(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('الكلمة الممنوعة'))?.click(), 500)
if (view === 'night')
  setTimeout(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('سهرة منوّعة'))?.click(), 500)
if (view === 'chat') setTimeout(() => (document.querySelector('[aria-label="المحادثة"]') as HTMLElement)?.click(), 300)
