import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { GameDef } from '../../games/types'
import { stakeList } from '../../games/content/v2/voice'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'

/** شاشة التعليمات والإعدادات قبل بدء أي لعبة */
export function GameSetupSheet({
  game,
  open,
  onClose,
  canStart,
  disabledReason,
  onStart,
  onSuggest,
  suggestLabel = 'اقترحها على منشئ الغرفة',
  busy,
}: {
  game: GameDef | undefined
  open: boolean
  onClose: () => void
  canStart: boolean
  disabledReason?: string
  onStart: (opts: Record<string, string>) => void
  onSuggest?: () => void
  suggestLabel?: string
  busy?: boolean
}) {
  const [opts, setOpts] = useState<Record<string, string>>({})
  const [stakeMode, setStakeMode] = useState<'none' | 'list' | 'custom'>('none')
  useEffect(() => {
    if (!game) return
    const d: Record<string, string> = {}
    for (const o of game.setup ?? []) if (o.kind === 'select') d[o.key] = o.default
    setOpts(d)
    setStakeMode('none')
  }, [game])
  if (!game) return null

  return (
    <Sheet open={open} onClose={onClose} title={game.title}>
      <div className="flex items-center gap-3 mb-4">
        <div className="grid size-14 place-items-center rounded-2xl text-3xl" style={{ background: `linear-gradient(135deg, ${game.accent[0]}, ${game.accent[1]})` }}>
          {game.emoji}
        </div>
        <div>
          <p className="text-mist text-sm">{game.tagline}</p>
          <p className="text-xs text-mist/80 mt-1">⏱ {game.minutes} · لاعبان</p>
        </div>
      </div>

      <h3 className="font-display font-semibold mb-2">طريقة اللعب</h3>
      <ol className="space-y-2 mb-5">
        {game.howTo.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-iris-500/20 text-iris-300 text-xs font-bold">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      {canStart && game.setup?.length ? (
        <div className="space-y-4 mb-5">
          {game.setup.map((o) =>
            o.kind === 'select' ? (
              <label key={o.key} className="block">
                <span className="text-sm text-mist">{o.label}</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {o.options.map((op) => (
                    <button
                      key={op.value}
                      onClick={() => setOpts((x) => ({ ...x, [o.key]: op.value }))}
                      className={`rounded-xl px-3 py-2 text-sm transition-colors ${opts[o.key] === op.value ? 'btn-primary text-white' : 'glass hover:bg-white/10'}`}
                      aria-pressed={opts[o.key] === op.value}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </label>
            ) : (
              <label key={o.key} className="block">
                <span className="text-sm text-mist">{o.label}</span>
                <textarea
                  value={opts[o.key] ?? ''}
                  onChange={(e) =>
                    setOpts((x) => ({
                      ...x,
                      [o.key]: e.target.value
                        .split('\n')
                        .slice(0, o.maxLines)
                        .map((l) => l.slice(0, o.maxLen))
                        .join('\n'),
                    }))
                  }
                  rows={3}
                  placeholder={o.placeholder}
                  className="mt-1.5 w-full rounded-2xl glass px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-iris-400/50"
                />
              </label>
            ),
          )}
        </div>
      ) : null}

      {game.voice && <p className="mb-4 rounded-2xl bg-champagne/10 border border-champagne/20 px-3 py-2 text-[13px] text-champagne">🎙️ هذي اللعبة أحلى وأنتم بالمكالمة الصوتية.</p>}

      {canStart && game.stakes && (
        <div className="mb-5">
          <span className="text-sm text-mist">🎲 رهان على الخسران (اختياري)</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(
              [
                ['none', 'بدون رهان'],
                ['list', 'رهان جاهز 🎲'],
                ['custom', 'رهان من عندي ✍️'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => {
                  setStakeMode(k)
                  setOpts((x) => ({ ...x, stake: k === 'list' ? stakeList[Math.floor(Math.random() * stakeList.length)] : '' }))
                }}
                className={`rounded-xl px-3 py-2 text-sm ${stakeMode === k ? 'btn-primary text-white' : 'glass hover:bg-white/10'}`}
              >
                {l}
              </button>
            ))}
          </div>
          {stakeMode === 'list' && (
            <div className="mt-2 max-h-44 overflow-y-auto space-y-1.5 pe-1">
              {stakeList.map((x) => (
                <button key={x} onClick={() => setOpts((o) => ({ ...o, stake: x }))} className={`w-full text-start rounded-xl px-3 py-2 text-[14px] ${opts.stake === x ? 'bg-champagne/20 ring-1 ring-champagne/50' : 'glass'}`}>
                  {x}
                </button>
              ))}
            </div>
          )}
          {stakeMode === 'custom' && (
            <input
              value={opts.stake ?? ''}
              onChange={(e) => setOpts((o) => ({ ...o, stake: e.target.value.slice(0, 90) }))}
              placeholder="مثال: الخسران يسوي قهوة للثاني ☕"
              className="mt-2 w-full h-12 rounded-2xl glass px-3 focus:outline-none focus:ring-2 focus:ring-iris-400/50"
            />
          )}
        </div>
      )}

      {canStart ? (
        <Button variant="primary" size="lg" block loading={busy} onClick={() => onStart(opts)} icon={<Play className="size-5 rtl:-scale-x-100" />}>
          ابدأ اللعبة للاثنين
        </Button>
      ) : (
        <>
          {disabledReason && <p className="text-center text-sm text-mist mb-3">{disabledReason}</p>}
          {onSuggest && (
            <Button variant="soft" size="lg" block onClick={onSuggest}>
              {suggestLabel}
            </Button>
          )}
        </>
      )}
    </Sheet>
  )
}
