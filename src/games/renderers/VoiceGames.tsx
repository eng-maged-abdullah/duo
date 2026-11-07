import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, Heart, Send } from 'lucide-react'
import type { GameDef } from '../types'
import type { Move } from '../../types/db'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { GameShell, PromptCard, WaitingCard } from '../engine/GameShell'
import { useGameApi, useMoveTimer, useSecrets } from '../engine/useGameApi'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { sfx, vibrate } from '../../lib/sound'
import { nameOf, otherOf } from '../engine/helpers'
import { normWord } from '../engine/boards'
import { BigTimer, Card, Flash, ScoreBar, Stars, StarsInput, TurnBanner, VoiceHint, countKind, useMoveFlash, useTurn } from './common'

function useScores(def: GameDef) {
  const { session, answers, moves, players } = useRoom()
  return useMemo(
    () => (session ? def.summarize({ session, answers, moves, players: [...players].sort((a, b) => a.seat - b.seat) }).scores ?? {} : {}),
    [def, session, answers, moves, players],
  )
}

/* ====================== الكلمة الممنوعة + مثّلها بالصوت ====================== */
export function CardsGame({ def }: { def: GameDef }) {
  const { session, moves, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const secrets = useSecrets()
  const s = session!
  const c = s.content as { variant: 'taboo' | 'act'; turns: number; seconds: number }
  const taboo = c.variant === 'taboo'
  const turn = Math.min(countKind(moves, 'end') + 1, c.turns)
  const deck = (secrets[`d${turn}`]?.v ?? []) as { w: string; f: string[] }[]
  const started = moves.find((m) => m.move.kind === 'start' && Number(m.move.turn) === turn)
  const results = moves.filter((m) => m.move.kind === 'card' && Number(m.move.turn) === turn)
  const card = deck[results.length]
  const scores = useScores(def)
  const last = turn >= c.turns
  const [over, setOver] = useState(false)
  const left = useMoveTimer(started?.created_at, c.seconds, () => setOver(true))
  useEffect(() => setOver(false), [turn])
  const timeUp = over || (left !== null && left <= 0)
  const flash = useMoveFlash(
    moves,
    useCallback((m: Move) => (m.move.kind === 'buzz' ? '🚨 قلت كلمة ممنوعة!' : m.move.kind === 'card' && m.move.res === 'got' ? '✅ صح!' : null), []),
    1100,
  )
  useEffect(() => {
    if (flash?.text.startsWith('🚨')) {
      sfx('wrong')
      vibrate(40)
    } else if (flash) sfx('match')
  }, [flash])

  const res = (r: 'got' | 'foul' | 'skip') => card && void api.move({ kind: 'card', turn, res: r, w: card.w }, ['stale'])
  const got = results.filter((r) => r.move.res === 'got').length

  return (
    <GameShell def={def} progress={`الدور ${turn} من ${c.turns}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <VoiceHint />
      <ScoreBar scores={scores} unit="نقطة" highlight={s.turn_player ?? undefined} />
      <TurnBanner myTurn={myTurn} name={turnName} mine={taboo ? 'دورك توصف 🗣️' : 'دورك تمثّل 🎭'} theirs={`${turnName} ${taboo ? 'يوصف' : 'يمثّل'}… وأنت تخمّن بصوتك 🎯`} />

      {!started ? (
        myTurn ? (
          <Card className="text-center">
            <p className="mb-4 leading-relaxed">
              عندك <b>{c.seconds} ثانية</b>. {taboo ? 'وصّف أكبر عدد كلمات بدون الكلمات الممنوعة!' : 'مثّل أكبر عدد شخصيات بصوتك!'}
            </p>
            <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'start', turn }, ['stale'])}>
              ابدأ ⏱️
            </Button>
          </Card>
        ) : (
          <WaitingCard text={`${turnName} يستعد…`} sub="ركّز وخمّن بصوت عالي!" />
        )
      ) : !timeUp ? (
        <>
          <BigTimer ms={left} total={c.seconds} />
          {myTurn ? (
            card ? (
              <>
                <motion.div key={card.w} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} className="ring-gradient glass rounded-[1.75rem] p-6 text-center mb-4">
                  <p className="font-display text-3xl">{card.w}</p>
                  {taboo && (
                    <div className="mt-4 border-t border-white/10 pt-3">
                      <p className="text-xs text-rose-300 mb-2">ممنوع تقول 🚫</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {card.f.map((f) => (
                          <span key={f} className="rounded-full bg-rose-500/15 text-rose-200 px-3 py-1 text-sm">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
                <div className={`grid gap-3 ${taboo ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <Button variant="primary" size="lg" className="!px-2" disabled={api.busy} onClick={() => res('got')}>
                    ✅ عرفها
                  </Button>
                  {taboo && (
                    <Button variant="danger" size="lg" className="!px-2" disabled={api.busy} onClick={() => res('foul')}>
                      🚫 غلطت
                    </Button>
                  )}
                  <Button variant="glass" size="lg" className="!px-2" disabled={api.busy} onClick={() => res('skip')}>
                    ⏭ تخطي
                  </Button>
                </div>
              </>
            ) : (
              <WaitingCard text="خلصت البطاقات! 🔥" sub="انتظر نهاية الوقت" />
            )
          ) : (
            <Card className="text-center">
              <p className="text-6xl mb-2">{taboo ? '🗣️' : '🎭'}</p>
              <p className="font-display text-xl">خمّن بصوتك!</p>
              <p className="text-mist text-sm mt-1">عرفتوا {got} لين الحين</p>
              {taboo && (
                <Button variant="danger" size="lg" block className="mt-4" onClick={() => void api.move({ kind: 'buzz', turn }, ['stale'])}>
                  🚨 قال كلمة ممنوعة!
                </Button>
              )}
            </Card>
          )}
        </>
      ) : (
        <>
          <Card className="text-center mb-3">
            <p className="text-sm text-mist">انتهى الوقت ⏰</p>
            <p className="font-display text-2xl mt-1">
              {nameOf(s.turn_player ?? '', players)} جاب {got} {taboo ? 'كلمة' : 'شخصية'}
            </p>
          </Card>
          <div className="flex flex-wrap gap-1.5 justify-center mb-4">
            {results.map((r) => (
              <span key={r.seq} className={`rounded-full px-3 py-1 text-sm ${r.move.res === 'got' ? 'bg-emerald-500/20 text-emerald-200' : r.move.res === 'foul' ? 'bg-rose-500/20 text-rose-200' : 'glass text-mist'}`}>
                {r.move.res === 'got' ? '✅' : r.move.res === 'foul' ? '🚫' : '⏭'} {String(r.move.w)}
              </span>
            ))}
          </div>
          <Button variant="primary" size="lg" block loading={api.busy} icon={<ChevronLeft className="size-5" />} onClick={() => void api.move({ kind: 'end', turn, pass_turn: true, finish: last }, ['stale'])}>
            {last ? 'عرض النتيجة' : 'الدور الجاي'}
          </Button>
        </>
      )}
    </GameShell>
  )
}

/* ================================ دندن وخمّن ================================ */
export function HumGame({ def }: { def: GameDef }) {
  const { session, moves, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const secrets = useSecrets()
  const s = session!
  const c = s.content as { turns: number; seconds: number; cats: string[] }
  const turn = Math.min(countKind(moves, 'next') + 1, c.turns)
  const slot = `h${turn}`
  const cat = c.cats[turn - 1]
  const set = moves.find((m) => m.move.kind === 'secret_set' && m.move.slot === slot)
  const solved = moves.find((m) => (m.move.kind === 'guess' && m.move.slot === slot && m.move.correct) || (m.move.kind === 'got' && Number(m.move.turn) === turn))
  const reveal = moves.find((m) => m.move.kind === 'reveal' && m.move.slot === slot)
  const done = Boolean(reveal || (solved && solved.move.kind === 'guess'))
  const song = String(reveal?.move.value ?? solved?.move.value ?? secrets[slot]?.v ?? '')
  const guesses = moves.filter((m) => m.move.kind === 'guess' && m.move.slot === slot)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const last = turn >= c.turns
  const scores = useScores(def)
  const left = useMoveTimer(set && !done ? set.created_at : null, c.seconds, () => void api.secret('reveal', slot, null, ['round_closed', 'session_closed']))

  const flash = useMoveFlash(moves, useCallback((m: Move) => ((m.move.kind === 'guess' && m.move.correct) || m.move.kind === 'got' ? 'عرفها! 🎵🎉' : null), []))
  useEffect(() => {
    if (flash) sfx('match')
  }, [flash])

  return (
    <GameShell def={def} progress={`الدور ${turn} من ${c.turns}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <VoiceHint />
      <ScoreBar scores={scores} />
      <TurnBanner myTurn={myTurn} name={turnName} mine="دورك تدندن 🎵" theirs={`${turnName} بيدندن… وأنت خمّن الأغنية`} />
      <PromptCard tag="نوع الأغنية">{cat}</PromptCard>

      {!set ? (
        myTurn ? (
          <div>
            <p className="text-sm text-mist text-center mb-2">اختر أغنية من هالنوع واكتب اسمها (سري — شريكك ما يشوفه)</p>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="اسم الأغنية…" className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 focus:outline-none focus:ring-2 focus:ring-iris-400/50" aria-label="اسم الأغنية" />
              <Button variant="primary" size="lg" disabled={!name.trim()} loading={api.busy} onClick={() => void api.secret('set', slot, name.trim())}>
                جاهز
              </Button>
            </div>
            <p className="text-xs text-mist text-center mt-2">⚠️ دندن اللحن بس — بدون ولا كلمة من الأغنية</p>
          </div>
        ) : (
          <WaitingCard text={`${turnName} يختار أغنية…`} />
        )
      ) : !done ? (
        <>
          <BigTimer ms={left} total={c.seconds} />
          {myTurn ? (
            <Card className="text-center">
              <p className="text-sm text-mist">أغنيتك</p>
              <p className="font-display text-2xl mb-1">{song || '…'}</p>
              <p className="text-5xl my-3">🎶</p>
              <p className="mb-4">دندنها الحين في المكالمة!</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="primary"
                  disabled={api.busy}
                  icon={<Check className="size-5" />}
                  onClick={async () => {
                    await api.move({ kind: 'got', turn }, ['stale'])
                    await api.secret('reveal', slot, null, ['round_closed'])
                  }}
                >
                  عرفها!
                </Button>
                <Button variant="glass" disabled={api.busy} onClick={() => void api.secret('reveal', slot, null, ['round_closed'])}>
                  ما عرفها 😅
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 60))}
                  onKeyDown={async (e) => {
                    if (e.key !== 'Enter' || !text.trim()) return
                    const v = text.trim()
                    setText('')
                    await api.secret('guess', slot, v, ['round_closed'])
                  }}
                  placeholder="اسم الأغنية؟"
                  className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 focus:outline-none focus:ring-2 focus:ring-iris-400/50"
                  aria-label="تخمينك"
                />
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!text.trim()}
                  loading={api.busy}
                  icon={<Send className="size-5 rtl:-scale-x-100" />}
                  aria-label="خمّن"
                  onClick={async () => {
                    const v = text.trim()
                    setText('')
                    await api.secret('guess', slot, v, ['round_closed'])
                  }}
                />
              </div>
              <p className="text-xs text-mist text-center mt-2">أو قولها بصوتك، وهو يضغط "عرفها"</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {guesses.map((g) => (
                  <span key={g.seq} className="rounded-full glass px-3 py-1 text-sm line-through decoration-rose-400/70">
                    {String(g.move.text)}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <Card className="text-center">
            <p className="text-sm text-mist">الأغنية كانت</p>
            <p className="font-display text-2xl text-gradient">{song}</p>
            <p className="mt-2">{solved ? `${nameOf(otherOf(set.player_id, players), players)} عرفها 🎯` : 'ما انعرفت هالمرة 😅'}</p>
          </Card>
          <Button variant="primary" size="lg" block className="mt-4" loading={api.busy} icon={<ChevronLeft className="size-5" />} onClick={() => void api.move({ kind: 'next', turn, pass_turn: true, finish: last }, ['stale'])}>
            {last ? 'عرض النتيجة' : 'الدور الجاي'}
          </Button>
        </>
      )}
    </GameShell>
  )
}

/* ================================ تحدي لا تضحك ================================ */
export function NoLaughGame({ def }: { def: GameDef }) {
  const { session, moves, myId, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName, partnerName } = useTurn()
  const s = session!
  const c = s.content as { turns: number; seconds: number; ideas: string[][] }
  const turn = Math.min(countKind(moves, 'laughed') + countKind(moves, 'held') + 1, c.turns)
  const started = moves.find((m) => m.move.kind === 'start' && Number(m.move.turn) === turn)
  const prev = [...moves].reverse().find((m) => m.move.kind === 'laughed' || m.move.kind === 'held')
  const scores = useScores(def)
  const last = turn >= c.turns
  const performer = s.turn_player ?? ''
  const watcher = otherOf(performer, players) ?? ''
  const sent = useRef(0)
  const left = useMoveTimer(started?.created_at, c.seconds, () => {
    if (sent.current === turn) return
    sent.current = turn
    void api.move({ kind: 'held', turn, watcher, pass_turn: true, finish: last }, ['stale', 'session_closed'])
  })
  const flash = useMoveFlash(moves, useCallback((m: Move) => (m.move.kind === 'laughed' ? 'ضحك! 😂😂' : m.move.kind === 'held' ? 'صمد! 😐' : null), []))
  useEffect(() => {
    if (flash) sfx(flash.text.startsWith('ضحك') ? 'win' : 'wrong')
  }, [flash])

  return (
    <GameShell def={def} progress={`الجولة ${turn} من ${c.turns}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <VoiceHint />
      <ScoreBar scores={scores} highlight={performer} />
      <TurnBanner myTurn={myTurn} name={turnName} mine="دورك تضحّكه 😜" theirs={`${turnName} بيحاول يضحّكك… قاوم! 😐`} />
      {!started ? (
        <>
          {prev && (
            <p className="text-center text-sm text-mist mb-3">
              الجولة اللي فاتت: {prev.move.kind === 'laughed' ? `${nameOf(prev.player_id, players)} ضحك 😂` : `${nameOf(String(prev.move.watcher), players)} صمد 😐`}
            </p>
          )}
          {myTurn ? (
            <Card>
              <p className="font-medium mb-2">أفكار تساعدك 💡</p>
              <ul className="space-y-1.5 text-[15px] mb-4">
                {(c.ideas[turn - 1] ?? []).map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
              <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'start', turn }, ['stale'])}>
                ابدأ {c.seconds} ثانية ⏱️
              </Button>
            </Card>
          ) : (
            <WaitingCard text={`${turnName} يجهز خطته… 😏`} sub="استعد تقاوم!" />
          )}
        </>
      ) : (
        <>
          <BigTimer ms={left} total={c.seconds} />
          {myId === watcher ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              disabled={api.busy}
              onClick={() => {
                sent.current = turn
                void api.move({ kind: 'laughed', turn, pass_turn: true, finish: last }, ['stale'])
              }}
              className="w-full min-h-56 rounded-[2rem] bg-gradient-to-br from-iris-400 to-frost-500 text-white on-color shadow-2xl font-display text-4xl"
            >
              ضحكت 😂
              <span className="block text-sm font-sans opacity-90 mt-2">كن أمين! 😄</span>
            </motion.button>
          ) : (
            <Card className="text-center">
              <p className="text-6xl mb-2">😜</p>
              <p className="font-display text-xl">ضحّك {partnerName}!</p>
              <ul className="mt-3 space-y-1 text-sm text-mist">
                {(c.ideas[turn - 1] ?? []).map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </GameShell>
  )
}

/* ================================ الحرف الممنوع ================================ */
export function ForbiddenGame({ def }: { def: GameDef }) {
  const { session, moves, players } = useRoom()
  const api = useGameApi()
  const { partnerName } = useTurn()
  const s = session!
  const c = s.content as { rounds: { rule: string; hint: string; topic: string }[]; seconds: number }
  const round = Math.min(countKind(moves, 'end') + 1, c.rounds.length)
  const rule = c.rounds[round - 1]
  const started = moves.find((m) => m.move.kind === 'start' && Number(m.move.round) === round)
  const [over, setOver] = useState(false)
  useEffect(() => setOver(false), [round])
  const left = useMoveTimer(started?.created_at, c.seconds, () => setOver(true))
  const timeUp = over || (left !== null && left <= 0)
  const scores = useScores(def)
  const last = round >= c.rounds.length
  const lastCatch = useRef(0)
  const flash = useMoveFlash(moves, useCallback((m: Move) => (m.move.kind === 'catch' ? `🫵 ${nameOf(m.player_id, players)} مسكك!` : null), [players]), 1500)
  useEffect(() => {
    if (flash) {
      sfx('wrong')
      vibrate(30)
    }
  }, [flash])
  const caught = moves.filter((m) => m.move.kind === 'catch' && Number(m.move.round) === round)

  return (
    <GameShell def={def} progress={`الجولة ${round} من ${c.rounds.length}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <VoiceHint />
      <ScoreBar scores={scores} unit="مسكة" />
      <motion.div key={round} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[1.75rem] bg-rose-500/15 border border-rose-400/30 p-6 text-center mb-4">
        <p className="font-display text-2xl">{rule.rule}</p>
        <p className="text-sm text-mist mt-1">{rule.hint}</p>
        <div className="mt-4 rounded-2xl glass px-4 py-3">
          <p className="text-xs text-mist">موضوع السوالف</p>
          <p className="font-medium mt-0.5">{rule.topic}</p>
        </div>
      </motion.div>
      {!started ? (
        <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'start', round }, ['stale'])}>
          ابدأوا السوالف ⏱️
        </Button>
      ) : !timeUp ? (
        <>
          <BigTimer ms={left} total={c.seconds} />
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              if (Date.now() - lastCatch.current < 2500) return
              lastCatch.current = Date.now()
              void api.move({ kind: 'catch', round }, ['stale'])
            }}
            className="w-full min-h-40 rounded-[2rem] btn-primary on-color text-white font-display text-3xl"
          >
            مسكتك! 🫵
            <span className="block text-sm font-sans opacity-80 mt-1">اضغط لما يغلط {partnerName}</span>
          </motion.button>
        </>
      ) : (
        <>
          <Card className="text-center mb-4">
            <p className="text-mist text-sm">انتهت الجولة</p>
            <p className="font-display text-xl mt-1">{caught.length ? `${caught.length} مسكة هالجولة 😂` : 'ولا غلطة! أبطال 👏'}</p>
          </Card>
          <Button variant="primary" size="lg" block loading={api.busy} icon={<ChevronLeft className="size-5" />} onClick={() => void api.move({ kind: 'end', round, finish: last }, ['stale'])}>
            {last ? 'عرض النتيجة' : 'الجولة الجاية'}
          </Button>
        </>
      )}
    </GameShell>
  )
}

/* ================================ قولها بسرعة ================================ */
export function TongueGame({ def }: { def: GameDef }) {
  const { session, moves, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const s = session!
  const c = s.content as { turns: number; phrases: string[] }
  const turn = Math.min(countKind(moves, 'rate') + 1, c.turns)
  const phrase = c.phrases[turn - 1]
  const prev = [...moves].reverse().find((m) => m.move.kind === 'rate')
  const scores = useScores(def)
  const last = turn >= c.turns
  return (
    <GameShell def={def} progress={`الجملة ${turn} من ${c.turns}`} onEnd={() => void api.end()}>
      <VoiceHint />
      <ScoreBar scores={scores} unit="⭐" highlight={s.turn_player ?? undefined} />
      <TurnBanner myTurn={myTurn} name={turnName} mine="دورك! قلها ٣ مرات بسرعة 👅" theirs={`${turnName} بيقولها… قيّمه!`} />
      <PromptCard tag="٣ مرات ورا بعض">{phrase}</PromptCard>
      {prev && (
        <p className="text-center text-sm text-mist mb-3">
          {nameOf(otherOf(prev.player_id, players), players)} أخذ <Stars n={Number(prev.move.stars)} />
        </p>
      )}
      {myTurn ? (
        <WaitingCard text="قلها بصوت عالي في المكالمة 🎙️" sub="شريكك بيقيّمك" />
      ) : (
        <Card className="text-center">
          <p className="mb-2 font-medium">كم يستاهل؟</p>
          <StarsInput disabled={api.busy} onRate={(n) => void api.move({ kind: 'rate', turn, stars: n, pass_turn: true, finish: last }, ['stale'])} />
        </Card>
      )}
    </GameShell>
  )
}

/* ================================ ٢٠ سؤال ================================ */
export function TwentyGame({ def }: { def: GameDef }) {
  const { session, moves } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const secrets = useSecrets()
  const s = session!
  const c = s.content as { turns: number; cats: { c: string; hint: string }[] }
  const turn = Math.min(countKind(moves, 'next') + 1, c.turns)
  const slot = `t${turn}`
  const cat = c.cats[turn - 1]
  const set = moves.find((m) => m.move.kind === 'secret_set' && m.move.slot === slot)
  const answers = moves.filter((m) => m.move.kind === 'ans' && Number(m.move.turn) === turn)
  const solved = moves.find((m) => (m.move.kind === 'guess' && m.move.slot === slot && m.move.correct) || (m.move.kind === 'got' && Number(m.move.turn) === turn))
  const reveal = moves.find((m) => m.move.kind === 'reveal' && m.move.slot === slot)
  const done = Boolean(reveal || (solved?.move.kind === 'guess'))
  const thing = String(reveal?.move.value ?? solved?.move.value ?? secrets[slot]?.v ?? '')
  const guesses = moves.filter((m) => m.move.kind === 'guess' && m.move.slot === slot)
  const [val, setVal] = useState('')
  const [g, setG] = useState('')
  const scores = useScores(def)
  const last = turn >= c.turns
  const leftQ = 20 - answers.length
  useEffect(() => {
    if (set && !done && leftQ <= 0) void api.secret('reveal', slot, null, ['round_closed', 'session_closed'])
  }, [leftQ, done, set, slot]) // eslint-disable-line react-hooks/exhaustive-deps
  const flash = useMoveFlash(moves, useCallback((m: Move) => ((m.move.kind === 'guess' && m.move.correct) || m.move.kind === 'got' ? 'عرفها! 🎯' : null), []))
  useEffect(() => {
    if (flash) sfx('win')
  }, [flash])
  const icon = (v: string) => (v === 'yes' ? '✅ إيه' : v === 'no' ? '❌ لا' : '🤷 يمكن')
  const short = (v: string) => (v === 'yes' ? 'إيه ✅' : v === 'no' ? 'لا ❌' : 'يمكن')

  return (
    <GameShell def={def} progress={`الدور ${turn} من ${c.turns}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <VoiceHint />
      <ScoreBar scores={scores} />
      <TurnBanner myTurn={myTurn} name={turnName} mine="في بالك شي… وهو يسأل 🤫" theirs={`في بال ${turnName} شي… اسأله "إيه أو لا" بصوتك`} />
      <PromptCard tag="الفئة">
        {cat.c} <span className="block text-sm text-mist font-sans mt-1">{cat.hint}</span>
      </PromptCard>
      {!set ? (
        myTurn ? (
          <div className="flex gap-2">
            <input value={val} onChange={(e) => setVal(e.target.value.slice(0, 50))} placeholder="وش الشي اللي في بالك؟ (سري)" className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 focus:outline-none focus:ring-2 focus:ring-iris-400/50" aria-label="الشي السري" />
            <Button variant="primary" size="lg" disabled={!val.trim()} loading={api.busy} onClick={() => void api.secret('set', slot, val.trim())}>
              خبّه
            </Button>
          </div>
        ) : (
          <WaitingCard text={`${turnName} يفكر بشي…`} />
        )
      ) : !done ? (
        <>
          <div className="text-center mb-3">
            <span className={`font-display text-4xl tabular-nums ${leftQ <= 5 ? 'text-rose-300' : ''}`}>{leftQ}</span>
            <span className="text-mist text-sm ms-2">سؤال باقي</span>
          </div>
          {myTurn ? (
            <Card>
              <p className="text-center text-sm text-mist">اللي في بالك: <b className="text-cloud">{thing || '…'}</b></p>
              <p className="text-center text-sm my-3">جاوب على سؤاله:</p>
              <div className="grid grid-cols-3 gap-2">
                {(['yes', 'no', 'maybe'] as const).map((v) => (
                  <Button key={v} variant={v === 'yes' ? 'soft' : v === 'no' ? 'danger' : 'glass'} size="lg" className="!px-2" disabled={api.busy} onClick={() => void api.move({ kind: 'ans', turn, v }, ['stale'])}>
                    {short(v)}
                  </Button>
                ))}
              </div>
              <Button
                variant="primary"
                block
                className="mt-3"
                disabled={api.busy}
                onClick={async () => {
                  await api.move({ kind: 'got', turn }, ['stale'])
                  await api.secret('reveal', slot, null, ['round_closed'])
                }}
              >
                عرفها! 🎯
              </Button>
            </Card>
          ) : (
            <div className="flex gap-2">
              <input
                value={g}
                onChange={(e) => setG(e.target.value.slice(0, 50))}
                placeholder="عرفتها؟ اكتبها…"
                className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 focus:outline-none focus:ring-2 focus:ring-iris-400/50"
                aria-label="تخمينك"
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !g.trim()) return
                  const v = g.trim()
                  setG('')
                  await api.secret('guess', slot, v, ['round_closed'])
                }}
              />
              <Button
                variant="primary"
                size="lg"
                disabled={!g.trim()}
                icon={<Send className="size-5 rtl:-scale-x-100" />}
                aria-label="خمّن"
                onClick={async () => {
                  const v = g.trim()
                  setG('')
                  await api.secret('guess', slot, v, ['round_closed'])
                }}
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
            {answers.map((a, i) => (
              <span key={a.seq} className="rounded-full glass px-2.5 py-1 text-xs">
                {i + 1}. {icon(String(a.move.v))}
              </span>
            ))}
            {guesses.map((x) => (
              <span key={x.seq} className="rounded-full glass px-2.5 py-1 text-xs line-through decoration-rose-400/70">
                {String(x.move.text)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <>
          <Card className="text-center">
            <p className="text-sm text-mist">كان في باله</p>
            <p className="font-display text-3xl text-gradient">{thing}</p>
            <p className="mt-2">{solved ? `عرفها بعد ${answers.length} سؤال 🎯` : 'ما انعرفت! 😏'}</p>
          </Card>
          <Button variant="primary" size="lg" block className="mt-4" loading={api.busy} icon={<ChevronLeft className="size-5" />} onClick={() => void api.move({ kind: 'next', turn, pass_turn: true, finish: last }, ['stale'])}>
            {last ? 'عرض النتيجة' : 'الدور الجاي'}
          </Button>
        </>
      )}
    </GameShell>
  )
}

/* ================================ معركة المدح ================================ */
export function ComplimentsGame({ def }: { def: GameDef }) {
  const { session, moves, myId, players } = useRoom()
  const api = useGameApi()
  const toast = useToast()
  const { myTurn, turnName, partnerName } = useTurn()
  const s = session!
  const c = s.content as { total: number; seconds: number; topics: string[] }
  const said = moves.filter((m) => m.move.kind === 'c')
  const n = said.length + countKind(moves, 'timeout')
  const started = moves.find((m) => m.move.kind === 'start')
  const lastTurnMove = [...moves].reverse().find((m) => ['c', 'timeout', 'start'].includes(m.move.kind))
  const topic = c.topics[n] ?? c.topics[0]
  const reacted = new Set(moves.filter((m) => m.move.kind === 'react').map((m) => Number(m.move.seq)))
  const [text, setText] = useState('')
  const scores = useScores(def)
  const finishing = n + 1 >= c.total * 2
  const endRef = useRef<HTMLDivElement>(null)
  const sentFor = useRef(-1)
  const left = useMoveTimer(started ? lastTurnMove?.created_at : null, c.seconds, () => {
    if (sentFor.current === n) return
    sentFor.current = n
    void api.move({ kind: 'timeout', idx: n, loser: s.turn_player, pass_turn: true, finish: finishing }, ['stale', 'session_closed'])
  })
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [moves.length])
  const flash = useMoveFlash(moves, useCallback((m: Move) => (m.move.kind === 'react' ? '❤️' : m.move.kind === 'timeout' ? '⏰ سكت!' : null), []), 900)

  const send = async () => {
    const v = text.trim()
    if (!v) return
    const nv = normWord(v)
    const dup = said.some((m) => {
      const o = normWord(String(m.move.text))
      return o === nv || (o.length > 6 && (o.includes(nv) || nv.includes(o)))
    })
    if (dup) {
      toast('هذي انقالت قبل! جيب مدحة جديدة 😏', 'error')
      return
    }
    sentFor.current = n
    const r = await api.move({ kind: 'c', text: v.slice(0, 200), idx: n, pass_turn: true, finish: finishing }, ['stale'])
    if (r) {
      setText('')
      sfx('select')
    } else sentFor.current = -1
  }

  return (
    <GameShell def={def} progress={`${Math.min(n + 1, c.total * 2)} من ${c.total * 2}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <ScoreBar scores={scores} unit="💘" highlight={s.turn_player ?? undefined} />
      {!started ? (
        <Card className="text-center">
          <p className="text-5xl mb-3">💘</p>
          <p className="mb-4">كل واحد عنده {c.seconds} ثانية يكتب مدحة… واللي يسكت يخسر الدور!</p>
          <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'start' }, ['stale'])}>
            يلا نبدأ 💘
          </Button>
        </Card>
      ) : (
        <>
          <TurnBanner myTurn={myTurn} name={turnName} mine={`دورك تمدح ${partnerName} 💘`} theirs={`${turnName} يكتب لك مدحة… 🙈`} />
          <BigTimer ms={left} total={c.seconds} />
          <div className="glass rounded-3xl p-3 mb-3 max-h-[42dvh] overflow-y-auto space-y-2">
            {said.length === 0 && <p className="text-center text-mist text-sm py-6">أول مدحة… يلا 😍</p>}
            {said.map((m) => {
              const mine = m.player_id === myId
              return (
                <motion.div key={m.seq} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-iris-500/25' : 'bg-frost-500/20'}`}>
                    <p className="text-[11px] text-mist">{mine ? 'أنت' : nameOf(m.player_id, players)}</p>
                    <p className="leading-relaxed">{String(m.move.text)}</p>
                    {!mine &&
                      (reacted.has(m.seq) ? (
                        <span className="text-sm">❤️</span>
                      ) : (
                        <button className="mt-1 inline-flex items-center gap-1 text-xs text-rose-300" onClick={() => void api.move({ kind: 'react', seq: m.seq, to: m.player_id }, ['stale'])}>
                          <Heart className="size-3.5" /> ذوّبتني
                        </button>
                      ))}
                    {mine && reacted.has(m.seq) && <span className="text-sm">❤️</span>}
                  </div>
                </motion.div>
              )
            })}
            <div ref={endRef} />
          </div>
          {myTurn ? (
            <>
              <p className="text-xs text-mist mb-1.5">💡 فكرة: امدح {topic}</p>
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 200))}
                  onKeyDown={(e) => e.key === 'Enter' && void send()}
                  placeholder="اكتب مدحتك…"
                  className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 focus:outline-none focus:ring-2 focus:ring-iris-400/50"
                  aria-label="مدحتك"
                  autoFocus
                />
                <Button variant="primary" size="lg" disabled={!text.trim()} loading={api.busy} onClick={() => void send()} icon={<Send className="size-5 rtl:-scale-x-100" />} aria-label="أرسل" />
              </div>
            </>
          ) : (
            <WaitingCard text={`${turnName} يكتب…`} sub="اضغط ❤️ على المدحة اللي ذوّبتك" />
          )}
        </>
      )}
    </GameShell>
  )
}

/* ================================ كذبة وحدة ================================ */
export function TwoTruthsGame({ def }: { def: GameDef }) {
  const { session, moves, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName } = useTurn()
  const s = session!
  const c = s.content as { turns: number; themes: string[] }
  const turn = Math.min(countKind(moves, 'next') + 1, c.turns)
  const slot = `lie${turn}`
  const st = moves.find((m) => m.move.kind === 'statements' && Number(m.move.turn) === turn)
  const guess = moves.find((m) => m.move.kind === 'guess' && m.move.slot === slot)
  const reveal = moves.find((m) => m.move.kind === 'reveal' && m.move.slot === slot)
  const lieIdx = guess?.move.correct ? Number(guess.move.value) : reveal ? Number(reveal.move.value) : null
  const [items, setItems] = useState(['', '', ''])
  const [lie, setLie] = useState<number | null>(null)
  const scores = useScores(def)
  const last = turn >= c.turns
  useEffect(() => {
    setItems(['', '', ''])
    setLie(null)
  }, [turn])
  // إذا التخمين غلط: نكشف الكذبة للاثنين
  useEffect(() => {
    if (guess && !guess.move.correct && !reveal) void api.secret('reveal', slot, null, ['round_closed', 'session_closed'])
  }, [guess, reveal, slot]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (lie === null || items.some((x) => !x.trim())) return
    const r = await api.secret('set', slot, lie)
    if (r) await api.move({ kind: 'statements', turn, items: items.map((x) => x.trim().slice(0, 140)) }, ['stale'])
  }

  return (
    <GameShell def={def} progress={`الدور ${turn} من ${c.turns}`} onEnd={() => void api.end()}>
      <ScoreBar scores={scores} />
      <TurnBanner myTurn={myTurn} name={turnName} mine="دورك تكذب 😏" theirs={`${turnName} يكتب ٣ معلومات… وحدة كذب!`} />
      {!st ? (
        myTurn ? (
          <div>
            <p className="text-center text-sm text-mist mb-3">
              موضوع يساعدك: <b className="text-cloud">{c.themes[turn - 1]}</b>
            </p>
            <div className="space-y-2.5">
              {items.map((v, i) => (
                <div key={i} className={`flex items-center gap-2 rounded-2xl p-1.5 ${lie === i ? 'bg-rose-500/15 ring-1 ring-rose-400/40' : 'glass'}`}>
                  <input
                    value={v}
                    onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? e.target.value.slice(0, 140) : y)))}
                    placeholder={`المعلومة ${i + 1}`}
                    className="flex-1 min-w-0 h-12 bg-transparent px-3 focus:outline-none"
                    aria-label={`المعلومة ${i + 1}`}
                  />
                  <button onClick={() => setLie(i)} className={`shrink-0 h-10 px-3 rounded-xl text-sm ${lie === i ? 'bg-rose-500/40 text-white' : 'bg-white/10 text-mist'}`} aria-pressed={lie === i}>
                    {lie === i ? 'الكذبة 🤥' : 'كذبة؟'}
                  </button>
                </div>
              ))}
            </div>
            <Button variant="primary" size="lg" block className="mt-4" disabled={lie === null || items.some((x) => !x.trim())} loading={api.busy} onClick={() => void submit()}>
              أرسلها
            </Button>
            <p className="text-xs text-mist text-center mt-2">الكذبة تنحفظ سرًا في الخادم — شريكك ما يقدر يشوفها</p>
          </div>
        ) : (
          <WaitingCard text={`${turnName} يألّف كذبته… 😏`} />
        )
      ) : (
        <div className="space-y-2.5">
          {(st.move.items as string[]).map((t, i) => {
            const isLie = lieIdx === i
            const picked = guess && Number(guess.move.text) === i
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.98 }}
                disabled={myTurn || Boolean(guess) || api.busy}
                onClick={() => {
                  sfx('select')
                  void api.secret('guess', slot, String(i), ['round_closed'])
                }}
                className={`w-full text-start rounded-2xl px-4 py-4 transition-colors ${
                  lieIdx !== null ? (isLie ? 'bg-rose-500/20 border border-rose-400/40' : 'bg-emerald-500/10 border border-emerald-400/20') : 'glass hover:bg-white/10'
                } ${picked ? 'ring-2 ring-iris-400' : ''}`}
              >
                <span className="text-mist text-sm me-2">{i + 1}.</span>
                {t}
                {lieIdx !== null && <span className="float-end">{isLie ? '🤥 كذب' : '✅ صح'}</span>}
              </motion.button>
            )
          })}
          {!guess && !myTurn && <p className="text-center text-sm text-mist">اضغط على الكذبة 🕵️</p>}
          {!guess && myTurn && <WaitingCard text="شريكك يدوّر الكذبة…" />}
          {guess && lieIdx !== null && (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="text-center mt-2">
                  <p className="font-display text-xl">{guess.move.correct ? `${nameOf(guess.player_id, players)} كشفها! 🕵️` : `${nameOf(st.player_id, players)} ضحك عليه 😏`}</p>
                  <p className="text-sm text-mist mt-1">احكوا القصة ورا كل معلومة 😄</p>
                </Card>
                <Button variant="primary" size="lg" block className="mt-3" loading={api.busy} icon={<ChevronLeft className="size-5" />} onClick={() => void api.move({ kind: 'next', turn, pass_turn: true, finish: last }, ['stale'])}>
                  {last ? 'عرض النتيجة' : 'الدور الجاي'}
                </Button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </GameShell>
  )
}
