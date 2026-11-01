import { motion } from 'framer-motion'
import type { GameDef } from '../../games/types'
import { categories } from '../../games/registry'

export function GameCard({ g, onClick, selected, compact }: { g: GameDef; onClick?: () => void; selected?: boolean; compact?: boolean }) {
  return (
    <motion.button
      layout
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[1.5rem] text-start glass transition-shadow ${selected ? 'ring-2 ring-rose-400/70' : ''} ${compact ? 'p-3.5' : 'p-4'}`}
      aria-pressed={selected}
    >
      <div
        className="absolute -top-10 -end-10 size-32 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-70"
        style={{ background: `radial-gradient(circle, ${g.accent[0]}, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        <div
          className={`grid shrink-0 place-items-center rounded-2xl shadow-lg ${compact ? 'size-11 text-xl' : 'size-12 text-2xl'}`}
          style={{ background: `linear-gradient(135deg, ${g.accent[0]}, ${g.accent[1]})` }}
          aria-hidden
        >
          {g.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-display font-semibold leading-tight truncate">{g.title}</h3>
            {g.badge && (
              <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${g.badge === 'new' ? 'bg-champagne/20 text-champagne' : 'bg-rose-400/20 text-rose-300'}`}>
                {g.badge === 'new' ? 'جديد' : 'رائج'}
              </span>
            )}
          </div>
          <p className="text-[13px] text-mist mt-1 leading-snug line-clamp-2">{g.tagline}</p>
          {!compact && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-mist/90">
              <span className="rounded-full bg-white/8 px-2 py-0.5 bg-white/5">⏱ {g.minutes}</span>
              {g.categories.slice(0, 2).map((c) => {
                const cat = categories.find((x) => x.id === c)
                return (
                  <span key={c} className="rounded-full bg-white/5 px-2 py-0.5">
                    {cat?.emoji} {cat?.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  )
}
