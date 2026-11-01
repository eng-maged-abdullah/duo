import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, DoorOpen, Plus } from 'lucide-react'
import { Logo } from '../components/ui/Logo'
import { Button } from '../components/ui/Button'
import { GameCard } from '../components/games/GameCard'
import { games, gameById } from '../games/registry'
import { normalizeCode, roomsApi } from '../lib/rooms/api'
import { local } from '../lib/rooms/storage'
import { errorText, t } from '../lib/i18n'
import { isConfigured } from '../lib/supabase/client'
import { lastAuthError } from '../lib/supabase/session'

const withDetail = (code: string) =>
  errorText(code) + (['no_session', 'bad_url', 'bad_key', 'network'].includes(code) && lastAuthError ? ` (${lastAuthError})` : '')

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh px-safe pt-safe pb-safe">
      <div className="mx-auto max-w-lg">
        <header className="flex items-center justify-between py-3">
          <Link to="/" className="flex items-center gap-1.5 text-mist hover:text-white h-11 px-2 -ms-2 rounded-xl" aria-label={t('back')}>
            <ArrowRight className="size-5" />
            {t('back')}
          </Link>
          <Logo size="sm" />
        </header>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-6">
          <h1 className="font-display text-2xl font-semibold mb-6">{title}</h1>
          {children}
        </motion.div>
      </div>
    </div>
  )
}

function NicknameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block mb-5">
      <span className="text-sm font-medium">{t('nickname')}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 20))}
        maxLength={20}
        autoComplete="nickname"
        placeholder="مثال: نجمة"
        className="mt-2 w-full h-14 rounded-2xl glass px-4 text-lg focus:outline-none focus:ring-2 focus:ring-iris-400/50"
      />
      <span className="mt-1.5 block text-xs text-mist">{t('nickname_hint')}</span>
    </label>
  )
}

export function CreatePage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [nick, setNick] = useState(local.nickname())
  const [game, setGame] = useState<string | null>(gameById(params.get('game'))?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    if (busy) return
    const n = nick.trim()
    if (!n) return setError(errorText('bad_nickname'))
    setBusy(true)
    setError('')
    local.setNickname(n)
    const res = await roomsApi.create(n, game)
    setBusy(false)
    if (!res.ok) return setError(withDetail(res.error))
    local.setLastRoom(res.code)
    nav(`/room/${res.code}`, { replace: true })
  }

  return (
    <Shell title={t('create_room')}>
      <NicknameField value={nick} onChange={setNick} />
      <p className="text-sm font-medium mb-2">اختر لعبة البداية (اختياري)</p>
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 max-h-[42dvh] overflow-y-auto pe-1 mb-5 overscroll-contain">
        {games.map((g) => (
          <GameCard key={g.id} g={g} compact selected={game === g.id} onClick={() => setGame(game === g.id ? null : g.id)} />
        ))}
      </div>
      {error && <p className="mb-4 rounded-2xl bg-rose-500/10 border border-rose-400/30 px-4 py-3 text-sm text-rose-200" role="alert">{error}</p>}
      <Button variant="primary" size="lg" block loading={busy} disabled={!isConfigured} onClick={() => void create()} icon={<Plus className="size-5" />}>
        {t('create_room')}
      </Button>
      <p className="mt-4 text-center text-xs text-mist">الغرفة تتسع لشخصين، وتبقى محفوظة حتى تحذفها أنت.</p>
    </Shell>
  )
}

export function JoinPage() {
  const nav = useNavigate()
  const { code: pre = '' } = useParams()
  const loc = useLocation() as { state?: { notice?: string } }
  const [code, setCode] = useState(normalizeCode(pre))
  const [nick, setNick] = useState(local.nickname())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const join = async () => {
    if (busy) return
    const n = nick.trim()
    if (code.length !== 6) return setError('رمز الغرفة مكون من 6 خانات (حروف إنجليزية وأرقام).')
    if (!n) return setError(errorText('bad_nickname'))
    setBusy(true)
    setError('')
    local.setNickname(n)
    const res = await roomsApi.join(code, n)
    setBusy(false)
    if (!res.ok) return setError(withDetail(res.error))
    local.setLastRoom(res.code)
    nav(`/room/${res.code}`, { replace: true })
  }

  return (
    <Shell title={t('join_room')}>
      {loc.state?.notice && <p className="mb-5 rounded-2xl glass px-4 py-3 text-sm">{loc.state.notice}</p>}
      <label className="block mb-5">
        <span className="text-sm font-medium">{t('room_code')}</span>
        <input
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABC234"
          className="code-font mt-2 w-full h-16 rounded-2xl glass px-4 text-center text-3xl font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-iris-400/50"
          aria-describedby="code-hint"
        />
        <span id="code-hint" className="mt-1.5 block text-xs text-mist">
          6 خانات — اطلبها من الشخص اللي أنشأ الغرفة
        </span>
      </label>
      <NicknameField value={nick} onChange={setNick} />
      {error && <p className="mb-4 rounded-2xl bg-rose-500/10 border border-rose-400/30 px-4 py-3 text-sm text-rose-200" role="alert">{error}</p>}
      <Button variant="primary" size="lg" block loading={busy} disabled={!isConfigured} onClick={() => void join()} icon={<DoorOpen className="size-5" />}>
        {t('join_room')}
      </Button>
    </Shell>
  )
}
