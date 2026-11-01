import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

/** لوحة سفلية على الجوال، ونافذة في المنتصف على الشاشات الكبيرة */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={`glass-strong relative w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[88dvh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] pb-safe shadow-2xl`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pt-4 pb-3 bg-gradient-to-b from-night-800/95 to-night-800/0">
              <div className="mx-auto absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="إغلاق" className="size-10 rounded-xl grid place-items-center text-mist hover:text-white hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
