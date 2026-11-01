import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { HelpCircle, LogOut, Timer } from 'lucide-react'
import type { GameDef } from '../types'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'

export function GameShell({
  def,
  progress,
  timeLeft,
  totalSeconds,
  onEnd,
  children,
}: {
  def: GameDef
  progress?: string
  timeLeft?: number | null
  totalSeconds?: number | null
  onEnd: () => void
  children: ReactNode
}) {
  const [help, setHelp] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const secs = timeLeft == null ? null : Math.ceil(timeLeft / 1000)
  const frac = timeLeft != null && totalSeconds ? Math.max(0, Math.min(1, timeLeft / (totalSeconds * 1000))) : null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="grid size-11 shrink-0 place-items-center rounded-2xl text-xl shadow-lg"
          style={{ background: `linear-gradient(135deg, ${def.accent[0]}, ${def.accent[1]})` }}
          aria-hidden
        >
          {def.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold leading-tight truncate">{def.title}</h2>
          {progress && <p className="text-xs text-mist mt-0.5">{progress}</p>}
        </div>
        {secs !== null && (
          <div
            className={`flex items-center gap-1.5 rounded-xl px-3 h-10 font-display tabular-nums ${secs <= 5 ? 'bg-rose-500/20 text-rose-200' : 'glass'}`}
            aria-live="off"
            aria-label={`الوقت المتبقي ${secs} ثانية`}
          >
            <Timer className="size-4" />
            {secs}
          </div>
        )}
        <button onClick={() => setHelp(true)} className="size-10 grid place-items-center rounded-xl glass text-mist hover:text-white" aria-label="طريقة اللعب">
          <HelpCircle className="size-5" />
        </button>
        <button onClick={() => setConfirm(true)} className="size-10 grid place-items-center rounded-xl glass text-mist hover:text-white" aria-label="إنهاء اللعبة">
          <LogOut className="size-5 rtl:-scale-x-100" />
        </button>
      </div>

      {frac !== null && (
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-4">
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${def.accent[0]}, ${def.accent[1]})`, width: `${frac * 100}%` }}
            transition={{ ease: 'linear' }}
          />
        </div>
      )}

      {children}

      <Sheet open={help} onClose={() => setHelp(false)} title={`طريقة اللعب — ${def.title}`}>
        <ol className="space-y-3">
          {def.howTo.map((s, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-iris-500/20 text-iris-300 text-sm font-bold">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Sheet>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="إنهاء اللعبة؟">
        <p className="text-mist mb-5">سترجعون إلى قائمة الألعاب. المحادثة والمكالمة تبقى كما هي.</p>
        <div className="flex gap-3">
          <Button
            variant="danger"
            block
            onClick={() => {
              setConfirm(false)
              onEnd()
            }}
          >
            نعم، أنهِ اللعبة
          </Button>
          <Button variant="glass" block onClick={() => setConfirm(false)}>
            متابعة اللعب
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

export function WaitingCard({ text, sub }: { text: string; sub?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-3xl p-6 text-center">
      <div className="mx-auto mb-3 flex justify-center gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-2.5 rounded-full bg-iris-400"
            animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <p className="font-medium">{text}</p>
      {sub && <p className="text-sm text-mist mt-1">{sub}</p>}
    </motion.div>
  )
}

export function PromptCard({ children, tag, big }: { children: ReactNode; tag?: string; big?: string }) {
  return (
    <motion.div
      key={String(children)}
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className="ring-gradient glass relative rounded-[1.75rem] px-6 py-7 mb-5 text-center"
    >
      {tag && <span className="absolute top-3 start-4 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-mist">{tag}</span>}
      {big && (
        <div className="text-5xl mb-4 leading-tight tracking-widest" dir="ltr">
          {big}
        </div>
      )}
      <p className="font-display text-xl sm:text-2xl font-medium leading-relaxed text-balance">{children}</p>
    </motion.div>
  )
}
