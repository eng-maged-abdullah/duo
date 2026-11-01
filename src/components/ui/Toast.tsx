import { AnimatePresence, motion } from 'framer-motion'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Tone = 'info' | 'error' | 'success'
type T = { id: number; text: string; tone: Tone }

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {})

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x.filter((i) => i.text !== text).slice(-2), { id, text, tone }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === 'error' ? 5000 : 3200)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 pt-safe px-4" aria-live="polite">
        <AnimatePresence>
          {items.map((i) => (
            <motion.div
              key={i.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className={`pointer-events-auto glass-strong max-w-md rounded-2xl px-4 py-3 text-sm shadow-xl ${
                i.tone === 'error' ? 'border-rose-400/40 text-rose-200' : i.tone === 'success' ? 'border-emerald-400/30 text-emerald-200' : ''
              }`}
            >
              {i.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
