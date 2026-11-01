import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, DoorOpen, Heart, MessageCircle, Mic, Plus, RotateCcw, Search, Settings, Shield } from 'lucide-react'
import { Logo } from '../components/ui/Logo'
import { Button, IconButton } from '../components/ui/Button'
import { GameCard } from '../components/games/GameCard'
import { GameSetupSheet } from '../components/room/GameSetupSheet'
import { SettingsSheet } from '../components/SettingsSheet'
import { categories, games } from '../games/registry'
import type { CategoryId, GameDef } from '../games/types'
import { supabase, isConfigured } from '../lib/supabase/client'
import { t } from '../lib/i18n'

export function HomePage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<CategoryId | 'all'>('all')
  const [settings, setSettings] = useState(false)
  const [preview, setPreview] = useState<GameDef | undefined>()
  const [rooms, setRooms] = useState<{ code: string; created_at: string }[]>([])

  // غرفي: كل الغرف التي أنا عضو فيها (من الخادم، محمية بـ RLS)
  useEffect(() => {
    if (!isConfigured) return
    let alive = true
    ;(async () => {
      try {
        const sb = supabase()
        const { data: sess } = await sb.auth.getSession()
        if (!sess.session) return
        const { data } = await sb.from('rooms').select('code, created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(10)
        if (alive && data) setRooms(data as { code: string; created_at: string }[])
      } catch {
        /* بدون اتصال */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim()
    return games.filter((g) => (cat === 'all' || g.categories.includes(cat)) && (!s || g.title.includes(s) || g.tagline.includes(s) || g.howTo.some((h) => h.includes(s))))
  }, [q, cat])
  const featured = games.filter((g) => g.featured)
  const fresh = games.filter((g) => g.badge === 'new')

  return (
    <div className="min-h-dvh px-safe pt-safe pb-safe">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between py-3">
          <Logo size="sm" />
          <IconButton label={t('settings')} onClick={() => setSettings(true)}>
            <Settings className="size-5" />
          </IconButton>
        </header>

        {/* البطل */}
        <section className="relative pt-8 pb-10 sm:pt-14 sm:pb-14 text-center">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <div className="mx-auto mb-6 w-fit">
              <Logo size="lg" />
            </div>
            <h1 className="font-display text-[1.7rem] sm:text-4xl font-semibold leading-snug text-balance max-w-xl mx-auto">{t('app_tagline')}</h1>
            <p className="mt-3 text-mist max-w-md mx-auto leading-relaxed">غرفة خاصة لشخصين: ٢٠ لعبة، شات فوري، ومكالمة صوتية — بدون حسابات ولا أرقام.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.6 }} className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
            <Button variant="primary" size="lg" icon={<Plus className="size-5" />} onClick={() => nav('/create')}>
              {t('start_playing')}
            </Button>
            <Button variant="glass" size="lg" icon={<DoorOpen className="size-5" />} onClick={() => nav('/join')}>
              {t('join_room')}
            </Button>
          </motion.div>
          {rooms.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 max-w-md mx-auto text-start">
              <p className="text-sm text-mist mb-2">غرفي</p>
              <div className="grid gap-2">
                {rooms.map((r) => (
                  <Link key={r.code} to={`/room/${r.code}`} className="flex items-center gap-3 rounded-2xl glass px-4 h-14 hover:bg-white/10">
                    <RotateCcw className="size-4 text-champagne" />
                    <span className="code-font font-semibold">{r.code}</span>
                    <span className="flex-1 text-xs text-mist">{new Date(r.created_at).toLocaleDateString('ar-SA-u-nu-latn')}</span>
                    <ArrowLeft className="size-4" />
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
          {!isConfigured && (
            <p className="mt-5 mx-auto max-w-md rounded-2xl bg-rose-500/10 border border-rose-400/30 px-4 py-3 text-sm text-rose-200">{t('err_config')}</p>
          )}
        </section>

        {/* كيف تعمل */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-12" aria-label="طريقة الاستخدام">
          {[
            { icon: <Plus className="size-5" />, title: '١. أنشئ غرفة', text: 'اكتب اسمًا مستعارًا واحصل على رمز من 6 خانات.' },
            { icon: <Heart className="size-5" />, title: '٢. ادعُ شريكك', text: 'أرسل الرمز أو رابط الدعوة؛ يدخل من أي جهاز وأي شبكة.' },
            { icon: <Mic className="size-5" />, title: '٣. العبوا وتكلموا', text: 'ألعاب متزامنة، شات فوري، ومكالمة صوتية داخل الغرفة.' },
          ].map((s) => (
            <div key={s.title} className="glass rounded-2xl p-4 flex gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-iris-500/20 text-iris-300">{s.icon}</div>
              <div>
                <p className="font-display font-semibold">{s.title}</p>
                <p className="text-sm text-mist mt-0.5 leading-relaxed">{s.text}</p>
              </div>
            </div>
          ))}
        </section>

        {/* المميزة */}
        <section className="mb-12">
          <SectionTitle title="الألعاب المميزة" />
          <div className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory -mx-4 px-4 pb-2">
            {featured.map((g) => (
              <button
                key={g.id}
                onClick={() => setPreview(g)}
                className="snap-start shrink-0 w-[78%] sm:w-[300px] relative overflow-hidden rounded-[1.75rem] p-5 text-start min-h-44"
                style={{ background: `linear-gradient(145deg, ${g.accent[0]}cc, ${g.accent[1]}99)` }}
              >
                <span className="absolute -bottom-6 -start-4 text-[7rem] opacity-25 select-none" aria-hidden>
                  {g.emoji}
                </span>
                <span className="relative text-4xl">{g.emoji}</span>
                <h3 className="relative mt-3 font-display text-xl font-semibold text-white">{g.title}</h3>
                <p className="relative mt-1 text-sm text-white/85 leading-snug">{g.tagline}</p>
              </button>
            ))}
          </div>
        </section>

        {/* جديدة ومقترحة */}
        <section className="mb-12">
          <SectionTitle title="جديدة ومقترحة لكم" />
          <div className="grid gap-3 sm:grid-cols-3">
            {fresh.map((g) => (
              <GameCard key={g.id} g={g} compact onClick={() => setPreview(g)} />
            ))}
          </div>
        </section>

        {/* كل الألعاب */}
        <section className="mb-12" id="games">
          <SectionTitle title="كل الألعاب" sub={`${games.length} لعبة جاهزة للعب`} />
          <label className="relative block mb-3">
            <Search className="absolute top-1/2 -translate-y-1/2 start-4 size-5 text-mist" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث عن لعبة…"
              className="w-full h-12 rounded-2xl glass ps-12 pe-4 placeholder:text-mist/70 focus:outline-none focus:ring-2 focus:ring-iris-400/50"
              aria-label="ابحث عن لعبة"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-3 -mx-1 px-1">
            {[{ id: 'all' as const, label: 'الكل', emoji: '✨' }, ...categories].map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`shrink-0 rounded-full px-3.5 h-9 text-sm transition-colors ${cat === c.id ? 'btn-primary text-white' : 'glass hover:bg-white/10'}`}
                aria-pressed={cat === c.id}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          {filtered.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((g) => (
                <GameCard key={g.id} g={g} onClick={() => setPreview(g)} />
              ))}
            </div>
          ) : (
            <p className="text-center text-mist py-10">ما لقينا لعبة بهذا الاسم.</p>
          )}
        </section>

        <section className="mb-10 grid gap-3 sm:grid-cols-2">
          <div className="glass rounded-2xl p-4 flex gap-3">
            <Shield className="size-5 text-emerald-300 shrink-0 mt-0.5" />
            <p className="text-sm text-mist leading-relaxed">
              الغرف خاصة: لا يراها إلا اللاعبان. لا نطلب اسمك الحقيقي أو بريدك أو رقمك، ولا نسجّل الصوت. الغرفة تبقى محفوظة، ومنشئها يقدر يحذفها مع رسائلها في أي وقت.
            </p>
          </div>
          <div className="glass rounded-2xl p-4 flex gap-3">
            <MessageCircle className="size-5 text-iris-300 shrink-0 mt-0.5" />
            <p className="text-sm text-mist leading-relaxed">ثبّت DUO على الشاشة الرئيسية: في Safari اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».</p>
          </div>
        </section>

        <footer className="pb-6 text-center text-xs text-mist/70">DUO · صُنع للعب معًا</footer>
      </div>

      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
      <GameSetupSheet
        game={preview}
        open={Boolean(preview)}
        onClose={() => setPreview(undefined)}
        canStart={false}
        disabledReason="أنشئ غرفة وادعُ شريكك، ثم ابدأ هذه اللعبة من الغرفة."
        onStart={() => {}}
        onSuggest={() => preview && nav(`/create?game=${preview.id}`)}
        suggestLabel="أنشئ غرفة بهذه اللعبة"

      />
    </div>
  )
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <h2 className="font-display text-xl sm:text-2xl font-semibold">{title}</h2>
      {sub && <span className="text-xs text-mist">{sub}</span>}
    </div>
  )
}
