import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

const colors = ['#94c5cc', '#b4d2e7', '#a1a6b4', '#f8f8f8', '#5e9aa3', '#dbe9f3']

/** احتفال خفيف عند الفوز أو التطابق — يحترم إعداد تقليل الحركة */
export function Confetti({ count = 46 }: { count?: number }) {
  const reduce = useReducedMotion()
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 2.2 + Math.random() * 1.6,
        rot: Math.random() * 720 - 360,
        size: 6 + Math.random() * 7,
        color: colors[i % colors.length],
        round: Math.random() > 0.5,
      })),
    [count],
  )
  if (reduce) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block"
          style={{ left: `${p.x}%`, width: p.size, height: p.size * (p.round ? 1 : 0.45), background: p.color, borderRadius: p.round ? 999 : 2 }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ y: '105vh', opacity: [1, 1, 0], rotate: p.rot }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}
