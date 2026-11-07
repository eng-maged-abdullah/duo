import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, LayoutGrid, Star, Moon } from 'lucide-react'
import { gameById } from './registry'
import { PairGame } from './renderers/PairGame'
import { SprintGame } from './renderers/SprintGame'
import { MemoryGame, NumberGame, StoryGame, TruthDareGame } from './renderers/TurnGames'
import { DrawContinueGame, DrawDescribeGame, DrawGuessGame } from './renderers/DrawGames'
import { CardsGame, ComplimentsGame, ForbiddenGame, HumGame, NoLaughGame, TongueGame, TwentyGame, TwoTruthsGame } from './renderers/VoiceGames'
import { BetGame, DreamGame, RatedGame, ReflexGame, WordRaceGame } from './renderers/RoundGames'
import { ChainGame, Connect4Game, DotsGame, LiarGame, VaultGame } from './renderers/BoardGames'
import { DrawingPreview } from './renderers/DrawCanvas'
import { nightById } from './nights'
import { useRoom } from '../lib/rooms/RoomProvider'
import { roomsApi } from '../lib/rooms/api'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Confetti } from '../components/ui/Confetti'
import { useToast } from '../components/ui/Toast'
import { errorText } from '../lib/i18n'
import { sfx } from '../lib/sound'
import { useGameApi } from './engine/useGameApi'

export function GameHost() {
  const { session } = useRoom()
  const def = gameById(session?.game_id)
  if (!session) return null
  if (!def) return <UnknownGame />
  switch (def.renderer) {
    case 'pair':
      return <PairGame def={def} />
    case 'sprint':
      return <SprintGame def={def} />
    case 'truthdare':
      return <TruthDareGame def={def} />
    case 'story':
      return <StoryGame def={def} />
    case 'memory':
      return <MemoryGame def={def} />
    case 'number':
      return <NumberGame def={def} />
    case 'drawguess':
      return <DrawGuessGame def={def} />
    case 'drawdescribe':
      return <DrawDescribeGame def={def} />
    case 'drawcontinue':
      return <DrawContinueGame def={def} />
    case 'cards':
      return <CardsGame def={def} />
    case 'hum':
      return <HumGame def={def} />
    case 'twotruths':
      return <TwoTruthsGame def={def} />
    case 'wordrace':
      return <WordRaceGame def={def} />
    case 'nolaugh':
      return <NoLaughGame def={def} />
    case 'forbidden':
      return <ForbiddenGame def={def} />
    case 'tongue':
      return <TongueGame def={def} />
    case 'rated':
      return <RatedGame def={def} />
    case 'twenty':
      return <TwentyGame def={def} />
    case 'reflex':
      return <ReflexGame def={def} />
    case 'compliments':
      return <ComplimentsGame def={def} />
    case 'dream':
      return <DreamGame def={def} />
    case 'bet':
      return <BetGame def={def} />
    case 'liar':
      return <LiarGame def={def} />
    case 'dots':
      return <DotsGame def={def} />
    case 'connect4':
      return <Connect4Game def={def} />
    case 'chain':
      return <ChainGame def={def} />
    case 'vault':
      return <VaultGame def={def} />
  }
}

/** لعبة قديمة انحذفت من التحديث وهي شغالة في الغرفة */
function UnknownGame() {
  const api = useGameApi()
  return (
    <div className="mx-auto max-w-md glass rounded-3xl p-6 text-center">
      <p className="text-4xl mb-3">🧩</p>
      <p className="font-medium mb-4">هذي اللعبة صارت جزء من لعبة جديدة بعد التحديث.</p>
      <Button variant="primary" block onClick={() => void api.end()}>
        رجوع لقائمة الألعاب
      </Button>
    </div>
  )
}

const DRAW_GALLERY = new Set(['draw-guess', 'draw-describe'])

export function Results({
  onReplay,
  onMenu,
  replayBusy,
  onNightNext,
}: {
  onReplay: () => void
  onMenu: () => void
  replayBusy: boolean
  onNightNext?: () => void
}) {
  const { session, answers, moves, players, myId, isHost, partner, room } = useRoom()
  const toast = useToast()
  const def = gameById(session?.game_id)
  const played = useRef<string | null>(null)
  const [saved, setSaved] = useState(false)
  const sum = def && session ? def.summarize({ session, answers, moves, players: [...players].sort((a, b) => a.seat - b.seat) }) : null
  useEffect(() => {
    if (sum?.celebrate && session && played.current !== session.id) {
      played.current = session.id
      sfx('win')
    }
  }, [sum?.celebrate, session])
  if (!def || !session || !sum) return null

  const storyLines = def.id === 'story' ? [session.content?.starter, ...moves.filter((m) => m.move.kind === 'line').map((m) => m.move.text)] : null
  const night = nightById(session.content?.night?.id)
  const step = Number(session.content?.night?.step ?? 0)
  const nextStep = night?.steps[step + 1]
  const nextDef = nextStep ? gameById(nextStep.game) : undefined
  const stake = typeof session.content?.stake === 'string' ? (session.content.stake as string) : null
  const ids = players.map((p) => p.user_id)
  const loser =
    sum.scores && ids.length === 2 && (sum.scores[ids[0]] ?? 0) !== (sum.scores[ids[1]] ?? 0)
      ? (sum.scores[ids[0]] ?? 0) < (sum.scores[ids[1]] ?? 0)
        ? ids[0]
        : ids[1]
      : null
  const turnsTotal = Number(session.content?.turns ?? 0)

  const saveMoment = async () => {
    if (!room || saved) return
    const body = [...(sum.lines ?? []), ...(storyLines ? [storyLines.filter(Boolean).join(' ')] : [])].join('\n').slice(0, 1400)
    const res = await roomsApi.momentAdd(room.id, 'saved', `${def.title} — ${sum.headline}`.slice(0, 120), body, def.emoji)
    if (res.ok) {
      setSaved(true)
      toast('انحفظت في أرشيفكم ⭐', 'success')
    } else toast(errorText(res.error), 'error')
  }

  return (
    <div className="mx-auto max-w-xl">
      {sum.celebrate && <Confetti />}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="ring-gradient glass rounded-[2rem] p-6 sm:p-8 text-center">
        <div className="text-5xl mb-3">{def.emoji}</div>
        <p className="text-sm text-mist">{def.title}</p>
        <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-1 text-gradient">{sum.headline}</h2>

        {sum.percent !== undefined && (
          <div className="my-6">
            <div className="font-display text-6xl font-semibold tabular-nums text-gradient">{sum.percent}%</div>
            <p className="text-mist mt-1">{sum.percentLabel}</p>
          </div>
        )}

        {sum.scores && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[...players]
              .sort((a, b) => a.seat - b.seat)
              .map((p) => (
                <div key={p.user_id} className="glass rounded-2xl p-4 flex flex-col items-center gap-2">
                  <Avatar name={p.nickname} seat={p.seat} size={44} />
                  <p className="text-sm truncate max-w-full">{p.user_id === myId ? 'أنت' : p.nickname}</p>
                  <p className="font-display text-3xl tabular-nums">{sum.scores![p.user_id] ?? 0}</p>
                  {sum.unit && <p className="text-[11px] text-mist">{sum.unit}</p>}
                </div>
              ))}
          </div>
        )}

        {sum.lines?.length ? (
          <ul className="mt-5 space-y-1.5 text-[15px] text-cloud/90">
            {sum.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : null}

        {storyLines && (
          <p className="mt-5 glass rounded-2xl p-4 text-start leading-loose">{storyLines.filter(Boolean).join(' ')}</p>
        )}

        {def.id === 'draw-continue' && (
          <div className="mt-5">
            <DrawingPreview sessionId={session.id} round={1} size={260} />
          </div>
        )}
        {DRAW_GALLERY.has(def.id) && turnsTotal > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {Array.from({ length: turnsTotal }, (_, i) => (
              <DrawingPreview key={i} sessionId={session.id} round={i + 1} size={140} />
            ))}
          </div>
        )}

        {stake && loser && (
          <div className="mt-5 rounded-2xl bg-champagne/10 border border-champagne/30 p-4">
            <p className="text-xs text-champagne mb-1">🎲 الرهان</p>
            <p className="font-medium">{stake}</p>
            <p className="text-sm mt-1">
              على: <b>{loser === myId ? 'أنت 😅' : players.find((p) => p.user_id === loser)?.nickname}</b>
            </p>
          </div>
        )}

        {sum.note && <p className="mt-4 text-xs text-mist">{sum.note}</p>}

        <button onClick={() => void saveMoment()} disabled={saved} className="mt-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-cloud disabled:opacity-60">
          <Star className={`size-4 ${saved ? 'fill-champagne text-champagne' : ''}`} /> {saved ? 'محفوظة في أرشيفكم' : 'احفظ هذي اللحظة في أرشيفنا'}
        </button>

        {session.status === 'abandoned' && <p className="mt-4 text-sm text-champagne">انتهت اللعبة قبل اكتمالها.</p>}
      </motion.div>

      {night && (
        <div className="mt-5 glass rounded-3xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Moon className="size-4 text-champagne" />
            <p className="text-sm font-semibold">
              {night.emoji} {night.title} · المحطة {step + 1} من {night.steps.length}
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-3">
            <div className="h-full rounded-full btn-primary" style={{ width: `${((step + 1) / night.steps.length) * 100}%` }} />
          </div>
          {nextDef ? (
            isHost ? (
              <Button variant="primary" size="lg" block loading={replayBusy} disabled={!partner} onClick={onNightNext}>
                التالي: {nextDef.emoji} {nextDef.title}
              </Button>
            ) : (
              <p className="text-center text-sm text-mist">التالي: {nextDef.emoji} {nextDef.title} — بانتظار منشئ الغرفة</p>
            )
          ) : (
            <p className="text-center">خلصت السهرة 🌙 — وش رأيكم تكتبون لبعض رسالة مقفلة تنفتح بكرة؟ 💌</p>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        {isHost ? (
          <Button variant="primary" size="lg" icon={<RotateCcw className="size-5" />} loading={replayBusy} onClick={onReplay} disabled={!partner}>
            إعادة اللعب
          </Button>
        ) : (
          <div className="glass rounded-2xl grid place-items-center text-sm text-mist px-3 text-center">إعادة اللعب من منشئ الغرفة</div>
        )}
        <Button variant="glass" size="lg" icon={<LayoutGrid className="size-5" />} onClick={onMenu}>
          قائمة الألعاب
        </Button>
      </div>
    </div>
  )
}
