import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, Star } from 'lucide-react'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { Avatar } from '../../components/ui/Avatar'
import type { Move } from '../../types/db'

export function useTurn() {
  const { session, myId, players, partner } = useRoom()
  const turn = session?.turn_player
  return {
    myTurn: turn === myId,
    turnId: turn ?? undefined,
    turnName: players.find((p) => p.user_id === turn)?.nickname ?? '',
    partnerName: partner?.nickname ?? 'شريكك',
  }
}

export function TurnBanner({ myTurn, name, mine = 'دورك الآن ✨', theirs }: { myTurn: boolean; name: string; mine?: string; theirs?: string }) {
  return (
    <div className={`mb-4 rounded-2xl px-4 py-2.5 text-center text-sm font-medium ${myTurn ? 'btn-primary text-white on-color' : 'glass text-mist'}`} aria-live="polite">
      {myTurn ? mine : (theirs ?? `دور ${name}`)}
    </div>
  )
}

/** شريط النقاط للاثنين */
export function ScoreBar({ scores, unit, highlight }: { scores: Record<string, number>; unit?: string; highlight?: string }) {
  const { players, myId } = useRoom()
  return (
    <div className="mb-4 grid grid-cols-2 gap-3">
      {[...players]
        .sort((a, b) => a.seat - b.seat)
        .map((p) => (
          <div key={p.user_id} className={`glass rounded-2xl px-3 py-2.5 flex items-center gap-2.5 ${highlight === p.user_id ? 'ring-2 ring-iris-400/60' : ''}`}>
            <Avatar name={p.nickname} seat={p.seat} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-mist truncate">{p.user_id === myId ? 'أنت' : p.nickname}</p>
              <p className="font-display text-xl leading-tight tabular-nums">
                {scores[p.user_id] ?? 0}
                {unit && <span className="text-[11px] text-mist font-sans ms-1">{unit}</span>}
              </p>
            </div>
          </div>
        ))}
    </div>
  )
}

export function VoiceHint() {
  const { voiceState } = useRoom()
  if (voiceState?.status === 'connected') return null
  return (
    <div className="mb-4 flex items-center gap-2 rounded-2xl bg-champagne/10 border border-champagne/20 px-3 py-2 text-[13px] text-champagne">
      <Mic className="size-4 shrink-0" />
      هذي اللعبة أحلى بالمكالمة الصوتية — شغّلوها من فوق 🎙️
    </div>
  )
}

export function StarsInput({ onRate, disabled, value }: { onRate: (n: number) => void; disabled?: boolean; value?: number }) {
  const [hover, setHover] = useState(0)
  const v = value ?? hover
  return (
    <div className="flex justify-center gap-1.5" dir="ltr" onPointerLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button
          key={n}
          whileTap={{ scale: 0.85 }}
          disabled={disabled}
          onPointerEnter={() => setHover(n)}
          onClick={() => onRate(n)}
          className="p-1.5 disabled:opacity-60"
          aria-label={`${n} نجوم`}
        >
          <Star className={`size-9 transition-colors ${n <= v ? 'fill-champagne text-champagne' : 'text-mist/50'}`} />
        </motion.button>
      ))}
    </div>
  )
}

export function Stars({ n }: { n: number }) {
  return (
    <span dir="ltr" className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`size-4 ${i <= n ? 'fill-champagne text-champagne' : 'text-mist/40'}`} />
      ))}
    </span>
  )
}

/** يظهر إشعار كبير لحظي لما توصل حركة معيّنة (مثل 🚨 أو ❤️) */
export function useMoveFlash(moves: Move[], match: (m: Move) => string | null, ms = 1800) {
  const [flash, setFlash] = useState<{ key: number; text: string } | null>(null)
  const last = useRef(moves.at(-1)?.seq ?? 0)
  useEffect(() => {
    const fresh = moves.filter((m) => m.seq > last.current)
    if (!fresh.length) return
    last.current = moves.at(-1)!.seq
    for (const m of fresh) {
      const t = match(m)
      if (t) setFlash({ key: m.seq, text: t })
    }
  }, [moves, match])
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), ms)
    return () => clearTimeout(t)
  }, [flash, ms])
  return flash
}

export function Flash({ flash }: { flash: { key: number; text: string } | null }) {
  return (
    <AnimatePresence>
      {flash && (
        <motion.div
          key={flash.key}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.3 }}
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
        >
          <div className="rounded-[2rem] glass-strong px-8 py-6 text-center font-display text-3xl shadow-2xl max-w-[85vw]">{flash.text}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function BigTimer({ ms, total }: { ms: number | null; total: number }) {
  if (ms === null) return null
  const s = Math.ceil(ms / 1000)
  const frac = Math.max(0, Math.min(1, ms / (total * 1000)))
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-mist">الوقت</span>
        <span className={`font-display text-2xl tabular-nums ${s <= 5 ? 'text-rose-300' : ''}`}>{s}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-200 ease-linear" style={{ width: `${frac * 100}%`, background: s <= 5 ? '#e07f86' : 'linear-gradient(90deg,#94c5cc,#b4d2e7)' }} />
      </div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-5 ${className}`}>{children}</div>
}

/** عدد حركات من نوع معيّن */
export const countKind = (moves: Move[], kind: string, pred: (m: Move) => boolean = () => true) => moves.filter((m) => m.move.kind === kind && pred(m)).length
export const lastKind = (moves: Move[], kinds: string[]) => [...moves].reverse().find((m) => kinds.includes(m.move.kind))
