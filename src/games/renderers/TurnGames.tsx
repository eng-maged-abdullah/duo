import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Send, SkipForward } from 'lucide-react'
import type { GameDef } from '../types'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { GameShell, PromptCard, WaitingCard } from '../engine/GameShell'
import { useGameApi } from '../engine/useGameApi'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { sfx, vibrate } from '../../lib/sound'
import { supabase } from '../../lib/supabase/client'

function useTurn() {
  const { session, myId, players } = useRoom()
  const turn = session?.turn_player
  return { myTurn: turn === myId, turnName: players.find((p) => p.user_id === turn)?.nickname ?? '' }
}

function TurnBanner({ myTurn, name }: { myTurn: boolean; name: string }) {
  return (
    <div className={`mb-4 rounded-2xl px-4 py-2.5 text-center text-sm font-medium ${myTurn ? 'btn-primary text-white' : 'glass text-mist'}`} aria-live="polite">
      {myTurn ? 'دورك الآن ✨' : `دور ${name}`}
    </div>
  )
}

/* ---------------------------- صراحة أو تحدي ---------------------------- */
export function TruthDareGame({ def }: { def: GameDef }) {
  const { session, moves } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const s = session!
  const c = s.content as { total: number; truths: string[]; dares: string[] }
  const last = moves.at(-1)
  const picks = moves.filter((m) => m.move.kind === 'pick')
  const resolved = moves.filter((m) => m.move.kind === 'done' || m.move.kind === 'skip').length
  const active = last?.move.kind === 'pick' ? last : null
  const truthN = picks.filter((m) => m.move.choice === 'truth').length
  const dareN = picks.filter((m) => m.move.choice === 'dare').length

  const pick = (choice: 'truth' | 'dare') => {
    sfx('flip')
    const list = choice === 'truth' ? c.truths : c.dares
    const n = choice === 'truth' ? truthN : dareN
    void api.move({ kind: 'pick', choice, text: list[n % list.length] })
  }
  const resolve = (kind: 'done' | 'skip') => {
    sfx(kind === 'done' ? 'match' : 'tap')
    void api.move({ kind, pass_turn: true, finish: resolved + 1 >= c.total })
  }

  return (
    <GameShell def={def} progress={`البطاقة ${Math.min(resolved + 1, c.total)} من ${c.total}`} onEnd={() => void api.end()}>
      <TurnBanner myTurn={myTurn} name={turnName} />
      <AnimatePresence mode="wait">
        {!active ? (
          <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {myTurn ? (
              <div className="grid grid-cols-2 gap-3">
                <motion.button whileTap={{ scale: 0.96 }} disabled={api.busy} onClick={() => pick('truth')} className="min-h-40 rounded-[1.75rem] bg-gradient-to-br from-iris-500/40 to-iris-600/20 border border-iris-400/30 font-display text-2xl">
                  صراحة
                  <span className="block text-4xl mt-2">🗣️</span>
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }} disabled={api.busy} onClick={() => pick('dare')} className="min-h-40 rounded-[1.75rem] bg-gradient-to-br from-frost-500/40 to-frost-500/10 border border-frost-400/30 font-display text-2xl">
                  تحدي
                  <span className="block text-4xl mt-2">🔥</span>
                </motion.button>
              </div>
            ) : (
              <WaitingCard text={`${turnName} يختار: صراحة ولا تحدي؟`} />
            )}
          </motion.div>
        ) : (
          <motion.div key={`card-${active.seq}`} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: 'spring', damping: 20 }}>
            <PromptCard tag={active.move.choice === 'truth' ? 'صراحة 🗣️' : 'تحدي 🔥'}>{String(active.move.text)}</PromptCard>
            {myTurn ? (
              <div className="grid grid-cols-2 gap-3">
                <Button variant="primary" size="lg" icon={<Check className="size-5" />} loading={api.busy} onClick={() => resolve('done')}>
                  تم ✅
                </Button>
                <Button variant="glass" size="lg" icon={<SkipForward className="size-5" />} disabled={api.busy} onClick={() => resolve('skip')}>
                  تخطّي
                </Button>
              </div>
            ) : (
              <WaitingCard text={`${turnName} ينفّذ البطاقة…`} sub="تكلموا بالصوت أو بالشات" />
            )}
            <p className="mt-3 text-center text-xs text-mist">التخطي مسموح دائمًا وبدون أي خصم</p>
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  )
}

/* ------------------------------ افتح السؤال ------------------------------ */
export function OpenCardGame({ def }: { def: GameDef }) {
  const { session, moves } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const cards = (session!.content?.cards ?? []) as { k: 'q' | 'd'; t: string }[]
  const opened = new Set(moves.filter((m) => m.move.kind === 'open').map((m) => m.move.idx as number))
  const last = moves.at(-1)
  const current = last?.move.kind === 'open' ? (last.move.idx as number) : null

  return (
    <GameShell def={def} progress={`فُتحت ${opened.size} من ${cards.length}`} onEnd={() => void api.end()}>
      <TurnBanner myTurn={myTurn} name={turnName} />
      {current !== null && cards[current] ? (
        <motion.div key={current} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <PromptCard tag={cards[current].k === 'q' ? `سؤال #${current + 1}` : `تحدي #${current + 1}`}>{cards[current].t}</PromptCard>
          {myTurn ? (
            <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'next', pass_turn: true, finish: opened.size >= cards.length })}>
              {opened.size >= cards.length ? 'إنهاء اللعبة' : 'جاوبت — الدور للثاني'}
            </Button>
          ) : (
            <WaitingCard text={`${turnName} يجاوب…`} />
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {cards.map((_, i) => {
            const isOpen = opened.has(i)
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.94 }}
                disabled={!myTurn || isOpen || api.busy}
                onClick={() => {
                  sfx('flip')
                  void api.move({ kind: 'open', idx: i })
                }}
                className={`aspect-[3/4] rounded-2xl font-display text-2xl transition-all ${
                  isOpen ? 'bg-white/5 text-mist/40 line-through' : 'ring-gradient glass hover:bg-white/10 disabled:opacity-60'
                }`}
                aria-label={isOpen ? `البطاقة ${i + 1} مفتوحة` : `افتح البطاقة ${i + 1}`}
              >
                {isOpen ? '✓' : i + 1}
              </motion.button>
            )
          })}
        </div>
      )}
    </GameShell>
  )
}

/* -------------------------------- نبني قصة -------------------------------- */
export function StoryGame({ def }: { def: GameDef }) {
  const { session, moves, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const toast = useToast()
  const c = session!.content as { total: number; starter: string }
  const lines = moves.filter((m) => m.move.kind === 'line')
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [lines.length])
  const send = async () => {
    const v = text.trim().slice(0, 140)
    if (!v) return
    const res = await api.move({ kind: 'line', text: v, pass_turn: true, finish: lines.length + 1 >= c.total })
    if (res) setText('')
  }
  const seat = (id: string) => players.find((p) => p.user_id === id)?.seat ?? 1

  return (
    <GameShell def={def} progress={`الجملة ${Math.min(lines.length + 1, c.total)} من ${c.total}`} onEnd={() => void api.end()}>
      <TurnBanner myTurn={myTurn} name={turnName} />
      <div className="glass rounded-3xl p-5 mb-4 leading-loose text-[17px]">
        <span className="text-champagne">{c.starter} </span>
        {lines.map((m) => (
          <motion.span key={m.seq} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={seat(m.player_id) === 1 ? 'text-iris-300' : 'text-rose-300'}>
            {String(m.move.text)}{' '}
          </motion.span>
        ))}
        <div ref={endRef} />
      </div>
      {myTurn ? (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder="أضف جملتك…"
            maxLength={140}
            className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 focus:outline-none focus:ring-2 focus:ring-iris-400/50"
            aria-label="جملتك في القصة"
          />
          <Button variant="primary" size="lg" loading={api.busy} disabled={!text.trim()} onClick={() => void send()} icon={<Send className="size-5 rtl:-scale-x-100" />} aria-label="أضف" />
        </div>
      ) : (
        <WaitingCard text={`${turnName} يكتب الجملة الجاية…`} />
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        icon={<Copy className="size-4" />}
        onClick={() => {
          const story = [c.starter, ...lines.map((l) => l.move.text)].join(' ')
          navigator.clipboard?.writeText(story).then(
            () => toast('تم نسخ القصة'),
            () => toast('تعذّر النسخ', 'error'),
          )
        }}
      >
        نسخ القصة
      </Button>
    </GameShell>
  )
}

/* -------------------------------- ذاكرة DUO -------------------------------- */
export function MemoryGame({ def }: { def: GameDef }) {
  const { session, moves, players, myId } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const s = session!
  const c = s.content as { pairs: number; symbols: string[] }
  const matched = new Set<number>((s.state?.matched ?? []) as number[])
  const pending = s.state?.pending as number | null
  const known = useMemo(() => {
    const m = new Map<number, number>()
    for (const mv of moves) m.set(mv.move.card, mv.move.value)
    return m
  }, [moves])
  const last = moves.at(-1)
  const [peek, setPeek] = useState<number[]>([])
  const lastSeen = useRef(0)
  useEffect(() => {
    if (!last || last.seq === lastSeen.current) return
    lastSeen.current = last.seq
    if (last.move.first !== undefined) {
      if (last.move.match) sfx('match')
      else {
        sfx('wrong')
        setPeek([last.move.first, last.move.card])
        const t = setTimeout(() => setPeek([]), 1400)
        return () => clearTimeout(t)
      }
    } else sfx('flip')
  }, [last])

  const visible = (i: number) => matched.has(i) || pending === i || peek.includes(i)
  const scores = (s.state?.scores ?? {}) as Record<string, number>
  const cols = c.pairs * 2 <= 12 ? 'grid-cols-4' : c.pairs * 2 <= 16 ? 'grid-cols-4' : 'grid-cols-5'

  return (
    <GameShell def={def} progress={`أزواج مكتشفة ${matched.size / 2} من ${c.pairs}`} onEnd={() => void api.end()}>
      <TurnBanner myTurn={myTurn} name={turnName} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        {players.map((p) => (
          <div key={p.user_id} className={`glass rounded-2xl p-3 text-center ${s.turn_player === p.user_id ? 'ring-2 ring-iris-400/50' : ''}`}>
            <p className="text-xs text-mist truncate">{p.user_id === myId ? 'أنت' : p.nickname}</p>
            <p className="font-display text-2xl tabular-nums">{scores[p.user_id] ?? 0}</p>
          </div>
        ))}
      </div>
      <div className={`grid ${cols} gap-2.5 sm:gap-3`} style={{ perspective: 800 }}>
        {Array.from({ length: c.pairs * 2 }, (_, i) => {
          const show = visible(i)
          const v = known.get(i)
          return (
            <motion.button
              key={i}
              disabled={!myTurn || show || api.busy || peek.length > 0}
              onClick={() => {
                vibrate(8)
                void api.move({ card: i })
              }}
              animate={{ rotateY: show ? 180 : 0 }}
              transition={{ duration: 0.35 }}
              className="relative block w-full rounded-2xl [transform-style:preserve-3d]"
              aria-label={show && v !== undefined ? c.symbols[v] : `بطاقة ${i + 1}`}
            >
              <span className="block pb-[100%]" aria-hidden />
              <span className="absolute inset-0 grid place-items-center rounded-2xl border border-iris-400/30 bg-gradient-to-br from-iris-500/20 to-frost-500/10 [backface-visibility:hidden] text-iris-300/70 text-xl">✦</span>
              <span
                className={`absolute inset-0 grid place-items-center rounded-2xl text-3xl sm:text-4xl [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                  matched.has(i) ? 'bg-emerald-500/15 border border-emerald-400/30' : 'bg-white/10 border border-white/15'
                }`}
              >
                {v !== undefined ? c.symbols[v] : ''}
              </span>
            </motion.button>
          )
        })}
      </div>
    </GameShell>
  )
}

/* ------------------------------- توقع الرقم ------------------------------- */
export function NumberGame({ def }: { def: GameDef }) {
  const { session, moves, myId, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const s = session!
  const st = s.state as { round: number; setter: string; phase: 'set' | 'guess'; attempts: number }
  const [val, setVal] = useState('')
  const [mySecret, setMySecret] = useState<number | null>(null)
  const iAmSetter = st.setter === myId
  const roundGuesses = moves.filter((m) => m.move.kind === 'guess' && m.move.round === st.round)
  const lastOver = [...moves].reverse().find((m) => m.move.round_over)
  const guesserName = players.find((p) => p.user_id !== st.setter)?.nickname ?? ''
  const setterName = players.find((p) => p.user_id === st.setter)?.nickname ?? ''

  // الرقم السري لا يقرؤه إلا صاحبه (سياسة RLS)
  useEffect(() => {
    if (!iAmSetter || st.phase !== 'guess') return setMySecret(null)
    let alive = true
    let sb
    try {
      sb = supabase()
    } catch {
      return
    }
    sb
      .from('game_secrets')
      .select('secret')
      .eq('session_id', s.id)
      .eq('slot', `number_${st.round}`)
      .maybeSingle()
      .then(({ data }) => alive && setMySecret(data ? Number(data.secret) : null))
    return () => {
      alive = false
    }
  }, [iAmSetter, st.phase, st.round, s.id])

  const n = parseInt(val, 10)
  const valid = Number.isInteger(n) && n >= 1 && n <= 100
  const submit = async () => {
    if (!valid) return
    const res = await api.move(st.phase === 'set' ? { kind: 'set', value: n } : { kind: 'guess', value: n })
    if (res) {
      setVal('')
      sfx(st.phase === 'set' ? 'select' : 'tap')
    }
  }

  return (
    <GameShell def={def} progress={`الجولة ${st.round} من ${s.rounds_total} · ${setterName} يخبّي الرقم`} onEnd={() => void api.end()}>
      <TurnBanner myTurn={myTurn} name={turnName} />
      {lastOver && lastOver.move.round === st.round - 1 && st.phase === 'set' && (
        <div className="glass rounded-2xl p-3 mb-4 text-center text-sm">
          الجولة السابقة: الرقم كان <b className="font-display text-lg">{lastOver.move.secret}</b> — {lastOver.move.solved ? `عرفه في ${lastOver.move.attempt} محاولات 🎯` : 'ما انعرف 😅'}
        </div>
      )}
      {st.phase === 'set' ? (
        iAmSetter ? (
          <PromptCard>اختر رقمًا سريًا من 1 إلى 100</PromptCard>
        ) : (
          <WaitingCard text={`${setterName} يختار رقمًا سريًا…`} sub="الرقم يُحفظ في الخادم ولا يظهر لك" />
        )
      ) : (
        <>
          <PromptCard tag={`المحاولات ${st.attempts} / 8`}>
            {iAmSetter ? (
              <>
                رقمك السري: <span className="font-display text-gradient text-3xl">{mySecret ?? '••'}</span>
              </>
            ) : (
              'خمّن الرقم السري من 1 إلى 100'
            )}
          </PromptCard>
          <div className="mb-4 flex flex-wrap justify-center gap-2" aria-live="polite">
            {roundGuesses.map((g) => (
              <span
                key={g.seq}
                className={`rounded-xl px-3 py-1.5 font-display tabular-nums ${g.move.hint === 'correct' ? 'bg-emerald-500/20 text-emerald-200' : 'glass'}`}
              >
                {g.move.value} {g.move.hint === 'higher' ? '⬆️ أكبر' : g.move.hint === 'lower' ? '⬇️ أصغر' : '🎯'}
              </span>
            ))}
          </div>
          {!myTurn && <WaitingCard text={`${guesserName} يخمّن…`} />}
        </>
      )}
      {myTurn && (
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={val}
            onChange={(e) => setVal(e.target.value.replace(/[^0-9٠-٩]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).slice(0, 3))}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="1 – 100"
            className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 text-center font-display text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-iris-400/50"
            aria-label={st.phase === 'set' ? 'الرقم السري' : 'تخمينك'}
            dir="ltr"
          />
          <Button variant="primary" size="lg" disabled={!valid} loading={api.busy} onClick={() => void submit()}>
            {st.phase === 'set' ? 'خبّيه' : 'خمّن'}
          </Button>
        </div>
      )}
    </GameShell>
  )
}
