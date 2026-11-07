import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Lock, Minus, Plus, Send, Unlock } from 'lucide-react'
import type { GameDef } from '../types'
import type { Move } from '../../types/db'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { GameShell, WaitingCard } from '../engine/GameShell'
import { useGameApi, useMoveTimer, useSecrets } from '../engine/useGameApi'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { sfx, vibrate } from '../../lib/sound'
import { nameOf, otherOf } from '../engine/helpers'
import {
  C4_COLS,
  C4_ROWS,
  c4Outcome,
  c4Replay,
  chainCheck,
  chainReplay,
  chainSeconds,
  dotsOutcome,
  dotsReplay,
  lastLetter,
  liarReplay,
  liarSlot,
  liarValidBid,
} from '../engine/boards'
import { POS } from '../engine/generators'
import { BigTimer, Card, Flash, ScoreBar, TurnBanner, VoiceHint, countKind, useMoveFlash, useTurn } from './common'

const SEAT_COLOR: Record<number, string> = { 1: '#5fb0bb', 2: '#8d9fcf' }
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function Die({ v, hl, hidden, size = 44 }: { v?: number; hl?: boolean; hidden?: boolean; size?: number }) {
  return (
    <span
      className={`inline-grid place-items-center rounded-xl font-bold leading-none ${hidden ? 'bg-white/10 text-mist' : hl ? 'bg-champagne text-night-950' : 'bg-[#fdfbff] text-[#1d1228]'}`}
      style={{ width: size, height: size, fontSize: size * 0.8 }}
      aria-label={hidden ? 'نرد مخفي' : `نرد ${v}`}
    >
      {hidden ? '?' : FACES[(v ?? 1) - 1]}
    </span>
  )
}

/* ================================ كذّاب ================================ */
export function LiarGame({ def }: { def: GameDef }) {
  const { session, moves, players, myId, me } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName, partnerName } = useTurn()
  const secrets = useSecrets()
  const s = session!
  const start = Number(s.content?.start ?? 4)
  const st = useMemo(() => liarReplay(moves, players, start), [moves, players, start])
  const mySeat = me?.seat ?? 1
  const mySlot = liarSlot(st.round, mySeat)
  const myDice = (secrets[mySlot]?.v ?? []) as number[]
  const bothRolled = players.every((p) => st.rolled.has(liarSlot(st.round, p.seat)) || (st.dice[p.user_id] ?? 0) === 0)
  const total = Object.values(st.dice).reduce((a, b) => a + b, 0)
  const prev = st.bids.at(-1)
  const [q, setQ] = useState(1)
  const [f, setF] = useState(2)
  const rollReq = useRef('')
  useEffect(() => {
    if (st.over || st.reveal || st.rolled.has(mySlot) || (st.dice[myId] ?? 0) <= 0) return
    if (rollReq.current === mySlot) return
    rollReq.current = mySlot
    void api.secret('roll', mySlot, st.dice[myId], ['bad_move']).then((r) => !r && (rollReq.current = ''))
  }, [st.round, st.rolled, st.over, st.reveal, mySlot, myId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (prev) {
      setQ(prev.f === 6 ? prev.q + 1 : prev.q)
      setF(prev.f === 6 ? 1 : prev.f + 1)
    } else {
      setQ(1)
      setF(2)
    }
  }, [prev?.q, prev?.f, st.round]) // eslint-disable-line react-hooks/exhaustive-deps
  const flash = useMoveFlash(moves, useCallback((m: Move) => (m.move.kind === 'reveal_all' ? 'كذّاب!! 🫵' : null), []), 1200)
  useEffect(() => {
    if (flash) {
      sfx('flip')
      vibrate(30)
    }
  }, [flash])

  const valid = liarValidBid(prev, q, f, total)
  const r = st.reveal
  const loserDiceAfter = r ? (st.dice[r.loser] ?? 1) - 1 : 0

  return (
    <GameShell def={def} progress={`الجولة ${st.round} · على الطاولة ${total} نرد`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <ScoreBar scores={st.dice} unit="نرد" highlight={s.turn_player ?? undefined} />
      {r ? (
        <>
          <Card className="text-center mb-3">
            <p className="text-sm text-mist">المزايدة الأخيرة من {nameOf(r.bid.by, players)}</p>
            <p className="font-display text-2xl">
              {r.bid.q} × <Die v={r.bid.f} size={32} />
            </p>
            <p className="mt-2 font-display text-xl">
              الموجود فعلًا: {r.count} {r.count >= r.bid.q ? '— كان صادق! 😇' : '— كذّاب! 🤥'}
            </p>
          </Card>
          {players.map((p) => (
            <div key={p.user_id} className="mb-3">
              <p className="text-xs text-mist mb-1.5">{p.user_id === myId ? 'نردك' : `نرد ${p.nickname}`}</p>
              <div className="flex flex-wrap gap-1.5" dir="ltr">
                {(r.values[p.user_id] ?? []).map((v, i) => (
                  <Die key={i} v={v} hl={v === r.bid.f} />
                ))}
              </div>
            </div>
          ))}
          <p className="text-center my-3 font-medium">{nameOf(r.loser, players)} يخسر نرد 🎲</p>
          {myTurn ? (
            <Button
              variant="primary"
              size="lg"
              block
              loading={api.busy}
              icon={<ChevronLeft className="size-5" />}
              onClick={() => void api.move({ kind: 'next_round', pass_turn: r.loser !== myId, finish: loserDiceAfter <= 0 }, ['stale'])}
            >
              {loserDiceAfter <= 0 ? 'عرض النتيجة' : 'الجولة الجاية'}
            </Button>
          ) : (
            <WaitingCard text={`بانتظار ${turnName}…`} />
          )}
        </>
      ) : !bothRolled ? (
        <WaitingCard text="نرمي النرد… 🎲" />
      ) : (
        <>
          <div className="mb-4">
            <p className="text-xs text-mist mb-1.5">نردك (ما يشوفه {partnerName})</p>
            <div className="flex flex-wrap gap-1.5" dir="ltr">
              {myDice.map((v, i) => (
                <Die key={i} v={v} hl={prev?.f === v} />
              ))}
            </div>
            <p className="text-xs text-mist mt-3 mb-1.5">نرد {partnerName}</p>
            <div className="flex flex-wrap gap-1.5" dir="ltr">
              {Array.from({ length: st.dice[otherOf(myId, players) ?? ''] ?? 0 }, (_, i) => (
                <Die key={i} hidden size={36} />
              ))}
            </div>
          </div>
          <TurnBanner myTurn={myTurn} name={turnName} mine={prev ? 'دورك: زايد أو قل كذّاب!' : 'دورك: ابدأ المزايدة'} />
          {prev && (
            <div className="text-center mb-3">
              <span className="text-sm text-mist">آخر مزايدة ({nameOf(prev.by, players)}): </span>
              <span className="font-display text-xl">
                {prev.q} × <Die v={prev.f} size={28} />
              </span>
              <p className="text-xs text-mist">يعني: فيه على الأقل {prev.q} نرد على وجه {prev.f} (بنردكم الاثنين)</p>
            </div>
          )}
          {myTurn && (
            <Card>
              <div className="flex items-center justify-center gap-3 mb-3">
                <button onClick={() => setQ((x) => Math.max(1, x - 1))} className="size-11 rounded-xl glass grid place-items-center" aria-label="أقل">
                  <Minus className="size-5" />
                </button>
                <span className="font-display text-4xl tabular-nums w-12 text-center">{q}</span>
                <button onClick={() => setQ((x) => Math.min(total, x + 1))} className="size-11 rounded-xl glass grid place-items-center" aria-label="أكثر">
                  <Plus className="size-5" />
                </button>
                <span className="text-mist">×</span>
              </div>
              <div className="flex justify-center gap-1.5 mb-4" dir="ltr">
                {[1, 2, 3, 4, 5, 6].map((v) => (
                  <button key={v} onClick={() => setF(v)} className={`rounded-xl p-0.5 ${f === v ? 'ring-2 ring-iris-400' : ''}`} aria-label={`وجه ${v}`}>
                    <Die v={v} size={40} />
                  </button>
                ))}
              </div>
              <div className={`grid gap-3 ${prev ? 'grid-cols-2' : ''}`}>
                <Button variant="primary" size="lg" disabled={!valid} loading={api.busy} onClick={() => void api.move({ kind: 'bid', q, f, pass_turn: true }, ['stale'])}>
                  زايد {q} × {f}
                </Button>
                {prev && (
                  <Button variant="danger" size="lg" disabled={api.busy} onClick={() => void api.secret('reveal_prefix', `d${st.round}s`)}>
                    كذّاب! 🫵
                  </Button>
                )}
              </div>
              {!valid && <p className="text-xs text-rose-300 text-center mt-2">لازم المزايدة تكون أعلى من {prev ? `${prev.q} × ${prev.f}` : ''}</p>}
            </Card>
          )}
        </>
      )}
    </GameShell>
  )
}

/* ================================ النقاط والمربعات ================================ */
export function DotsGame({ def }: { def: GameDef }) {
  const { session, moves, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const s = session!
  const n = Number(s.content?.size ?? 4)
  const st = useMemo(() => dotsReplay(moves, n), [moves, n])
  const seatOf = (id?: string) => players.find((p) => p.user_id === id)?.seat ?? 1
  const G = 300
  const pad = 18
  const step = (G - pad * 2) / n
  const H = n * (n + 1)
  const prevBoxes = useRef(st.boxes.size)
  useEffect(() => {
    if (st.boxes.size > prevBoxes.current) sfx('match')
    else if (moves.length) sfx('tap')
    prevBoxes.current = st.boxes.size
  }, [st.boxes.size, moves.length])

  const lineGeom = (id: number) => {
    if (id < H) {
      const r = Math.floor(id / n)
      const c = id % n
      return { x1: pad + c * step, y1: pad + r * step, x2: pad + (c + 1) * step, y2: pad + r * step }
    }
    const v = id - H
    const r = Math.floor(v / (n + 1))
    const c = v % (n + 1)
    return { x1: pad + c * step, y1: pad + r * step, x2: pad + c * step, y2: pad + (r + 1) * step }
  }
  const play = (id: number) => {
    if (!myTurn || st.lines.has(id) || api.busy) return
    const out = dotsOutcome(st, id, n)
    vibrate(8)
    void api.move({ kind: 'line', id, pass_turn: !out.closes, finish: out.finished }, ['stale'])
  }

  return (
    <GameShell def={def} progress={`${st.lines.size} من ${2 * n * (n + 1)} خط`} onEnd={() => void api.end()}>
      <ScoreBar scores={st.scores} unit="مربع" highlight={s.turn_player ?? undefined} />
      <TurnBanner myTurn={myTurn} name={turnName} mine="دورك: ارسم خط ✏️" />
      <svg viewBox={`0 0 ${G} ${G}`} className="w-full max-w-md mx-auto block glass rounded-3xl touch-manipulation" style={{ direction: 'ltr' }} role="img" aria-label="لوحة النقاط">
        {[...st.boxes.entries()].map(([b, owner]) => {
          const r = Math.floor(b / n)
          const c = b % n
          const col = SEAT_COLOR[seatOf(owner)]
          return (
            <g key={`b${b}`}>
              <rect x={pad + c * step + 3} y={pad + r * step + 3} width={step - 6} height={step - 6} rx={6} fill={col} opacity={0.3} />
              <text x={pad + c * step + step / 2} y={pad + r * step + step / 2 + 6} textAnchor="middle" fontSize={step * 0.35} fill={col} fontWeight="bold">
                {(players.find((p) => p.user_id === owner)?.nickname ?? '')[0]}
              </text>
            </g>
          )
        })}
        {Array.from({ length: 2 * n * (n + 1) }, (_, id) => {
          const g = lineGeom(id)
          const owner = st.lines.get(id)
          return (
            <g key={id} onClick={() => play(id)} className={!owner && myTurn ? 'cursor-pointer' : ''}>
              <line {...g} stroke="transparent" strokeWidth={22} />
              <line
                {...g}
                stroke={owner ? SEAT_COLOR[seatOf(owner)] : 'currentColor'}
                strokeOpacity={owner ? 1 : 0.13}
                strokeWidth={owner ? (st.last === id ? 7 : 5) : 4}
                strokeLinecap="round"
                className="text-cloud"
              />
            </g>
          )
        })}
        {Array.from({ length: (n + 1) * (n + 1) }, (_, i) => (
          <circle key={`d${i}`} cx={pad + (i % (n + 1)) * step} cy={pad + Math.floor(i / (n + 1)) * step} r={4.5} className="fill-cloud" />
        ))}
      </svg>
      <p className="text-center text-xs text-mist mt-3">اضغط بين نقطتين لترسم خط. اللي يقفل مربع يلعب مرة ثانية!</p>
    </GameShell>
  )
}

/* ================================ أربعة في صف ================================ */
const C4_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#facc15' }
export function Connect4Game({ def }: { def: GameDef }) {
  const { session, moves, players, myId } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const s = session!
  const best = Number(s.content?.best ?? 3)
  const need = Math.ceil(best / 2)
  const st = useMemo(() => c4Replay(moves), [moves])
  const cur = st.current
  const seatOf = (id?: string | null) => players.find((p) => p.user_id === id)?.seat ?? 1
  const ended = Boolean(cur.winner || cur.draw)
  const winCells = new Set(cur.line.map(([r, c]) => `${r}:${c}`))
  const prevLen = useRef(moves.length)
  useEffect(() => {
    if (moves.length > prevLen.current) sfx(cur.winner ? 'win' : 'tap')
    prevLen.current = moves.length
  }, [moves.length, cur.winner])

  const drop = (col: number) => {
    if (!myTurn || ended || api.busy) return
    const out = c4Outcome(st, col, myId)
    if (!out) return
    vibrate(10)
    const finish = out.win ? (st.wins[myId] ?? 0) + 1 >= need : out.draw ? best === 1 : false
    void api.move({ kind: 'drop', col, pass_turn: true, finish }, ['stale'])
  }

  return (
    <GameShell def={def} progress={best > 1 ? `أفضل من ${best} · المباراة ${st.games.length + 1}` : 'مباراة وحدة'} onEnd={() => void api.end()}>
      <ScoreBar scores={st.wins} unit="فوز" highlight={s.turn_player ?? undefined} />
      {!ended ? (
        <TurnBanner myTurn={myTurn} name={turnName} mine="دورك: اختر عمود ⬇️" />
      ) : (
        <div className="mb-4 rounded-2xl glass px-4 py-3 text-center font-display text-lg">{cur.winner ? `${nameOf(cur.winner, players)} فاز بالمباراة! 🏆` : 'تعادل! 🤝'}</div>
      )}
      <div className="mx-auto max-w-md rounded-3xl p-2.5 sm:p-3 bg-[#1d2a33] shadow-2xl" dir="ltr">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {Array.from({ length: C4_COLS }, (_, c) => (
            <button key={c} onClick={() => drop(c)} disabled={!myTurn || ended} className="flex flex-col gap-1.5 sm:gap-2 rounded-xl hover:bg-white/10 disabled:hover:bg-transparent" aria-label={`العمود ${c + 1}`}>
              {Array.from({ length: C4_ROWS }, (_, r) => {
                const p = cur.board[r][c]
                return (
                  <motion.span
                    key={r}
                    initial={false}
                    animate={p ? { scale: [0.6, 1.08, 1], y: [-30, 0, 0] } : { scale: 1 }}
                    className={`block aspect-square rounded-full ${winCells.has(`${r}:${c}`) ? 'ring-4 ring-white' : ''}`}
                    style={{ background: p ? C4_COLORS[seatOf(p)] : '#05070a' }}
                  />
                )
              })}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-4 text-sm">
        {players.map((p) => (
          <span key={p.user_id} className="flex items-center gap-1.5">
            <span className="size-3.5 rounded-full" style={{ background: C4_COLORS[p.seat] }} />
            {p.user_id === myId ? 'أنت' : p.nickname}
          </span>
        ))}
      </div>
      {ended && s.status === 'playing' && (
        <div className="mt-4">
          {myTurn ? (
            <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'reset' }, ['stale'])}>
              المباراة الجاية (تبدأ أنت)
            </Button>
          ) : (
            <WaitingCard text={`${turnName} يبدأ المباراة الجاية…`} />
          )}
        </div>
      )}
    </GameShell>
  )
}

/* ================================ سلسلة الكلمات ================================ */
export function ChainGame({ def }: { def: GameDef }) {
  const { session, moves, players, myId } = useRoom()
  const api = useGameApi()
  const toast = useToast()
  const { myTurn, turnName, partnerName } = useTurn()
  const s = session!
  const c = s.content as { cat: string | null; target: number }
  const st = useMemo(() => chainReplay(moves), [moves])
  const started = moves.some((m) => m.move.kind === 'start')
  const lastMove = [...moves].reverse().find((m) => ['word', 'timeout', 'challenge', 'start'].includes(m.move.kind))
  const secs = chainSeconds(st.chain.length)
  const [text, setText] = useState('')
  const sent = useRef('')
  const turnP = s.turn_player ?? ''
  const other = otherOf(turnP, players) ?? ''
  const left = useMoveTimer(started ? lastMove?.created_at : null, secs, () => {
    const key = `${lastMove?.seq}`
    if (sent.current === key) return
    sent.current = key
    void api.move({ kind: 'timeout', winner: other, loser: turnP, finish: (st.points[other] ?? 0) + 1 >= c.target }, ['stale', 'session_closed'])
  })
  const flash = useMoveFlash(moves, useCallback((m: Move) => (m.move.kind === 'timeout' ? '⏰ خلص الوقت!' : m.move.kind === 'challenge' ? '✋ اعتراض!' : null), []), 1300)
  useEffect(() => {
    if (flash) sfx('wrong')
  }, [flash])
  const prev = st.chain.at(-1)
  const need = prev ? lastLetter(prev.word) : null

  const send = async () => {
    const v = text.trim()
    const err = chainCheck(st, v)
    if (err) {
      toast(err, 'error')
      vibrate(20)
      return
    }
    sent.current = `${lastMove?.seq}`
    const r = await api.move({ kind: 'word', text: v.slice(0, 30), pass_turn: true }, ['stale'])
    if (r) {
      setText('')
      sfx('select')
    } else sent.current = ''
  }

  return (
    <GameShell def={def} progress={`الفوز عند ${c.target} نقاط${c.cat ? ` · ${c.cat}` : ''}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <ScoreBar scores={st.points} unit="نقطة" highlight={turnP} />
      {st.lastEnd && (
        <p className="text-center text-sm text-mist mb-3">
          {st.lastEnd.kind === 'timeout' ? `خلص وقت ${nameOf(st.lastEnd.loser, players)} ⏰` : `${nameOf(st.lastEnd.winner, players)} اعترض على «${st.lastEnd.word}» ✋`} — نقطة لـ{nameOf(st.lastEnd.winner, players)}
        </p>
      )}
      {!started ? (
        <Card className="text-center">
          <p className="mb-4">{c.cat ? `الفئة: ${c.cat}. ` : ''}أول واحد يكتب أي كلمة، والثاني يكمّل من آخر حرف!</p>
          <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'start' }, ['stale'])}>
            ابدأ ⏱️
          </Button>
        </Card>
      ) : (
        <>
          <TurnBanner myTurn={myTurn} name={turnName} mine={need ? `دورك: كلمة تبدأ بـ «${need}»` : 'دورك: ابدأ بأي كلمة'} theirs={`${turnName} يفكر…`} />
          <BigTimer ms={left} total={secs} />
          <div className="glass rounded-3xl p-4 mb-3 min-h-24 flex flex-wrap gap-1.5 items-center content-start">
            {st.chain.length === 0 && <span className="text-mist text-sm">السلسلة فاضية… 🔗</span>}
            {st.chain.map((w, i) => (
              <motion.span key={i} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full px-3 py-1 text-[15px]" style={{ background: `${SEAT_COLOR[players.find((p) => p.user_id === w.by)?.seat ?? 1]}33` }}>
                {w.word}
                {i < st.chain.length - 1 && <span className="text-mist ms-1">←</span>}
              </motion.span>
            ))}
          </div>
          {myTurn ? (
            <>
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 30))}
                  onKeyDown={(e) => e.key === 'Enter' && void send()}
                  placeholder={need ? `كلمة تبدأ بـ ${need}…` : 'أي كلمة…'}
                  className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 text-lg focus:outline-none focus:ring-2 focus:ring-iris-400/50"
                  aria-label="كلمتك"
                  autoFocus
                  autoComplete="off"
                />
                <Button variant="primary" size="lg" disabled={!text.trim()} loading={api.busy} onClick={() => void send()} icon={<Send className="size-5 rtl:-scale-x-100" />} aria-label="أرسل" />
              </div>
              {prev && prev.by !== myId && (
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    if (!window.confirm(`تعترض على «${prev.word}»؟ (مو كلمة حقيقية أو مو من الفئة)`)) return
                    sent.current = `${lastMove?.seq}`
                    void api.move({ kind: 'challenge', winner: myId, loser: prev.by, pass_turn: true, finish: (st.points[myId] ?? 0) + 1 >= c.target }, ['stale'])
                  }}
                >
                  ✋ اعتراض على «{prev.word}»
                </Button>
              )}
            </>
          ) : (
            <WaitingCard text={`${partnerName} يكتب…`} />
          )}
        </>
      )}
    </GameShell>
  )
}

/* ================================ خزنة الكنز ================================ */
export function VaultGame({ def }: { def: GameDef }) {
  const { session, moves } = useRoom()
  const api = useGameApi()
  const toast = useToast()
  const secrets = useSecrets()
  const s = session!
  const c = s.content as { n: number; digits: number; seconds: number }
  const v = Math.min(countKind(moves, 'next') + 1, c.n)
  const started = moves.find((m) => m.move.kind === 'start' && Number(m.move.v) === v)
  const solved = moves.find((m) => m.move.kind === 'guess' && m.move.slot === `k${v}` && m.move.correct)
  const reveal = moves.find((m) => m.move.kind === 'reveal' && m.move.slot === `k${v}`)
  const tries = moves.filter((m) => m.move.kind === 'guess' && m.move.slot === `k${v}` && !m.move.correct)
  const half = (secrets[`c${v}a`]?.mine ? secrets[`c${v}a`]?.v : secrets[`c${v}b`]?.v) as string[] | undefined
  const done = Boolean(solved || reveal)
  const code = String(solved?.move.value ?? reveal?.move.value ?? '')
  const opened = countKind(moves, 'guess', (m) => Boolean(m.move.correct))
  const [digits, setDigits] = useState<string[]>([])
  const [shake, setShake] = useState(0)
  useEffect(() => setDigits([]), [v])
  const left = useMoveTimer(started && !done ? started.created_at : null, c.seconds, () => void api.secret('reveal', `k${v}`, null, ['round_closed', 'session_closed']))
  const flash = useMoveFlash(moves, useCallback((m: Move) => (m.move.kind === 'guess' && m.move.correct ? '🔓 انفتحت!' : null), []), 1600)
  useEffect(() => {
    if (flash) sfx('win')
  }, [flash])
  const prevTries = useRef(tries.length)
  useEffect(() => {
    if (tries.length > prevTries.current) {
      setShake((x) => x + 1)
      sfx('wrong')
      vibrate(40)
    }
    prevTries.current = tries.length
  }, [tries.length])

  const press = (d: string) => {
    sfx('tap')
    setDigits((x) => (x.length < c.digits ? [...x, d] : x))
  }
  const tryCode = async () => {
    if (digits.length !== c.digits) return
    const r = await api.secret('guess', `k${v}`, digits.join(''), ['round_closed'])
    if (r && !r.correct) toast('رقم غلط ❌ ارجعوا للتلميحات', 'error')
    setDigits([])
  }

  return (
    <GameShell def={def} progress={`الخزنة ${v} من ${c.n} · فتحتوا ${opened}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <VoiceHint />
      {!started ? (
        <Card className="text-center">
          <p className="text-6xl mb-3">🔐</p>
          <p className="mb-1 font-display text-xl">الخزنة رقم {v}</p>
          <p className="text-sm text-mist mb-4">كل واحد عنده نص التلميحات. تكلموا مع بعض وافتحوها قبل ما يخلص الوقت!</p>
          <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'start', v }, ['stale'])}>
            جاهزين؟ ابدأوا ⏱️
          </Button>
        </Card>
      ) : (
        <>
          {!done && <BigTimer ms={left} total={c.seconds} />}
          <Card className="mb-4">
            <p className="text-sm font-semibold mb-2">🔎 تلميحاتك (شريكك عنده غيرها)</p>
            <ul className="space-y-2">
              {(half ?? []).map((t) => (
                <li key={t} className="rounded-xl bg-white/5 px-3 py-2 text-[15px]">
                  {t}
                </li>
              ))}
              {!half && <li className="text-mist text-sm">نجيب تلميحاتك…</li>}
            </ul>
          </Card>
          <motion.div key={shake} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }} className="flex justify-center gap-2 mb-1" dir="ltr">
            {Array.from({ length: c.digits }, (_, i) => (
              <div key={i} className="text-center">
                <div className={`size-14 rounded-2xl grid place-items-center font-display text-3xl ${done ? (solved ? 'bg-emerald-500/20' : 'bg-rose-500/20') : 'glass'}`}>{done ? code[i] : (digits[i] ?? '')}</div>
                <span className="text-xs text-mist">{POS[i]}</span>
              </div>
            ))}
          </motion.div>
          {!done ? (
            <>
              <div className="grid grid-cols-5 gap-2 mt-3" dir="ltr">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
                  <button key={d} onClick={() => press(d)} className="h-12 rounded-xl glass font-display text-xl active:scale-95">
                    {d}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Button variant="glass" onClick={() => setDigits((x) => x.slice(0, -1))} disabled={!digits.length}>
                  مسح
                </Button>
                <Button variant="primary" disabled={digits.length !== c.digits} loading={api.busy} onClick={() => void tryCode()} icon={<Unlock className="size-5" />}>
                  افتح
                </Button>
              </div>
              {tries.length > 0 && <p className="text-center text-xs text-mist mt-2">محاولات غلط: {tries.map((t) => String(t.move.text)).join('، ')}</p>}
              <Button variant="ghost" size="sm" className="mt-2" icon={<Lock className="size-4" />} onClick={() => window.confirm('تستسلمون وتكشفون الرقم؟') && void api.secret('reveal', `k${v}`, null, ['round_closed'])}>
                استسلام
              </Button>
            </>
          ) : (
            <>
              <p className="text-center font-display text-xl my-4">{solved ? 'فتحتوها! أنتم فريق خرافي 🤝💞' : 'الخزنة قفلت… الرقم كان هذا 😅'}</p>
              <Button variant="primary" size="lg" block loading={api.busy} icon={<ChevronLeft className="size-5" />} onClick={() => void api.move({ kind: 'next', v, finish: v >= c.n }, ['stale'])}>
                {v >= c.n ? 'عرض النتيجة' : 'الخزنة الجاية'}
              </Button>
            </>
          )}
        </>
      )}
    </GameShell>
  )
}
