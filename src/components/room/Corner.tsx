import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Flame, Lock, Plus, Trash2 } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { roomsApi } from '../../lib/rooms/api'
import { supabase } from '../../lib/supabase/client'
import { errorText } from '../../lib/i18n'
import { allTalk } from '../../games/banks'
import { hashKey } from '../../games/engine/fresh'
import { sfx } from '../../lib/sound'

export type CornerTab = 'daily' | 'letters' | 'story' | 'dreams' | 'archive' | 'stats'
const tabs: { id: CornerTab; label: string }[] = [
  { id: 'daily', label: 'سؤال اليوم 💭' },
  { id: 'letters', label: 'رسائل 💌' },
  { id: 'story', label: 'قصتنا 📖' },
  { id: 'dreams', label: 'أحلامنا ✨' },
  { id: 'archive', label: 'أرشيفنا ⭐' },
  { id: 'stats', label: 'إحصائياتنا 📊' },
]

/** تاريخ اليوم حسب جهازك (YYYY-MM-DD) */
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dailyPool = [...allTalk.filter((t) => t.c !== 'جريئة 🔥' && t.c !== 'كمّلها ✍️')].sort((a, b) => hashKey(a.q).localeCompare(hashKey(b.q)))
export function dailyQuestion(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  const idx = Math.floor(Date.UTC(y, m - 1, d) / 86400000)
  return dailyPool[(((idx * 7919) % dailyPool.length) + dailyPool.length) % dailyPool.length]
}
const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return s
  }
}
function untilText(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now
  const h = Math.ceil(ms / 3600e3)
  if (h <= 1) return 'خلال ساعة'
  if (h < 48) return `بعد ${h} ساعة`
  const d = Math.ceil(h / 24)
  if (d < 60) return `بعد ${d} يوم`
  return `في ${fmtDate(iso)}`
}

type Moment = { id: string; author_id: string; kind: 'timeline' | 'bucket' | 'saved'; title: string; body: string; emoji: string; happened_on: string | null; done: boolean; created_at: string }

/** تحديث تلقائي لما يغيّر الشريك شي */
function useCornerPing(reload: () => void) {
  const { onLive } = useRoom()
  useEffect(() => {
    if (!onLive) return
    return onLive((m) => m.t === 'corner' && reload())
  }, [onLive, reload])
}

export function CornerSheet({ open, onClose, initial = 'daily' }: { open: boolean; onClose: () => void; initial?: CornerTab }) {
  const [tab, setTab] = useState<CornerTab>(initial)
  useEffect(() => {
    if (open) setTab(initial)
  }, [open, initial])
  return (
    <Sheet open={open} onClose={onClose} title="ركننا 💞" wide>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-3">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-3 h-9 text-sm ${tab === t.id ? 'btn-primary text-white' : 'glass'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-mist mb-3">⚠️ كل اللي هنا ينحذف مع الغرفة إذا ما دخلها أحد لمدة ساعة.</p>
      <div className="min-h-[50dvh]">
        {tab === 'daily' && <DailyTab />}
        {tab === 'letters' && <LettersTab />}
        {tab === 'story' && <MomentsTab kind="timeline" />}
        {tab === 'dreams' && <MomentsTab kind="bucket" />}
        {tab === 'archive' && <MomentsTab kind="saved" />}
        {tab === 'stats' && <StatsTab />}
      </div>
    </Sheet>
  )
}

/* ------------------------------- سؤال اليوم ------------------------------- */
export function useDaily() {
  const { room, sendLive } = useRoom()
  const day = localDay()
  const [data, setData] = useState<{ mine: string | null; theirs: string | null; their_done: boolean; streak: number; history: { day: string; mine: string; theirs: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!room) return
    const r = await roomsApi.dailyGet(room.id, day)
    if (r.ok) {
      setData(r)
      setError(null)
    } else setError(r.error)
  }, [room, day])
  useEffect(() => {
    void load()
  }, [load])
  useCornerPing(load)
  const answer = async (text: string) => {
    if (!room) return false
    const r = await roomsApi.dailyAnswer(room.id, day, text)
    if (!r.ok) return r.error
    sendLive?.({ t: 'corner' })
    await load()
    return true
  }
  return { day, q: dailyQuestion(day), data, error, answer, reload: load }
}

function DailyTab() {
  const { partner } = useRoom()
  const toast = useToast()
  const { q, data, error, answer } = useDaily()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const pName = partner?.nickname ?? 'شريكك'
  if (error) return <p className="text-center text-mist py-10">{errorText(error)}</p>
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-mist">{q?.c}</p>
        <span className="flex items-center gap-1 rounded-full bg-champagne/15 text-champagne px-3 py-1 text-sm">
          <Flame className="size-4" /> {data?.streak ?? 0} يوم ورا بعض
        </span>
      </div>
      <div className="ring-gradient glass rounded-[1.75rem] p-6 text-center mb-4">
        <p className="font-display text-xl leading-relaxed">{q?.q}</p>
      </div>
      {!data ? (
        <p className="text-center text-mist">…</p>
      ) : !data.mine ? (
        <>
          {data.their_done && <p className="text-center text-sm text-emerald-300 mb-2">✓ {pName} جاوب — إجابته تظهر لك بعد ما تجاوب</p>}
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={3} placeholder="اكتب من قلبك…" className="w-full resize-none rounded-2xl glass px-4 py-3 focus:outline-none focus:ring-2 focus:ring-iris-400/50" aria-label="إجابتك" />
          <Button
            variant="primary"
            block
            className="mt-3"
            disabled={!text.trim()}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              const r = await answer(text.trim())
              setBusy(false)
              if (r !== true) toast(errorText(r || undefined), 'error')
              else sfx('match')
            }}
          >
            أرسل إجابتي
          </Button>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="glass rounded-2xl p-4">
            <p className="text-xs text-mist mb-1">إجابتك</p>
            <p className="leading-relaxed whitespace-pre-wrap">{data.mine}</p>
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="text-xs text-mist mb-1">{pName}</p>
            <p className="leading-relaxed whitespace-pre-wrap">{data.theirs ?? `لسه ما جاوب… ذكّره 😄`}</p>
          </div>
        </div>
      )}
      {data && data.history.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold mb-2">الأيام اللي فاتت</p>
          <div className="space-y-2">
            {data.history.map((h) => (
              <details key={h.day} className="glass rounded-2xl px-4 py-3">
                <summary className="cursor-pointer text-sm">
                  {fmtDate(h.day)} — {dailyQuestion(h.day)?.q}
                </summary>
                <div className="mt-2 grid gap-2 text-sm">
                  <p>
                    <span className="text-mist">أنت: </span>
                    {h.mine}
                  </p>
                  <p>
                    <span className="text-mist">{pName}: </span>
                    {h.theirs}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------- الرسائل المقفلة ------------------------------- */
function LettersTab() {
  const { room, myId, partner, sendLive } = useRoom()
  const toast = useToast()
  const [list, setList] = useState<{ id: string; author_id: string; unlock_at: string; created_at: string; open: boolean; body: string | null }[]>([])
  const [now, setNow] = useState(Date.now())
  const [body, setBody] = useState('')
  const [when, setWhen] = useState<'now' | 'tomorrow' | 'week' | 'month' | 'date'>('tomorrow')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!room) return
    const r = await roomsApi.letterList(room.id)
    if (r.ok) {
      setList(r.letters)
      setNow(new Date(r.now).getTime())
    }
  }, [room])
  useEffect(() => {
    void load()
  }, [load])
  useCornerPing(load)
  const unlockAt = () => {
    const d = new Date()
    if (when === 'tomorrow') d.setDate(d.getDate() + 1)
    if (when === 'week') d.setDate(d.getDate() + 7)
    if (when === 'month') d.setMonth(d.getMonth() + 1)
    if (when === 'date' && date) return new Date(`${date}T00:00:00`).toISOString()
    return d.toISOString()
  }
  const send = async () => {
    if (!room || !body.trim()) return
    if (when === 'date' && !date) return toast('اختر التاريخ', 'error')
    setBusy(true)
    const r = await roomsApi.letterCreate(room.id, body.trim(), unlockAt())
    setBusy(false)
    if (!r.ok) return toast(errorText(r.error), 'error')
    setBody('')
    sfx('select')
    toast(when === 'now' ? 'وصلت رسالتك 💌' : 'انقفلت الرسالة 🔒 وبتنفتح في موعدها', 'success')
    sendLive?.({ t: 'corner' })
    void load()
  }
  return (
    <div>
      <div className="glass rounded-3xl p-4 mb-5">
        <p className="font-medium mb-2">اكتب رسالة لـ{partner?.nickname ?? 'شريكك'} 💌</p>
        <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} rows={4} placeholder="رسالة تنفتح في يوم مميز… ذكرى، عيد ميلاد، أو بس بكرة الصبح ☀️" className="w-full resize-none rounded-2xl bg-white/5 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-iris-400/50" aria-label="الرسالة" />
        <p className="text-xs text-mist mt-3 mb-1.5">متى تنفتح؟</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['now', 'الحين'],
              ['tomorrow', 'بكرة'],
              ['week', 'بعد أسبوع'],
              ['month', 'بعد شهر'],
              ['date', 'تاريخ معيّن 📅'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setWhen(k)} className={`rounded-xl px-3 py-1.5 text-sm ${when === k ? 'btn-primary text-white' : 'glass'}`}>
              {l}
            </button>
          ))}
        </div>
        {when === 'date' && <input type="date" value={date} min={localDay()} onChange={(e) => setDate(e.target.value)} className="mt-2 h-11 rounded-xl glass px-3" aria-label="تاريخ الفتح" />}
        <Button variant="primary" block className="mt-3" disabled={!body.trim()} loading={busy} onClick={() => void send()} icon={when === 'now' ? undefined : <Lock className="size-4" />}>
          {when === 'now' ? 'أرسلها' : 'اقفلها وأرسلها'}
        </Button>
      </div>
      {list.length === 0 && <p className="text-center text-mist py-6">ما فيه رسائل لين الحين… اكتب أول وحدة 💜</p>}
      <div className="space-y-3">
        {list.map((l) => {
          const mine = l.author_id === myId
          return (
            <motion.div key={l.id} layout className={`rounded-3xl p-4 ${l.open ? 'glass' : 'bg-gradient-to-br from-iris-500/20 to-frost-500/15 border border-white/10'}`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs text-mist">
                  {mine ? 'منك' : `من ${partner?.nickname ?? 'شريكك'}`} · {l.open ? `انفتحت ${fmtDate(l.unlock_at)}` : `🔒 تنفتح ${untilText(l.unlock_at, now)}`}
                </p>
                {mine && (
                  <button
                    onClick={async () => {
                      if (!window.confirm('تحذف الرسالة؟')) return
                      const r = await roomsApi.letterDelete(l.id)
                      if (r.ok) {
                        sendLive?.({ t: 'corner' })
                        void load()
                      }
                    }}
                    className="text-mist hover:text-rose-300"
                    aria-label="حذف"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              {l.body ? <p className="leading-relaxed whitespace-pre-wrap">{l.body}</p> : <p className="text-center text-4xl py-3">💌🔒</p>}
              {mine && !l.open && <p className="text-[11px] text-mist mt-2">شريكك يشوف إن فيه رسالة، بس ما يقدر يقرأها قبل موعدها.</p>}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------- قصتنا / أحلامنا / الأرشيف ------------------------------- */
const kindInfo = {
  timeline: { add: 'أضف ذكرى لقصتنا', ph: 'مثال: أول لقاء ☕', empty: 'اكتبوا قصتكم: أول لقاء، أول رسالة، أحلى سفرة…', emoji: '💞' },
  bucket: { add: 'أضف حلم نسويه مع بعض', ph: 'مثال: نشوف الشفق القطبي', empty: 'قائمة الأشياء اللي تبون تسوونها مع بعض ✨', emoji: '✨' },
  saved: { add: '', ph: '', empty: 'لحظاتكم المحفوظة من الألعاب تظهر هنا ⭐ (اضغط "احفظ هذي اللحظة" بعد أي لعبة)', emoji: '⭐' },
}
function MomentsTab({ kind }: { kind: 'timeline' | 'bucket' | 'saved' }) {
  const { room, myId, sendLive } = useRoom()
  const toast = useToast()
  const [list, setList] = useState<Moment[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [emoji, setEmoji] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const info = kindInfo[kind]
  const load = useCallback(async () => {
    if (!room) return
    try {
      const { data } = await supabase().from('room_moments').select('*').eq('room_id', room.id).eq('kind', kind).order('created_at', { ascending: false }).limit(300)
      setList((data ?? []) as Moment[])
    } catch {
      /* */
    }
  }, [room, kind])
  useEffect(() => {
    void load()
  }, [load])
  useCornerPing(load)
  const sorted = useMemo(
    () => (kind === 'timeline' ? [...list].sort((a, b) => (a.happened_on ?? a.created_at).localeCompare(b.happened_on ?? b.created_at)) : kind === 'bucket' ? [...list].sort((a, b) => Number(a.done) - Number(b.done)) : list),
    [list, kind],
  )
  const add = async () => {
    if (!room || !title.trim()) return
    setBusy(true)
    const r = await roomsApi.momentAdd(room.id, kind, title.trim(), body.trim(), emoji.trim() || info.emoji, kind === 'timeline' && date ? date : null)
    setBusy(false)
    if (!r.ok) return toast(errorText(r.error), 'error')
    setTitle('')
    setBody('')
    setEmoji('')
    setDate('')
    sfx('select')
    sendLive?.({ t: 'corner' })
    void load()
  }
  const done = list.filter((m) => m.done).length
  return (
    <div>
      {kind !== 'saved' && (
        <div className="glass rounded-3xl p-4 mb-5 space-y-2.5">
          <p className="font-medium">{info.add}</p>
          <div className="flex gap-2">
            <input value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(0, 2).join(''))} placeholder={info.emoji} className="w-14 h-12 rounded-xl bg-white/5 text-center text-xl focus:outline-none" aria-label="إيموجي" />
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder={info.ph} className="flex-1 min-w-0 h-12 rounded-xl bg-white/5 px-3 focus:outline-none focus:ring-2 focus:ring-iris-400/50" aria-label="العنوان" />
          </div>
          {kind === 'timeline' && (
            <>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl bg-white/5 px-3" aria-label="التاريخ" />
              <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 1500))} rows={2} placeholder="وش صار؟ (اختياري)" className="w-full resize-none rounded-xl bg-white/5 px-3 py-2 focus:outline-none" aria-label="التفاصيل" />
            </>
          )}
          <Button variant="primary" block disabled={!title.trim()} loading={busy} onClick={() => void add()} icon={<Plus className="size-4" />}>
            أضف
          </Button>
        </div>
      )}
      {kind === 'bucket' && list.length > 0 && (
        <p className="text-sm text-mist mb-3">
          حققتوا {done} من {list.length} ✨
        </p>
      )}
      {sorted.length === 0 && <p className="text-center text-mist py-6 leading-relaxed">{info.empty}</p>}
      <div className={kind === 'timeline' ? 'relative border-s-2 border-iris-400/30 ms-3 ps-5 space-y-4' : 'space-y-2.5'}>
        {sorted.map((m) => (
          <motion.div key={m.id} layout className={`relative ${kind === 'timeline' ? '' : 'glass rounded-2xl px-4 py-3'} ${kind === 'bucket' && m.done ? 'opacity-70' : ''}`}>
            {kind === 'timeline' && <span className="absolute -start-[1.95rem] top-1 grid size-7 place-items-center rounded-full bg-night-800 border border-iris-400/40 text-sm">{m.emoji || '💞'}</span>}
            <div className={kind === 'timeline' ? 'glass rounded-2xl px-4 py-3' : ''}>
              <div className="flex items-start gap-2.5">
                {kind === 'bucket' && (
                  <button
                    onClick={async () => {
                      const r = await roomsApi.momentDone(m.id, !m.done)
                      if (r.ok) {
                        if (!m.done) sfx('win')
                        sendLive?.({ t: 'corner' })
                        void load()
                      }
                    }}
                    className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border ${m.done ? 'bg-emerald-500/30 border-emerald-400/50' : 'border-white/20'}`}
                    aria-label={m.done ? 'إلغاء التحقيق' : 'تحقق'}
                  >
                    {m.done && <Check className="size-4" />}
                  </button>
                )}
                {kind !== 'timeline' && <span className="text-xl">{m.emoji}</span>}
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${kind === 'bucket' && m.done ? 'line-through' : ''}`}>{m.title}</p>
                  {kind === 'timeline' && m.happened_on && <p className="text-xs text-mist">{fmtDate(m.happened_on)}</p>}
                  {m.body && <p className="text-sm text-cloud/85 mt-1 whitespace-pre-wrap leading-relaxed">{m.body}</p>}
                  {kind === 'saved' && <p className="text-[11px] text-mist mt-1">{fmtDate(m.created_at)}</p>}
                </div>
                {(m.author_id === myId || kind === 'bucket') && (
                  <button
                    onClick={async () => {
                      if (!window.confirm('تحذفها؟')) return
                      const r = await roomsApi.momentDelete(m.id)
                      if (r.ok) {
                        sendLive?.({ t: 'corner' })
                        void load()
                      } else toast(errorText(r.error), 'error')
                    }}
                    className="text-mist hover:text-rose-300 shrink-0"
                    aria-label="حذف"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- الإحصائيات ------------------------------- */
function StatsTab() {
  const { room } = useRoom()
  const [s, setS] = useState<{ games: number; days: number; since: string; letters: number; moments: number; dreams: number; dreams_done: number; daily: number } | null>(null)
  useEffect(() => {
    if (!room) return
    void roomsApi.stats(room.id).then((r) => r.ok && setS(r))
  }, [room])
  if (!s) return <p className="text-center text-mist py-10">…</p>
  const tiles = [
    { n: s.games, l: 'لعبة خلصتوها', e: '🎮' },
    { n: s.days, l: 'يوم لعبتوا فيه', e: '📅' },
    { n: s.daily, l: 'سؤال يومي جاوبتوه', e: '💭' },
    { n: s.letters, l: 'رسالة كتبتوها', e: '💌' },
    { n: s.moments, l: 'ذكرى في قصتكم', e: '📖' },
    { n: `${s.dreams_done}/${s.dreams}`, l: 'أحلام تحققت', e: '✨' },
  ]
  return (
    <div>
      <p className="text-center text-sm text-mist mb-4">غرفتكم من {fmtDate(s.since)} 💜</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.l} className="glass rounded-2xl p-4 text-center">
            <p className="text-2xl">{t.e}</p>
            <p className="font-display text-3xl tabular-nums mt-1">{t.n}</p>
            <p className="text-xs text-mist mt-1">{t.l}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
