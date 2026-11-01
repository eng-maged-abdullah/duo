import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, LayoutGrid } from 'lucide-react'
import { gameById } from './registry'
import { PairGame } from './renderers/PairGame'
import { SprintGame } from './renderers/SprintGame'
import { MemoryGame, NumberGame, OpenCardGame, StoryGame, TruthDareGame } from './renderers/TurnGames'
import { useRoom } from '../lib/rooms/RoomProvider'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Confetti } from '../components/ui/Confetti'
import { sfx } from '../lib/sound'

export function GameHost() {
  const { session } = useRoom()
  const def = gameById(session?.game_id)
  if (!session || !def) return null
  switch (def.renderer) {
    case 'pair':
      return <PairGame def={def} />
    case 'sprint':
      return <SprintGame def={def} />
    case 'truthdare':
      return <TruthDareGame def={def} />
    case 'opencard':
      return <OpenCardGame def={def} />
    case 'story':
      return <StoryGame def={def} />
    case 'memory':
      return <MemoryGame def={def} />
    case 'number':
      return <NumberGame def={def} />
  }
}

export function Results({ onReplay, onMenu, replayBusy }: { onReplay: () => void; onMenu: () => void; replayBusy: boolean }) {
  const { session, answers, moves, players, myId, isHost, partner } = useRoom()
  const def = gameById(session?.game_id)
  const played = useRef<string | null>(null)
  const sum = def && session ? def.summarize({ session, answers, moves, players: [...players].sort((a, b) => a.seat - b.seat) }) : null
  useEffect(() => {
    if (sum?.celebrate && session && played.current !== session.id) {
      played.current = session.id
      sfx('win')
    }
  }, [sum?.celebrate, session])
  if (!def || !session || !sum) return null

  const storyLines = def.id === 'story' ? [session.content?.starter, ...moves.filter((m) => m.move.kind === 'line').map((m) => m.move.text)] : null

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

        {sum.note && <p className="mt-4 text-xs text-mist">{sum.note}</p>}

        {session.status === 'abandoned' && <p className="mt-4 text-sm text-champagne">انتهت اللعبة قبل اكتمالها.</p>}
      </motion.div>

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
