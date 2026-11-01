import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ChoiceItem, GameDef } from '../types'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { GameShell, PromptCard, WaitingCard } from '../engine/GameShell'
import { useCountdown, useGameApi } from '../engine/useGameApi'
import { sfx, vibrate } from '../../lib/sound'

/** تحدي 60 ثانية: كل لاعب يتقدم بسرعته، والنتائج تُكشف عند انتهاء الوقت */
export function SprintGame({ def }: { def: GameDef }) {
  const { session, answers, myId, partner, serverNow } = useRoom()
  const api = useGameApi()
  const s = session!
  const items = (s.content?.items ?? []) as ChoiceItem[]
  const myCount = answers.filter((a) => a.player_id === myId).length
  const [optimistic, setOptimistic] = useState(0)
  const idx = Math.max(myCount, optimistic)
  const item = items[idx]
  const partnerCount = s.progress?.[partner?.user_id ?? ''] ?? 0
  const left = useCountdown(s.round_deadline, serverNow, () => void api.expire(1))

  const answer = async (choice: number) => {
    if (!item || api.busy) return
    sfx('tap')
    vibrate(8)
    setOptimistic(idx + 1)
    const res = await api.answer(idx + 1, { choice })
    if (!res) setOptimistic(myCount)
  }

  return (
    <GameShell def={def} progress={`أنت: ${idx} · ${partner?.nickname ?? 'شريكك'}: ${partnerCount}`} timeLeft={left} totalSeconds={s.round_seconds} onEnd={() => void api.end()}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <ProgressBar label="أنت" value={idx} total={items.length} tone="iris" />
        <ProgressBar label={partner?.nickname ?? 'شريكك'} value={partnerCount} total={items.length} tone="rose" />
      </div>
      {item && (left ?? 1) > 0 ? (
        <>
          <PromptCard tag={`${idx + 1} / ${items.length}`}>{item.prompt}</PromptCard>
          <div className="grid grid-cols-2 gap-3">
            {item.options.map((o, i) => (
              <motion.button
                key={`${idx}-${i}`}
                whileTap={{ scale: 0.95 }}
                disabled={api.busy}
                onClick={() => void answer(i)}
                className={`min-h-24 rounded-2xl font-display text-xl ${i === 0 ? 'bg-emerald-500/15 border border-emerald-400/30' : 'bg-rose-500/15 border border-rose-400/30'}`}
              >
                {o}
              </motion.button>
            ))}
          </div>
        </>
      ) : (
        <WaitingCard text={(left ?? 1) <= 0 ? 'انتهى الوقت! نجهز النتيجة…' : 'خلّصت كل العبارات! 👏'} sub={`بانتظار ${partner?.nickname ?? 'شريكك'} أو انتهاء الوقت`} />
      )}
    </GameShell>
  )
}

function ProgressBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'iris' | 'rose' }) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex justify-between text-xs mb-2">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-mist">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div className={`h-full rounded-full ${tone === 'iris' ? 'bg-iris-400' : 'bg-rose-400'}`} animate={{ width: `${(100 * value) / Math.max(1, total)}%` }} />
      </div>
    </div>
  )
}
