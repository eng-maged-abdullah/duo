import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, Plus, X } from 'lucide-react'
import type { GameDef } from '../types'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { GameShell, PromptCard, WaitingCard } from '../engine/GameShell'
import { useCountdown, useGameApi } from '../engine/useGameApi'
import { Button } from '../../components/ui/Button'
import { sfx, vibrate } from '../../lib/sound'
import { Card, ScoreBar, Stars, StarsInput } from './common'
import { betChips, dreamFlip, raceScore, type BetItem, type DreamItem, type RaceItem } from '../defs2'
import type { ReflexRound } from '../engine/generators'

function useRoundBits(def: GameDef) {
  const r = useRoom()
  const s = r.session!
  const round = s.round
  const mine = r.answers.find((a) => a.round === round && a.player_id === r.myId)
  const theirs = r.answers.find((a) => a.round === round && a.player_id === (r.partner?.user_id ?? ''))
  const revealed = s.phase === 'revealed'
  const partnerAnswered = s.answered.includes(r.partner?.user_id ?? '')
  const scores = useMemo(
    () => def.summarize({ session: s, answers: r.answers, moves: r.moves, players: [...r.players].sort((a, b) => a.seat - b.seat) }).scores ?? {},
    [def, s, r.answers, r.moves, r.players],
  )
  return { ...r, s, round, mine, theirs, revealed, partnerAnswered, scores, last: round >= s.rounds_total, pName: r.partner?.nickname ?? 'شريكك' }
}

function NextBtn({ busy, last, onNext, disabled, label }: { busy: boolean; last: boolean; onNext: () => void; disabled?: boolean; label?: string }) {
  return (
    <div className="mt-5">
      <Button variant="primary" size="lg" block disabled={disabled} loading={busy} onClick={onNext} icon={<ChevronLeft className="size-5" />}>
        {label ?? (last ? 'عرض النتيجة' : 'الجولة التالية')}
      </Button>
    </div>
  )
}

/* ================================ سباق الكلمات ================================ */
export function WordRaceGame({ def }: { def: GameDef }) {
  const b = useRoundBits(def)
  const api = useGameApi()
  const item = (b.s.content?.items ?? [])[b.round - 1] as RaceItem
  const [words, setWords] = useState<string[]>([])
  const [text, setText] = useState('')
  const sentRound = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setWords([])
    setText('')
  }, [b.round])
  const submit = (list = words) => {
    if (sentRound.current === b.round || b.mine) return
    sentRound.current = b.round
    const extra = text.trim() ? [text.trim()] : []
    void api.answer(b.round, { words: [...list, ...extra].slice(0, 80).map((w) => w.slice(0, 30)) })
  }
  const left = useCountdown(b.s.round_deadline, b.serverNow, () => {
    // ننتظر شوي عشان توصل إجابة الثاني قبل الكشف
    setTimeout(() => void api.expire(b.round), 1600)
  })
  useEffect(() => {
    if (left !== null && left <= 600 && !b.mine && !b.revealed) submit()
  }, [left]) // eslint-disable-line react-hooks/exhaustive-deps
  const add = () => {
    const v = text.trim()
    if (!v) return
    if (!words.includes(v)) setWords((w) => [...w, v])
    setText('')
    sfx('tap')
    inputRef.current?.focus()
  }
  const res = b.revealed ? raceScore(b.mine?.answer?.words, b.theirs?.answer?.words, item.letter) : null

  return (
    <GameShell def={def} progress={`الجولة ${b.round} من ${b.s.rounds_total}`} timeLeft={!b.revealed ? left : null} totalSeconds={b.s.round_seconds} onEnd={() => void api.end()}>
      <ScoreBar scores={b.scores} unit="كلمة" />
      <PromptCard tag={item.letter ? `حرف «${item.letter}»` : 'أي حرف'}>{item.prompt}</PromptCard>
      {!b.revealed && !b.mine ? (
        <>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 30))}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="اكتب كلمة واضغط Enter…"
              className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 text-lg focus:outline-none focus:ring-2 focus:ring-iris-400/50"
              aria-label="كلمة"
              autoComplete="off"
              autoFocus
            />
            <Button variant="soft" size="lg" onClick={add} icon={<Plus className="size-5" />} aria-label="أضف" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 min-h-10">
            {words.map((w) => (
              <button key={w} onClick={() => setWords((x) => x.filter((y) => y !== w))} className="rounded-full bg-iris-500/20 px-3 py-1 text-sm">
                {w} ×
              </button>
            ))}
          </div>
          <p className="text-center text-sm text-mist mt-2">{words.length} كلمة</p>
          <Button variant="glass" block className="mt-3" onClick={() => submit()} icon={<Check className="size-5" />}>
            خلصت!
          </Button>
          {b.partnerAnswered && <p className="mt-3 text-center text-sm text-emerald-300">✓ {b.pName} خلّص</p>}
        </>
      ) : !b.revealed ? (
        <WaitingCard text="انتظر نهاية الوقت…" sub={`أرسلت ${b.mine?.answer?.words?.length ?? 0} كلمة`} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { n: 'أنت', list: (b.mine?.answer?.words ?? []) as string[], valid: res!.validA, pts: res!.a },
              { n: b.pName, list: (b.theirs?.answer?.words ?? []) as string[], valid: res!.validB, pts: res!.b },
            ].map((x) => (
              <Card key={x.n} className="!p-3">
                <p className="text-xs text-mist mb-2">
                  {x.n} · <b className="text-cloud">+{x.pts}</b>
                </p>
                <div className="flex flex-wrap gap-1">
                  {x.list.map((w) => {
                    const shared = res!.shared.some((s) => s.trim() === w.trim())
                    const ok = x.valid.includes(w.trim())
                    return (
                      <span key={w} className={`rounded-full px-2 py-0.5 text-[13px] ${!ok ? 'line-through text-mist/60' : shared ? 'bg-champagne/20 text-champagne' : 'bg-emerald-500/15 text-emerald-200'}`}>
                        {w}
                      </span>
                    )
                  })}
                  {!x.list.length && <span className="text-mist text-sm">ولا كلمة 😅</span>}
                </div>
              </Card>
            ))}
          </div>
          {res!.shared.length > 0 && <p className="text-center text-sm text-champagne mt-3">فكرتوا بنفس الكلمات: {res!.shared.join('، ')} — انلغت 🧠💞</p>}
          <NextBtn busy={api.busy} last={b.last} onNext={() => void api.next(b.round)} />
        </>
      )}
    </GameShell>
  )
}

/* ================================ ضغطة الانعكاس ================================ */
const tileColor: Record<string, string> = { red: '#dc2626', green: '#16a34a', yellow: '#eab308', orange: '#ea580c', blue: '#2563eb' }
export function ReflexGame({ def }: { def: GameDef }) {
  const b = useRoundBits(def)
  const api = useGameApi()
  const item = (b.s.content?.items ?? [])[b.round - 1] as ReflexRound
  const t0 = new Date(b.s.round_started_at).getTime()
  const [elapsed, setElapsed] = useState(0)
  const goShown = useRef<number | null>(null)
  const [local, setLocal] = useState<{ early?: boolean; rt?: number } | null>(null)
  useEffect(() => {
    goShown.current = null
    setLocal(null)
  }, [b.round])
  useEffect(() => {
    if (b.revealed || b.mine) return
    let raf = 0
    const tick = () => {
      const e = b.serverNow() - t0
      setElapsed(e)
      if (e >= item.go && goShown.current === null) goShown.current = performance.now() - (e - item.go)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [b.revealed, b.mine, t0, item.go, b.serverNow])
  useCountdown(b.s.round_deadline, b.serverNow, () => void api.expire(b.round))

  const ev = [...item.events].reverse().find((x) => x.at <= elapsed)
  const isGo = elapsed >= item.go
  const tap = () => {
    if (b.mine || local || b.revealed) return
    if (isGo && goShown.current !== null) {
      const rt = Math.max(1, Math.round(performance.now() - goShown.current))
      setLocal({ rt })
      sfx('match')
      void api.answer(b.round, { tap: true, rt, early: false })
    } else {
      setLocal({ early: true })
      sfx('wrong')
      vibrate(40)
      void api.answer(b.round, { tap: true, early: true })
    }
  }

  const label = (a?: { rt?: number; early?: boolean }) => (!a ? 'ما ضغط ⏳' : a.early ? 'ضغط بدري ❌' : `${a.rt} ms`)
  const my = b.mine?.answer as { rt?: number; early?: boolean } | undefined
  const th = b.theirs?.answer as { rt?: number; early?: boolean } | undefined
  const val = (a?: { rt?: number; early?: boolean }) => (a && !a.early && a.rt ? a.rt : Infinity)
  const iWin = val(my) < val(th)
  const tie = val(my) === val(th)

  let bg = '#1a2229'
  let content: React.ReactNode = 'استعد… 👀'
  if (elapsed >= 1300 || ev) {
    if (item.variant === 'green') {
      bg = isGo ? tileColor.green : tileColor[ev?.show ?? 'red'] ?? tileColor.red
      content = isGo ? 'اضغط!' : ev ? '…' : 'انتظر 🔴'
    } else {
      bg = '#10161b'
      content = <span className={item.variant === 'emoji' ? 'text-8xl' : 'font-display text-5xl'}>{ev?.show ?? '…'}</span>
    }
  }

  return (
    <GameShell def={def} progress={`الجولة ${b.round} من ${b.s.rounds_total}`} onEnd={() => void api.end()}>
      <ScoreBar scores={b.scores} unit="جولة" />
      <p className="text-center font-display text-lg mb-3">{item.prompt}</p>
      {!b.revealed ? (
        <>
          <motion.button
            onPointerDown={tap}
            disabled={Boolean(b.mine || local)}
            className="w-full aspect-square max-h-[56dvh] rounded-[2rem] grid place-items-center font-display text-4xl select-none touch-none shadow-2xl"
            style={{ background: local ? '#1a2229' : bg, color: '#fff', transition: 'background 60ms' }}
            aria-label="اضغط هنا"
          >
            {local ? (local.early ? 'بدري! ❌' : `${local.rt} ms ⚡`) : content}
          </motion.button>
          {(b.mine || local) && <p className="text-center text-sm text-mist mt-3">بانتظار {b.pName}…</p>}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className={`text-center ${!tie && iWin ? 'ring-2 ring-emerald-400/60' : ''}`}>
              <p className="text-xs text-mist">أنت</p>
              <p className="font-display text-2xl mt-1">{label(my)}</p>
              {!tie && iWin && <p className="mt-1">🏆</p>}
            </Card>
            <Card className={`text-center ${!tie && !iWin ? 'ring-2 ring-emerald-400/60' : ''}`}>
              <p className="text-xs text-mist">{b.pName}</p>
              <p className="font-display text-2xl mt-1">{label(th)}</p>
              {!tie && !iWin && <p className="mt-1">🏆</p>}
            </Card>
          </div>
          <NextBtn busy={api.busy} last={b.last} onNext={() => void api.next(b.round)} />
        </>
      )}
    </GameShell>
  )
}

/* ================================ أغبى إجابة ================================ */
export function RatedGame({ def }: { def: GameDef }) {
  const b = useRoundBits(def)
  const api = useGameApi()
  const item = (b.s.content?.items ?? [])[b.round - 1] as { prompt: string; placeholder?: string; real?: string }
  const [text, setText] = useState('')
  useEffect(() => setText(''), [b.round])
  const myRatingOfThem = b.theirs?.rating ?? null
  return (
    <GameShell def={def} progress={`الجولة ${b.round} من ${b.s.rounds_total}`} onEnd={() => void api.end()}>
      <ScoreBar scores={b.scores} unit="⭐" />
      <PromptCard tag="سؤال جاد جدًا 🧐">{item.prompt}</PromptCard>
      <AnimatePresence mode="wait">
        {!b.revealed && !b.mine ? (
          <motion.div key="in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              rows={3}
              placeholder={item.placeholder ?? 'أضحك إجابة غلط…'}
              className="w-full resize-none rounded-2xl glass px-4 py-3 leading-relaxed focus:outline-none focus:ring-2 focus:ring-iris-400/50"
              aria-label="إجابتك"
            />
            <Button variant="primary" block className="mt-3" disabled={!text.trim()} loading={api.busy} onClick={() => void api.answer(b.round, { text: text.trim() })}>
              أرسل إجابتي 🤪
            </Button>
            {b.partnerAnswered && <p className="mt-3 text-center text-sm text-emerald-300">✓ {b.pName} جاوب</p>}
          </motion.div>
        ) : !b.revealed ? (
          <WaitingCard key="w" text={`بانتظار ${b.pName}…`} />
        ) : (
          <motion.div key="r" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <Card>
              <p className="text-xs text-mist mb-1">إجابتك</p>
              <p className="leading-relaxed">{String(b.mine?.answer?.text ?? '—')}</p>
              <div className="mt-2 text-sm text-mist">{b.mine?.rating ? <>تقييم {b.pName}: <Stars n={b.mine.rating} /></> : `بانتظار تقييم ${b.pName}…`}</div>
            </Card>
            <Card>
              <p className="text-xs text-mist mb-1">إجابة {b.pName}</p>
              <p className="leading-relaxed">{String(b.theirs?.answer?.text ?? 'ما جاوب')}</p>
              {b.theirs && (
                <div className="mt-3">
                  {myRatingOfThem ? <Stars n={myRatingOfThem} /> : <StarsInput disabled={api.busy} onRate={(n) => void api.rate(b.round, b.theirs!.player_id, n)} />}
                </div>
              )}
            </Card>
            {item.real && <p className="text-center text-xs text-mist">الجواب الصحيح (للعلم 🤓): {item.real}</p>}
            <NextBtn busy={api.busy} last={b.last} disabled={Boolean(b.theirs) && !myRatingOfThem} onNext={() => void api.next(b.round)} label={b.theirs && !myRatingOfThem ? 'قيّم إجابته أول ⭐' : undefined} />
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  )
}

/* ================================ نخطط حلمنا ================================ */
const coins = (n: number) => '💰'.repeat(n)
export function DreamGame({ def }: { def: GameDef }) {
  const b = useRoundBits(def)
  const api = useGameApi()
  const c = b.s.content as { items: DreamItem[]; budget: number; intro: string; label: string; emoji: string }
  const item = c.items[b.round - 1]
  const myPast = b.answers.filter((a) => a.player_id === b.myId && a.round < b.round)
  const spent = myPast.reduce((sum, a) => sum + (c.items[a.round - 1]?.o[a.answer.choice]?.c ?? 0), 0)
  const remaining = c.budget - spent
  const roundsAfter = b.s.rounds_total - b.round
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [b.round])
  const plan = useMemo(() => {
    const out: { e: string; q: string; t: string; agree: boolean }[] = []
    for (let r = 1; r < b.round || (r === b.round && b.revealed); r++) {
      const it = c.items[r - 1]
      const a = b.answers.find((x) => x.round === r && x.player_id === b.myId)?.answer?.choice
      const t = b.answers.find((x) => x.round === r && x.player_id !== b.myId)?.answer?.choice
      if (a === undefined || t === undefined) continue
      const pickIdx = a === t ? a : dreamFlip(b.s.id, r) ? (b.players.find((p) => p.seat === 2)?.user_id === b.myId ? a : t) : b.players.find((p) => p.seat === 1)?.user_id === b.myId ? a : t
      out.push({ e: it.e, q: it.prompt, t: it.o[pickIdx]?.t ?? '', agree: a === t })
    }
    return out
  }, [b.answers, b.round, b.revealed, c.items, b.myId, b.s.id, b.players])

  const mineC = b.mine?.answer?.choice as number | undefined
  const theirC = b.theirs?.answer?.choice as number | undefined
  // القرعة: 0 = اختيار المقعد 1، 1 = اختيار المقعد 2 (نفس منطق النتائج)
  const seat1Mine = b.players.find((p) => p.seat === 1)?.user_id === b.myId
  const flipIdx = mineC !== undefined && theirC !== undefined ? (dreamFlip(b.s.id, b.round) ? (seat1Mine ? theirC : mineC) : seat1Mine ? mineC : theirC) : undefined

  return (
    <GameShell def={def} progress={`${c.emoji} ${c.label} · الخطوة ${b.round} من ${b.s.rounds_total}`} onEnd={() => void api.end()}>
      {b.round === 1 && !b.revealed && <p className="text-center text-mist text-sm mb-3">{c.intro}</p>}
      <div className="flex items-center justify-between mb-3 glass rounded-2xl px-4 py-2.5">
        <span className="text-sm text-mist">ميزانيتك الباقية</span>
        <span className="font-display text-lg tabular-nums">{remaining} 💰</span>
      </div>
      <PromptCard big={item.e}>{item.prompt}</PromptCard>
      {!b.revealed && !b.mine ? (
        <div className="grid gap-2.5">
          {item.o.map((o, i) => {
            const afford = o.c <= remaining - roundsAfter
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.97 }}
                disabled={!afford || api.busy || picked !== null}
                onClick={() => {
                  setPicked(i)
                  sfx('select')
                  void api.answer(b.round, { choice: i }).then((r) => !r && setPicked(null))
                }}
                className={`flex items-center justify-between rounded-2xl px-4 min-h-14 py-3 text-start transition-colors ${picked === i ? 'btn-primary on-color text-white' : 'glass hover:bg-white/10'} ${!afford ? 'opacity-40' : ''}`}
              >
                <span className="font-medium">{o.t}</span>
                <span className="text-sm shrink-0 ms-2" dir="ltr">
                  {coins(o.c)}
                </span>
              </motion.button>
            )
          })}
          {b.partnerAnswered && <p className="text-center text-sm text-emerald-300">✓ {b.pName} اختار</p>}
        </div>
      ) : !b.revealed ? (
        <WaitingCard text={`بانتظار ${b.pName}…`} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { n: 'أنت', c: mineC },
              { n: b.pName, c: theirC },
            ].map((x) => (
              <Card key={x.n} className={`text-center !p-4 ${x.c === flipIdx ? 'ring-2 ring-champagne/60' : ''}`}>
                <p className="text-xs text-mist">{x.n}</p>
                <p className="font-medium mt-1">{x.c !== undefined ? item.o[x.c]?.t : '—'}</p>
              </Card>
            ))}
          </div>
          <p className="text-center font-display text-lg mt-3">{mineC === theirC ? 'اتفقنا! 💞' : `القرعة اختارت: ${flipIdx !== undefined ? item.o[flipIdx]?.t : ''} 🎲`}</p>
          <NextBtn busy={api.busy} last={b.last} onNext={() => void api.next(b.round)} />
        </>
      )}
      {plan.length > 0 && (
        <div className="mt-5 glass rounded-2xl p-4">
          <p className="text-sm font-semibold mb-2">خطتنا لين الحين ✨</p>
          <ul className="space-y-1 text-sm">
            {plan.map((p, i) => (
              <li key={i}>
                {p.e} {p.q} <b>{p.t}</b> {p.agree ? '💞' : '🎲'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </GameShell>
  )
}

/* ================================ راهن على شريكك ================================ */
export function BetGame({ def }: { def: GameDef }) {
  const b = useRoundBits(def)
  const api = useGameApi()
  const item = (b.s.content?.items ?? [])[b.round - 1] as BetItem
  const chips = useMemo(
    () => betChips({ session: b.s, answers: b.answers.filter((a) => a.round < b.round || b.revealed), moves: [], players: [...b.players].sort((x, y) => x.seat - y.seat) }),
    [b.answers, b.round, b.revealed, b.s, b.players],
  )
  const myChips = chips[b.myId] ?? 100
  const [self, setSelf] = useState<number | null>(null)
  const [guess, setGuess] = useState<number | null>(null)
  const [bet, setBet] = useState(20)
  useEffect(() => {
    setSelf(null)
    setGuess(null)
    setBet(20)
  }, [b.round])
  const bets = [10, 20, 30, 50].filter((x) => x <= Math.max(10, myChips))
  const my = b.mine?.answer as { self: number; guess: number; bet: number } | undefined
  const th = b.theirs?.answer as { self: number; guess: number; bet: number } | undefined

  return (
    <GameShell def={def} progress={`الجولة ${b.round} من ${b.s.rounds_total}`} onEnd={() => void api.end()}>
      <ScoreBar scores={chips} unit="🪙" />
      <PromptCard>{item.prompt}</PromptCard>
      {!b.revealed && !b.mine ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-mist mb-2">١. جوابك أنت</p>
            <div className="grid grid-cols-2 gap-2">
              {item.options.map((o, i) => (
                <button key={i} data-bet-self onClick={() => setSelf(i)} className={`rounded-2xl px-3 py-3 text-sm min-h-12 ${self === i ? 'btn-primary on-color text-white' : 'glass hover:bg-white/10'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className={self === null ? 'opacity-40 pointer-events-none' : ''}>
            <p className="text-sm text-mist mb-2">٢. وش بيكون جواب {b.pName}؟ 🤔</p>
            <div className="grid grid-cols-2 gap-2">
              {item.options.map((o, i) => (
                <button key={i} data-bet-guess onClick={() => setGuess(i)} className={`rounded-2xl px-3 py-3 text-sm min-h-12 ${guess === i ? 'bg-frost-500/50 ring-1 ring-frost-400/70' : 'glass hover:bg-white/10'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className={guess === null ? 'opacity-40 pointer-events-none' : ''}>
            <p className="text-sm text-mist mb-2">٣. كم تراهن؟ (عندك {myChips} 🪙)</p>
            <div className="flex gap-2">
              {bets.map((x) => (
                <button key={x} onClick={() => setBet(x)} className={`flex-1 h-12 rounded-2xl font-display ${bet === x ? 'bg-champagne/30 ring-1 ring-champagne/60' : 'glass'}`}>
                  {x}
                </button>
              ))}
            </div>
          </div>
          <Button variant="primary" size="lg" block disabled={self === null || guess === null} loading={api.busy} onClick={() => void api.answer(b.round, { self, guess, bet: Math.min(bet, Math.max(10, myChips)) })}>
            راهنت! 🎰
          </Button>
          {b.partnerAnswered && <p className="text-center text-sm text-emerald-300">✓ {b.pName} راهن</p>}
        </div>
      ) : !b.revealed ? (
        <WaitingCard text={`بانتظار رهان ${b.pName}…`} sub={`راهنت بـ ${my?.bet ?? 0} 🪙`} />
      ) : (
        <>
          <div className="space-y-3">
            {[
              { who: 'أنت', me: my, other: th, oName: b.pName },
              { who: b.pName, me: th, other: my, oName: 'أنت' },
            ].map((x) => {
              const ok = x.me && x.other && x.me.guess === x.other.self
              return (
                <Card key={x.who} className="!p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{x.who}</p>
                    <span dir="ltr" className={`font-display text-lg ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {ok ? '+' : '−'}
                      {x.me?.bet ?? 0} 🪙
                    </span>
                  </div>
                  <p className="text-sm text-mist mt-1">
                    توقّع: <b className="text-cloud">{x.me ? item.options[x.me.guess] : '—'}</b> · الجواب الحقيقي: <b className="text-cloud">{x.other ? item.options[x.other.self] : '—'}</b>{' '}
                    {ok ? <Check className="inline size-4 text-emerald-300" /> : <X className="inline size-4 text-rose-300" />}
                  </p>
                </Card>
              )
            })}
          </div>
          <NextBtn busy={api.busy} last={b.last} onNext={() => void api.next(b.round)} />
        </>
      )}
    </GameShell>
  )
}

