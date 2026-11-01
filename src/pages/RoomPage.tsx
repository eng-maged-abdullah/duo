import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, DoorOpen, Loader2, MessageCircle, Share2, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { RoomProvider, useRoom } from '../lib/rooms/RoomProvider'
import { normalizeCode, roomsApi } from '../lib/rooms/api'
import { games, gameById, categories } from '../games/registry'
import type { CategoryId, GameDef } from '../games/types'
import { GameHost, Results } from '../games/GameHost'
import { ChatPanel } from '../components/chat/ChatPanel'
import { VoiceBar } from '../components/voice/VoiceBar'
import { GameCard } from '../components/games/GameCard'
import { GameSetupSheet } from '../components/room/GameSetupSheet'
import { Avatar } from '../components/ui/Avatar'
import { Button, IconButton } from '../components/ui/Button'
import { Sheet } from '../components/ui/Sheet'
import { useToast } from '../components/ui/Toast'
import { LogoMark } from '../components/ui/Logo'
import { errorText, t } from '../lib/i18n'
import { uuid } from '../utils/random'
import { sfx } from '../lib/sound'

export function RoomPage() {
  const { code = '' } = useParams()
  const c = normalizeCode(code)
  if (c.length !== 6) return <Navigate to="/join" replace />
  return (
    <RoomProvider code={c} key={c}>
      <RoomScreen code={c} />
    </RoomProvider>
  )
}

function inviteUrl(code: string) {
  const base = window.location.href.split('#')[0]
  return `${base}#/join/${code}`
}

export function shareInvite(code: string, toast: (s: string, tone?: 'info' | 'error' | 'success') => void) {
  const url = inviteUrl(code)
  const text = `تعال نلعب مع بعض في DUO 💜\nرمز الغرفة: ${code}`
  if (navigator.share) {
    navigator.share({ title: 'DUO', text, url }).catch(() => {})
  } else {
    navigator.clipboard?.writeText(`${text}\n${url}`).then(
      () => toast('تم نسخ رابط الدعوة', 'success'),
      () => toast('تعذّر النسخ', 'error'),
    )
  }
}

export function RoomScreen({ code }: { code: string }) {
  const r = useRoom()
  const nav = useNavigate()
  const toast = useToast()
  const [chat, setChat] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const prevPlayers = useRef<number | null>(null)
  const seenAbandon = useRef<string | null>(null)

  // إشعارات دخول وخروج الشريك
  useEffect(() => {
    const n = r.players.length
    if (prevPlayers.current !== null && n !== prevPlayers.current) {
      if (n > prevPlayers.current && r.partner) toast(t('partner_joined', { name: r.partner.nickname }), 'success')
      if (n < prevPlayers.current) toast('غادر شريكك الغرفة. تقدر تنتظر انضمام شخص جديد بنفس الرمز.')
    }
    prevPlayers.current = n
  }, [r.players.length, r.partner, toast])

  useEffect(() => {
    if (r.session?.status === 'abandoned' && seenAbandon.current !== r.session.id && dismissed !== r.session.id) {
      seenAbandon.current = r.session.id
      toast('انتهت اللعبة، رجعتم لقائمة الألعاب')
    }
  }, [r.session, dismissed, toast])

  if (r.status === 'loading') {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="flex flex-col items-center gap-4 text-mist">
          <LogoMark size={56} />
          <Loader2 className="size-6 animate-spin" />
          <p>{t('connecting')}</p>
        </div>
      </div>
    )
  }
  if (r.status === 'not_member') return <Navigate to={`/join/${code}`} replace state={{ notice: 'هذه الغرفة غير متاحة لك: إما حُذفت أو لست عضوًا فيها. للانضمام اكتب اسمك.' }} />
  if (r.status === 'error') {
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <div className="glass rounded-3xl p-6 max-w-sm text-center">
          <p className="mb-4">{errorText(r.error ?? undefined)}</p>
          <Button variant="primary" block onClick={() => window.location.reload()}>
            {t('retry')}
          </Button>
        </div>
      </div>
    )
  }

  const s = r.session
  const view: 'game' | 'results' | 'lobby' = s?.status === 'playing' ? 'game' : s && s.status === 'finished' && dismissed !== s.id ? 'results' : 'lobby'

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 pt-safe px-safe pb-2 bg-gradient-to-b from-night-950/95 via-night-950/80 to-transparent backdrop-blur-md">
        <div className="mx-auto max-w-5xl flex items-center gap-2 pt-1">
          <button onClick={() => nav('/')} aria-label="الرئيسية" className="shrink-0">
            <LogoMark size={34} />
          </button>
          <button
            onClick={() =>
              navigator.clipboard?.writeText(code).then(
                () => toast(t('copied'), 'success'),
                () => {},
              )
            }
            className="glass rounded-xl h-10 px-3 flex items-center gap-2"
            aria-label={`${t('copy_code')} ${code}`}
          >
            <span className="code-font text-sm font-semibold">{code}</span>
            <Copy className="size-3.5 text-mist" />
          </button>
          <ConnectionPill />
          <div className="flex-1" />
          <IconButton label={t('chat')} onClick={() => setChat((v) => !v)} badge={r.unread} active={chat}>
            <MessageCircle className="size-5" />
          </IconButton>
          <IconButton label="خيارات الغرفة" onClick={() => setLeaveOpen(true)}>
            <DoorOpen className="size-5" />
          </IconButton>
        </div>
        <div className="mx-auto max-w-5xl mt-2">
          <VoiceBar compact />
        </div>
      </header>

      <main className="flex-1 px-safe pt-4 pb-28">
        <div className={`mx-auto max-w-5xl transition-[padding] ${chat ? 'lg:ps-0 lg:pe-[400px]' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div key={view + (s?.id ?? '')} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
              {view === 'game' && <GameHost />}
              {view === 'results' && <ResultsView onMenu={() => setDismissed(s!.id)} />}
              {view === 'lobby' && <Lobby code={code} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {!chat && (
        <button
          onClick={() => setChat(true)}
          className="lg:hidden fixed z-30 bottom-[max(1rem,var(--safe-bottom))] end-4 size-14 rounded-2xl btn-primary grid place-items-center shadow-2xl"
          aria-label={t('chat')}
        >
          <MessageCircle className="size-6" />
          {r.unread > 0 && (
            <span className="absolute -top-1.5 -end-1.5 min-w-6 h-6 px-1 rounded-full bg-white text-night-950 text-xs font-bold leading-6">{r.unread > 9 ? '9+' : r.unread}</span>
          )}
        </button>
      )}
      <ChatPanel open={chat} onClose={() => setChat(false)} />

      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)} title="خيارات الغرفة">
        <div className="space-y-3">
          <Button variant="glass" block onClick={() => nav('/')}>
            الرجوع للرئيسية (تبقى الغرفة محفوظة)
          </Button>
          {r.isHost ? (
            <>
              <Button
                variant="danger"
                block
                onClick={async () => {
                  if (!window.confirm('حذف الغرفة نهائيًا مع كل رسائلها؟ لا يمكن التراجع.')) return
                  const err = await r.deleteRoom()
                  if (err) toast(errorText(err), 'error')
                  else nav('/', { replace: true })
                }}
              >
                حذف الغرفة نهائيًا
              </Button>
              <p className="text-xs text-mist leading-relaxed">الحذف يزيل الغرفة والرسائل والإجابات من قاعدة البيانات فورًا، ويخرج شريكك منها.</p>
            </>
          ) : (
            <>
              <Button
                variant="danger"
                block
                onClick={async () => {
                  await r.leave()
                  nav('/', { replace: true })
                }}
              >
                مغادرة الغرفة نهائيًا
              </Button>
              <p className="text-xs text-mist leading-relaxed">بعد المغادرة يمكن لشخص آخر أخذ مكانك بنفس الرمز. منشئ الغرفة فقط يستطيع حذفها.</p>
            </>
          )}
        </div>
      </Sheet>
    </div>
  )
}

function ConnectionPill() {
  const { connection, partner, online } = useRoom()
  const partnerOnline = partner ? online.has(partner.user_id) : false
  const live = connection === 'live'
  return (
    <div className={`flex items-center gap-1.5 rounded-xl h-10 px-2.5 text-xs ${live ? 'text-emerald-300' : 'text-champagne'} glass`} aria-live="polite">
      {live ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      <span className="hidden sm:inline">{live ? (partner ? (partnerOnline ? `${partner.nickname} ${t('online')}` : `${partner.nickname} ${t('offline')}`) : t('online')) : connection === 'offline' ? t('offline') : t('reconnecting')}</span>
    </div>
  )
}

/* ------------------------------ الردهة ------------------------------ */

const lastOpts = new Map<string, Record<string, string>>()

function useStarter() {
  const r = useRoom()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const reqRef = useRef<{ key: string; id: string } | null>(null)
  const start = async (g: GameDef, opts: Record<string, string>, key: string) => {
    if (busy || !r.room) return false
    // معرف ثابت للطلب: الضغط المتكرر لا ينشئ جلستين
    if (!reqRef.current || reqRef.current.key !== key) reqRef.current = { key, id: uuid() }
    setBusy(true)
    try {
      const built = g.build(opts, Math.random)
      const res = await roomsApi.startGame({
        roomId: r.room.id,
        game: g.id,
        requestId: reqRef.current.id,
        mode: g.mode,
        rounds: built.rounds,
        seconds: built.seconds,
        content: built.content,
      })
      if (!res.ok) {
        toast(errorText(res.error), 'error')
        return false
      }
      lastOpts.set(g.id, opts)
      reqRef.current = null
      sfx('select')
      await r.refreshGame()
      return true
    } finally {
      setBusy(false)
    }
  }
  return { start, busy }
}

function ResultsView({ onMenu }: { onMenu: () => void }) {
  const r = useRoom()
  const { start, busy } = useStarter()
  const g = gameById(r.session?.game_id)
  const replayKey = useMemo(() => `replay:${r.session?.id}`, [r.session?.id])
  return <Results replayBusy={busy} onMenu={onMenu} onReplay={() => g && void start(g, lastOpts.get(g.id) ?? {}, replayKey)} />
}

function Lobby({ code }: { code: string }) {
  const r = useRoom()
  const toast = useToast()
  const [cat, setCat] = useState<CategoryId | 'all'>('all')
  const [selected, setSelected] = useState<GameDef | undefined>()
  const [sheet, setSheet] = useState(false)
  const { start, busy } = useStarter()
  const suggested = gameById(r.room?.current_game)
  const list = cat === 'all' ? games : games.filter((g) => g.categories.includes(cat))
  const sheetKey = useMemo(() => `${selected?.id}:${Date.now()}`, [selected, sheet]) // eslint-disable-line react-hooks/exhaustive-deps

  const openGame = (g: GameDef) => {
    setSelected(g)
    setSheet(true)
  }

  return (
    <div>
      {!r.partner ? (
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="ring-gradient glass rounded-[2rem] p-6 sm:p-8 text-center mb-8">
          <div className="mx-auto mb-4 flex justify-center gap-2">
            {r.me && <Avatar name={r.me.nickname} seat={r.me.seat} size={52} online />}
            <div className="size-[52px] rounded-full border-2 border-dashed border-white/20 grid place-items-center text-mist">
              <Loader2 className="size-5 animate-spin" />
            </div>
          </div>
          <h1 className="font-display text-xl font-semibold">{t('waiting_partner')}</h1>
          <p className="text-mist text-sm mt-1">أرسل الرمز لشريكك ليدخل من جهازه، من أي شبكة.</p>
          <div className="my-6">
            <p className="text-xs text-mist mb-2">{t('room_code')}</p>
            <div className="code-font font-display text-4xl sm:text-5xl font-semibold text-gradient">{code}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
            <Button
              variant="glass"
              icon={<Copy className="size-4" />}
              onClick={() =>
                navigator.clipboard?.writeText(code).then(
                  () => toast(t('copied'), 'success'),
                  () => toast('تعذّر النسخ — انسخ الرمز يدويًا', 'error'),
                )
              }
            >
              {t('copy_code')}
            </Button>
            <Button variant="primary" icon={<Share2 className="size-4" />} onClick={() => shareInvite(code, toast)}>
              {t('share_invite')}
            </Button>
          </div>
          <p className="mt-5 text-xs text-mist">{t('room_expiry_note')}</p>
        </motion.section>
      ) : (
        <section className="glass rounded-[1.75rem] p-4 mb-6 flex items-center gap-3">
          <div className="flex -space-x-3 rtl:space-x-reverse" dir="ltr">
            {r.players.map((p) => (
              <Avatar key={p.user_id} name={p.nickname} seat={p.seat} online={r.online.has(p.user_id)} size={44} />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold truncate">
              {r.me?.nickname} و{r.partner.nickname}
            </p>
            <p className="text-xs text-mist">{r.isHost ? 'أنت منشئ الغرفة — اختر لعبة وابدأ' : `${r.players.find((p) => p.user_id === r.room?.host_id)?.nickname} يبدأ الألعاب، وتقدر تقترح`}</p>
          </div>
        </section>
      )}

      {suggested && r.partner && (
        <button onClick={() => openGame(suggested)} className="w-full mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-l from-rose-500/20 to-iris-500/20 border border-white/10 px-4 py-3 text-start">
          <Sparkles className="size-5 text-champagne shrink-0" />
          <span className="flex-1 text-sm">
            اللعبة المقترحة: <b>{suggested.title}</b>
          </span>
          <span className="text-xs text-mist">{r.isHost ? 'ابدأ ←' : 'عرض'}</span>
        </button>
      )}

      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-xl font-semibold">اختاروا لعبة</h2>
        <span className="text-xs text-mist">{list.length} لعبة</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-3 -mx-1 px-1">
        {[{ id: 'all' as const, label: 'الكل', emoji: '✨' }, ...categories].map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`shrink-0 rounded-full px-3.5 h-9 text-sm transition-colors ${cat === c.id ? 'btn-primary text-white' : 'glass hover:bg-white/10'}`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => (
          <GameCard key={g.id} g={g} compact onClick={() => openGame(g)} selected={suggested?.id === g.id} />
        ))}
      </div>

      <GameSetupSheet
        game={selected}
        open={sheet}
        onClose={() => setSheet(false)}
        busy={busy}
        canStart={r.isHost && Boolean(r.partner)}
        disabledReason={!r.partner ? 'انتظر انضمام اللاعب الثاني لبدء اللعب.' : !r.isHost ? 'منشئ الغرفة هو من يبدأ اللعبة.' : undefined}
        onSuggest={
          !r.isHost && r.partner && selected
            ? async () => {
                const res = await roomsApi.selectGame(r.room!.id, selected.id)
                if (res.ok) {
                  toast('تم إرسال الاقتراح 💌', 'success')
                  setSheet(false)
                } else toast(errorText(res.error), 'error')
              }
            : undefined
        }
        onStart={async (opts) => {
          if (!selected) return
          const ok = await start(selected, opts, sheetKey)
          if (ok) setSheet(false)
        }}
      />
    </div>
  )
}
