import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, ChevronDown, Clock, RotateCw, Send, Smile } from 'lucide-react'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { errorText, t } from '../../lib/i18n'

const QUICK = ['😂', '❤️', '😍', '🔥', '👏', '😅', '🤔', '😢', '🙈', '👍', '🥰', '😎']
const MAX = 500

function timeOf(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** محادثة الغرفة: لوحة جانبية على الكمبيوتر، ولوحة سفلية على الجوال */
export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { messages, sendMessage, retryMessage, partnerTyping, notifyTyping, partner, connection, setChatOpen } = useRoom()
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const atBottom = useRef(true)

  useEffect(() => setChatOpen(open), [open, setChatOpen])

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && (atBottom.current || messages.at(-1)?.mine)) el.scrollTop = el.scrollHeight
  }, [messages.length, open, partnerTyping, messages])

  const submit = () => {
    const v = text.trim()
    if (!v) return
    setText('')
    setEmoji(false)
    void sendMessage(v)
    inputRef.current?.focus()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label={t('chat')}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="glass-strong fixed z-50 flex flex-col inset-x-0 bottom-0 h-[64dvh] rounded-t-[1.75rem] lg:inset-x-auto lg:end-4 lg:top-36 lg:bottom-4 lg:h-auto lg:w-[380px] lg:rounded-[1.75rem] shadow-2xl"
          >
            <header className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-white/5">
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-semibold">{t('chat')}</h3>
                <p className="text-xs text-mist truncate">
                  {connection === 'live' ? `مع ${partner?.nickname ?? '…'}` : connection === 'offline' ? t('offline') : t('reconnecting')}
                </p>
              </div>
              <button onClick={onClose} className="flex items-center gap-1 rounded-xl px-3 h-10 text-sm glass hover:bg-white/10" aria-label={t('back_to_game')}>
                <ChevronDown className="size-4" />
                {t('back_to_game')}
              </button>
            </header>

            <div
              ref={listRef}
              onScroll={(e) => {
                const el = e.currentTarget
                atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
              }}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-2 overscroll-contain"
              aria-live="polite"
            >
              {messages.length === 0 && <p className="text-center text-sm text-mist mt-8">ابدأ السوالف 👋 الرسائل خاصة بهذه الغرفة فقط.</p>}
              {messages.map((m) => (
                <div key={m.client_id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${m.mine ? 'btn-primary text-white rounded-ee-md' : 'bg-white/10 rounded-es-md'} ${m.failed ? 'opacity-70' : ''}`}>
                    {!m.mine && <p className="text-[11px] text-rose-300 mb-0.5">{m.nickname}</p>}
                    <p dir="auto" className="whitespace-pre-wrap break-words leading-relaxed text-[15px]">
                      {m.body}
                    </p>
                    <div className={`mt-0.5 flex items-center gap-1 text-[10px] ${m.mine ? 'text-white/70 justify-end' : 'text-mist'}`}>
                      <span className="tabular-nums">{timeOf(m.created_at)}</span>
                      {m.mine && (m.pending ? <Clock className="size-3" aria-label={t('sending')} /> : m.failed ? <AlertCircle className="size-3" /> : <Check className="size-3" aria-label="أُرسلت" />)}
                    </div>
                    {m.failed && (
                      <button onClick={() => void retryMessage(m.client_id)} className="mt-1 flex items-center gap-1 text-xs underline">
                        <RotateCw className="size-3" /> {t('failed_send')} · {errorText(m.failed)} — {t('retry')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {partnerTyping && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white/10 px-3.5 py-2 text-xs text-mist">{t('typing_now', { name: partner?.nickname ?? '' })}</div>
                </div>
              )}
            </div>

            {emoji && (
              <div className="flex flex-wrap gap-1 px-3 pb-2">
                {QUICK.map((e) => (
                  <button key={e} className="size-10 rounded-xl text-xl hover:bg-white/10" onClick={() => setText((x) => (x + e).slice(0, MAX))} aria-label={`إضافة ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 px-3 pt-2 pb-safe border-t border-white/5">
              <button onClick={() => setEmoji((v) => !v)} className={`size-11 shrink-0 rounded-xl grid place-items-center ${emoji ? 'bg-white/15' : 'hover:bg-white/10'}`} aria-label="إيموجي">
                <Smile className="size-5" />
              </button>
              <textarea
                ref={inputRef}
                value={text}
                dir="auto"
                rows={1}
                maxLength={MAX}
                onChange={(e) => {
                  setText(e.target.value.slice(0, MAX))
                  notifyTyping()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder={t('type_message')}
                className="flex-1 max-h-32 min-h-11 resize-none rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 leading-snug focus:outline-none focus:ring-2 focus:ring-iris-400/50"
                aria-label={t('type_message')}
              />
              <button onClick={submit} disabled={!text.trim()} className="size-11 shrink-0 rounded-xl grid place-items-center btn-primary disabled:opacity-40" aria-label={t('send')}>
                <Send className="size-5 rtl:-scale-x-100" />
              </button>
            </div>
            {text.length > MAX - 60 && <p className="px-4 pb-2 text-[11px] text-mist tabular-nums">{text.length}/{MAX}</p>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
