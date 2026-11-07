import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Eye, Send } from 'lucide-react'
import type { GameDef } from '../types'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { GameShell, WaitingCard } from '../engine/GameShell'
import { useGameApi, useMoveTimer, useSecrets } from '../engine/useGameApi'
import { Button } from '../../components/ui/Button'
import { sfx, vibrate } from '../../lib/sound'
import { DrawCanvas } from './DrawCanvas'
import { BigTimer, Card, Flash, ScoreBar, StarsInput, Stars, TurnBanner, VoiceHint, countKind, useMoveFlash, useTurn } from './common'
import { shapeColors, shapeNames, type ShapeKind } from '../content/v2/draw'
import type { ShapeItem } from '../engine/generators'
import type { Move } from '../../types/db'
import { nameOf } from '../engine/helpers'

const diffLabel = ['سهلة 🙂', 'متوسطة 😎', 'صعبة 🔥']

function useScores(def: GameDef) {
  const { session, answers, moves, players } = useRoom()
  return useMemo(
    () => (session ? def.summarize({ session, answers, moves, players: [...players].sort((a, b) => a.seat - b.seat) }).scores ?? {} : {}),
    [def, session, answers, moves, players],
  )
}

/* ================================ ارسم وخمّن ================================ */
export function DrawGuessGame({ def }: { def: GameDef }) {
  const { session, moves, myId, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName, partnerName } = useTurn()
  const secrets = useSecrets()
  const s = session!
  const c = s.content as { turns: number; seconds: number }
  const turn = Math.min(countKind(moves, 'next') + 1, c.turns)
  const slot = `w${turn}`
  const chosen = moves.find((m) => m.move.kind === 'chosen' && m.move.slot === slot)
  const solved = moves.find((m) => m.move.kind === 'guess' && m.move.slot === slot && m.move.correct)
  const revealMove = moves.find((m) => m.move.kind === 'reveal' && m.move.slot === slot)
  const done = Boolean(solved || revealMove)
  const word = ((solved?.move.value ?? revealMove?.move.value ?? secrets[slot]?.v) as { w?: string } | { w: string }[] | undefined) ?? undefined
  const options = Array.isArray(word) ? word : null
  const wordText = !Array.isArray(word) ? word?.w : undefined
  const guesses = moves.filter((m) => m.move.kind === 'guess' && m.move.slot === slot)
  const scores = useScores(def)
  const [text, setText] = useState('')
  const last = turn >= c.turns

  const left = useMoveTimer(chosen && !done ? chosen.created_at : null, c.seconds, () => void api.secret('reveal', slot, null, ['round_closed', 'session_closed']))

  const flash = useMoveFlash(
    moves,
    useCallback((m: Move) => (m.move.kind === 'guess' && m.move.correct ? `عرفها! 🎉 «${(m.move.value as { w: string })?.w}»` : m.move.kind === 'reveal' && String(m.move.slot).startsWith('w') ? `انتهى الوقت ⏰` : null), []),
  )
  useEffect(() => {
    if (flash) sfx(flash.text.startsWith('عرفها') ? 'match' : 'wrong')
  }, [flash])

  const guess = async () => {
    const v = text.trim()
    if (!v) return
    setText('')
    const r = await api.secret('guess', slot, v, ['round_closed'])
    if (r && !r.correct) {
      sfx('wrong')
      vibrate(20)
    }
  }

  return (
    <GameShell def={def} progress={`الدور ${turn} من ${c.turns}`} onEnd={() => void api.end()}>
      <Flash flash={flash} />
      <ScoreBar scores={scores} unit="نقطة" highlight={s.turn_player ?? undefined} />
      <TurnBanner myTurn={myTurn} name={turnName} mine="دورك ترسم 🎨" theirs={`${turnName} يرسم… وأنت تخمّن 🤔`} />

      {!chosen ? (
        myTurn ? (
          options ? (
            <div>
              <p className="text-center text-mist mb-3">اختر الكلمة اللي بترسمها (شريكك ما يشوفها)</p>
              <div className="grid gap-3">
                {options.map((o, i) => (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.97 }}
                    disabled={api.busy}
                    onClick={() => {
                      sfx('select')
                      void api.secret('choose', slot, i)
                    }}
                    className="glass rounded-2xl px-5 h-16 flex items-center justify-between text-start hover:bg-white/10"
                  >
                    <span className="font-display text-xl">{o.w}</span>
                    <span className="text-xs text-mist">
                      {diffLabel[i]} · {i + 1}+ نقطة
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <WaitingCard text="نجهز كلماتك…" />
          )
        ) : (
          <WaitingCard text={`${turnName} يختار كلمة…`} sub="جهّز نفسك تخمّن!" />
        )
      ) : (
        <>
          {!done && <BigTimer ms={left} total={c.seconds} />}
          {myTurn && !done && wordText && (
            <div className="mb-3 rounded-2xl btn-primary on-color text-white text-center py-2.5">
              ارسم: <b className="font-display text-xl">{wordText}</b>
            </div>
          )}
          {!myTurn && !done && (
            <div className="mb-3 text-center">
              <div className="font-display text-2xl tracking-[0.4em]" dir="rtl" aria-label={`${chosen.move.len} حروف`}>
                {Array.from({ length: Number(chosen.move.len ?? 0) }, () => '＿').join('')}
              </div>
              <p className="text-xs text-mist mt-1">
                {chosen.move.len} حروف{Number(chosen.move.words) > 1 ? ` · ${chosen.move.words} كلمات` : ''} · {diffLabel[Number(chosen.move.d ?? 0)]}
              </p>
            </div>
          )}
          {done && (
            <Card className="mb-3 text-center">
              <p className="text-sm text-mist">الكلمة كانت</p>
              <p className="font-display text-3xl text-gradient">{wordText ?? '…'}</p>
              <p className="mt-1 text-sm">{solved ? `${nameOf(solved.player_id, players)} عرفها ✅` : 'ما أحد عرفها 😅'}</p>
            </Card>
          )}
          <DrawCanvas sessionId={s.id} round={turn} canDraw={myTurn && !done} />

          {!myTurn && !done && (
            <div className="mt-3 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 40))}
                onKeyDown={(e) => e.key === 'Enter' && void guess()}
                placeholder="اكتب تخمينك…"
                className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 text-lg focus:outline-none focus:ring-2 focus:ring-iris-400/50"
                aria-label="تخمينك"
                autoComplete="off"
              />
              <Button variant="primary" size="lg" disabled={!text.trim()} loading={api.busy} onClick={() => void guess()} icon={<Send className="size-5 rtl:-scale-x-100" />} aria-label="خمّن" />
            </div>
          )}
          {guesses.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-live="polite">
              {guesses.slice(-14).map((g) => (
                <span key={g.seq} className={`rounded-full px-3 py-1 text-sm ${g.move.correct ? 'bg-emerald-500/25 text-emerald-200' : 'glass line-through decoration-rose-400/70'}`}>
                  {String(g.move.text)}
                </span>
              ))}
            </div>
          )}
          {!done && myTurn && (
            <Button variant="ghost" size="sm" className="mt-3" icon={<Eye className="size-4" />} onClick={() => void api.secret('reveal', slot, null, ['round_closed'])}>
              استسلام واكشف الكلمة
            </Button>
          )}
          {done && (
            <Button
              variant="primary"
              size="lg"
              block
              className="mt-4"
              loading={api.busy}
              icon={<ChevronLeft className="size-5" />}
              onClick={() => void api.move({ kind: 'next', turn, pass_turn: true, finish: last }, ['stale'])}
            >
              {last ? 'عرض النتيجة' : `الدور الجاي: ${myId === s.turn_player ? partnerName : 'أنت'} ترسم`}
            </Button>
          )}
        </>
      )}
    </GameShell>
  )
}

/* ================================ صورة الأشكال ================================ */
function shapePath(k: ShapeKind, cx: number, cy: number, r: number, fill: string) {
  const s = { fill, stroke: '#1d1228', strokeWidth: 3, strokeLinejoin: 'round' as const }
  switch (k) {
    case 'circle':
      return <circle cx={cx} cy={cy} r={r} {...s} />
    case 'square':
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={4} {...s} />
    case 'triangle':
      return <polygon points={`${cx},${cy - r} ${cx + r},${cy + r * 0.85} ${cx - r},${cy + r * 0.85}`} {...s} />
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 ? r * 0.45 : r
        return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`
      }).join(' ')
      return <polygon points={pts} {...s} />
    }
    case 'heart':
      return <path d={`M${cx} ${cy + r * 0.9} C ${cx - r * 1.6} ${cy - r * 0.2}, ${cx - r * 0.6} ${cy - r * 1.3}, ${cx} ${cy - r * 0.35} C ${cx + r * 0.6} ${cy - r * 1.3}, ${cx + r * 1.6} ${cy - r * 0.2}, ${cx} ${cy + r * 0.9} Z`} {...s} />
    case 'moon':
      return <path d={`M${cx + r * 0.3} ${cy - r} A ${r} ${r} 0 1 0 ${cx + r * 0.3} ${cy + r} A ${r * 0.75} ${r * 0.75} 0 1 1 ${cx + r * 0.3} ${cy - r} Z`} {...s} />
    case 'cloud':
      return <path d={`M${cx - r} ${cy + r * 0.45} a ${r * 0.45} ${r * 0.45} 0 0 1 ${r * 0.1} -${r * 0.85} a ${r * 0.6} ${r * 0.6} 0 0 1 ${r * 1.05} -${r * 0.25} a ${r * 0.5} ${r * 0.5} 0 0 1 ${r * 0.8} ${r * 0.55} a ${r * 0.35} ${r * 0.35} 0 0 1 ${r * 0.05} ${r * 0.55} Z`} {...s} />
    case 'house':
      return (
        <g>
          <rect x={cx - r * 0.75} y={cy - r * 0.1} width={r * 1.5} height={r * 1.05} {...s} />
          <polygon points={`${cx - r},${cy - r * 0.05} ${cx},${cy - r} ${cx + r},${cy - r * 0.05}`} {...s} />
          <rect x={cx - r * 0.2} y={cy + r * 0.4} width={r * 0.4} height={r * 0.55} fill="#fdfbff" stroke="#1d1228" strokeWidth={3} />
        </g>
      )
    case 'tree':
      return (
        <g>
          <rect x={cx - r * 0.15} y={cy + r * 0.2} width={r * 0.3} height={r * 0.8} fill="#8b5a2b" stroke="#1d1228" strokeWidth={3} />
          <circle cx={cx} cy={cy - r * 0.2} r={r * 0.65} {...s} />
        </g>
      )
    case 'flower':
      return (
        <g>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i * 2 * Math.PI) / 5
            return <circle key={i} cx={cx + r * 0.5 * Math.cos(a)} cy={cy + r * 0.5 * Math.sin(a)} r={r * 0.42} {...s} />
          })}
          <circle cx={cx} cy={cy} r={r * 0.3} fill="#facc15" stroke="#1d1228" strokeWidth={3} />
        </g>
      )
    case 'smile':
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} {...s} />
          <circle cx={cx - r * 0.35} cy={cy - r * 0.25} r={r * 0.1} fill="#1d1228" />
          <circle cx={cx + r * 0.35} cy={cy - r * 0.25} r={r * 0.1} fill="#1d1228" />
          <path d={`M${cx - r * 0.5} ${cy + r * 0.2} Q ${cx} ${cy + r * 0.75} ${cx + r * 0.5} ${cy + r * 0.2}`} fill="none" stroke="#1d1228" strokeWidth={3} strokeLinecap="round" />
        </g>
      )
    case 'arrow':
      return <polygon points={`${cx - r},${cy - r * 0.25} ${cx + r * 0.2},${cy - r * 0.25} ${cx + r * 0.2},${cy - r * 0.65} ${cx + r},${cy} ${cx + r * 0.2},${cy + r * 0.65} ${cx + r * 0.2},${cy + r * 0.25} ${cx - r},${cy + r * 0.25}`} {...s} />
    case 'fish':
      return (
        <g>
          <ellipse cx={cx - r * 0.1} cy={cy} rx={r * 0.75} ry={r * 0.45} {...s} />
          <polygon points={`${cx + r * 0.6},${cy} ${cx + r},${cy - r * 0.45} ${cx + r},${cy + r * 0.45}`} {...s} />
          <circle cx={cx - r * 0.5} cy={cy - r * 0.1} r={r * 0.08} fill="#1d1228" />
        </g>
      )
    case 'sun':
      return (
        <g>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4
            return <line key={i} x1={cx + r * 0.7 * Math.cos(a)} y1={cy + r * 0.7 * Math.sin(a)} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke={fill} strokeWidth={5} strokeLinecap="round" />
          })}
          <circle cx={cx} cy={cy} r={r * 0.55} {...s} />
        </g>
      )
  }
}
export function ScenePicture({ items, size = 300 }: { items: ShapeItem[]; size?: number }) {
  return (
    <svg viewBox="0 0 300 300" width={size} height={size} className="rounded-3xl shadow-xl ring-1 ring-black/10 mx-auto block max-w-full h-auto" style={{ background: '#fdfbff' }} role="img" aria-label="الصورة">
      {items.map((it, i) => {
        const col = it.cell % 3
        const row = Math.floor(it.cell / 3)
        const cx = 50 + col * 100
        const cy = 50 + row * 100
        const fill = shapeColors.find((c) => c.id === it.c)?.hex ?? '#888'
        return <g key={i}>{shapePath(it.k, cx, cy, it.big ? 44 : 26, fill)}</g>
      })}
    </svg>
  )
}
export function sceneText(items: ShapeItem[]) {
  const where = ['فوق يمين', 'فوق بالنص', 'فوق يسار', 'بالنص يمين', 'بالنص تمامًا', 'بالنص يسار', 'تحت يمين', 'تحت بالنص', 'تحت يسار']
  return items.map((it) => `${shapeNames[it.k]} ${shapeColors.find((c) => c.id === it.c)?.name} ${it.big ? 'كبير' : 'صغير'} — ${where[it.cell]}`)
}

/* ================================ ارسم اللي أوصفه ================================ */
export function DrawDescribeGame({ def }: { def: GameDef }) {
  const { session, moves, players } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName, partnerName } = useTurn()
  const secrets = useSecrets()
  const s = session!
  const c = s.content as { turns: number; seconds: number }
  const turn = Math.min(countKind(moves, 'next') + 1, c.turns)
  const slot = `p${turn}`
  const started = moves.find((m) => m.move.kind === 'start' && Number(m.move.turn) === turn)
  const revealed = moves.find((m) => m.move.kind === 'reveal' && m.move.slot === slot)
  const rated = moves.find((m) => m.move.kind === 'rate' && Number(m.move.turn) === turn)
  const scene = (revealed?.move.value ?? secrets[slot]?.v) as ShapeItem[] | undefined
  const last = turn >= c.turns
  const drawerName = players.find((p) => p.user_id !== s.turn_player)?.nickname ?? ''

  const left = useMoveTimer(started && !revealed ? started.created_at : null, c.seconds, () => void api.secret('reveal', slot, null, ['round_closed', 'session_closed']))
  const revealNow = () => void api.secret('reveal', slot, null, ['round_closed'])

  return (
    <GameShell def={def} progress={`الرسمة ${turn} من ${c.turns}`} onEnd={() => void api.end()}>
      <VoiceHint />
      <TurnBanner myTurn={myTurn} name={turnName} mine="أنت الواصف 🗣️ — شريكك يرسم" theirs={`${turnName} يوصف… وأنت ترسم 🖌️`} />
      {!started ? (
        myTurn ? (
          <div>
            {scene ? <ScenePicture items={scene} size={260} /> : <WaitingCard text="نجهز الصورة…" />}
            <p className="text-center text-sm text-mist my-3">هذي الصورة لك بس. لما تجهز اضغط ابدأ ووصفها بالصوت.</p>
            <Button variant="primary" size="lg" block loading={api.busy} onClick={() => void api.move({ kind: 'start', turn }, ['stale'])}>
              ابدأ الوصف ⏱️
            </Button>
          </div>
        ) : (
          <WaitingCard text={`${turnName} يشوف الصورة ويستعد…`} sub="جهّز يدك للرسم ✍️" />
        )
      ) : !revealed ? (
        <>
          <BigTimer ms={left} total={c.seconds} />
          {myTurn ? (
            <>
              {scene && <ScenePicture items={scene} size={220} />}
              <p className="text-center text-xs text-mist my-2">رسمة {partnerName} مباشرة 👇</p>
              <DrawCanvas sessionId={s.id} round={turn} canDraw={false} />
            </>
          ) : (
            <DrawCanvas sessionId={s.id} round={turn} canDraw />
          )}
          <Button variant="glass" block className="mt-3" onClick={revealNow}>
            خلصنا — اكشف الصورة 👀
          </Button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 items-start">
            <div>
              <p className="text-center text-xs text-mist mb-1.5">الأصل</p>
              {scene && <ScenePicture items={scene} size={170} />}
            </div>
            <div>
              <p className="text-center text-xs text-mist mb-1.5">رسمة {drawerName}</p>
              <DrawCanvas sessionId={s.id} round={turn} canDraw={false} />
            </div>
          </div>
          <Card className="mt-4 text-center">
            {rated ? (
              <>
                <p className="text-sm text-mist mb-1">تقييم الشبه</p>
                <Stars n={Number(rated.move.stars)} />
              </>
            ) : myTurn ? (
              <>
                <p className="mb-2 font-medium">كم تشبه الأصل؟</p>
                <StarsInput disabled={api.busy} onRate={(n) => void api.move({ kind: 'rate', turn, stars: n }, ['stale'])} />
              </>
            ) : (
              <p className="text-mist">{turnName} يقيّم رسمتك… 🙈</p>
            )}
          </Card>
          {rated && (
            <Button variant="primary" size="lg" block className="mt-4" loading={api.busy} icon={<ChevronLeft className="size-5" />} onClick={() => void api.move({ kind: 'next', turn, pass_turn: true, finish: last }, ['stale'])}>
              {last ? 'عرض النتيجة' : 'تبديل الأدوار'}
            </Button>
          )}
        </>
      )}
    </GameShell>
  )
}

/* ================================ كمّل رسمتي ================================ */
export function DrawContinueGame({ def }: { def: GameDef }) {
  const { session, moves, myId } = useRoom()
  const api = useGameApi()
  const { myTurn, turnName, partnerName } = useTurn()
  const s = session!
  const c = s.content as { strokes: number; theme: string | null }
  const n = countKind(moves, 'stroke')
  const done = n >= c.strokes
  const [justDrew, setJustDrew] = useState(false)
  const prevN = useRef(n)
  useEffect(() => {
    if (n !== prevN.current) {
      prevN.current = n
      setJustDrew(false)
    }
  }, [n])
  const titles = moves.filter((m) => m.move.kind === 'title')
  const myTitle = titles.find((t) => t.player_id === myId)
  const theirTitle = titles.find((t) => t.player_id !== myId)
  const [title, setTitle] = useState('')
  // لو سمّاها الاثنين بنفس اللحظة: أي واحد ينهي اللعبة
  useEffect(() => {
    if (myTitle && theirTitle && s.status === 'playing') void api.move({ kind: 'end', finish: true }, ['stale', 'session_closed'])
  }, [myTitle, theirTitle, s.status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GameShell def={def} progress={done ? 'سمّوا لوحتكم' : `الخط ${Math.min(n + 1, c.strokes)} من ${c.strokes}`} onEnd={() => void api.end()}>
      {c.theme && (
        <div className="mb-3 text-center">
          <span className="text-xs text-mist">الموضوع</span>
          <p className="font-display text-xl">{c.theme}</p>
        </div>
      )}
      {!done && <TurnBanner myTurn={myTurn && !justDrew} name={turnName} mine="دورك: ارسم خط واحد ✏️" theirs={justDrew ? `دور ${partnerName}…` : `${turnName} يرسم خطه…`} />}
      <DrawCanvas
        sessionId={s.id}
        round={1}
        canDraw={!done && myTurn && !justDrew && !api.busy}
        single
        onStrokeDone={() => {
          setJustDrew(true)
          sfx('tap')
          void api.move({ kind: 'stroke', pass_turn: true }, ['stale']).then((r) => !r && setJustDrew(false))
        }}
      />
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            {!myTitle ? (
              <div className="flex gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 50))}
                  placeholder="وش اسم هاللوحة؟ 😄"
                  className="flex-1 min-w-0 h-14 rounded-2xl glass px-4 focus:outline-none focus:ring-2 focus:ring-iris-400/50"
                  aria-label="اسم اللوحة"
                />
                <Button variant="primary" size="lg" disabled={!title.trim()} loading={api.busy} onClick={() => void api.move({ kind: 'title', text: title.trim(), finish: Boolean(theirTitle) }, ['stale'])}>
                  سمّها
                </Button>
              </div>
            ) : (
              <WaitingCard text={`بانتظار اسم ${partnerName}…`} sub={`سمّيتها: «${myTitle.move.text}»`} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  )
}

