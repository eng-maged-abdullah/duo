import { useState } from 'react'
import { Volume2, VolumeX, Languages, SunMoon } from 'lucide-react'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'
import { Sheet } from './ui/Sheet'
import { setSfxEnabled, sfxEnabled, sfx } from '../lib/sound'
import { t } from '../lib/i18n'

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [on, setOn] = useState(sfxEnabled())
  const [theme, setTheme] = useState<ThemePref>(getThemePref())
  return (
    <Sheet open={open} onClose={onClose} title={t('settings')}>
      <div className="space-y-3">
        <button
          onClick={() => {
            const v = !on
            setOn(v)
            setSfxEnabled(v)
            if (v) sfx('select')
          }}
          className="w-full glass rounded-2xl p-4 flex items-center gap-3 text-start"
          role="switch"
          aria-checked={on}
        >
          {on ? <Volume2 className="size-5 text-iris-300" /> : <VolumeX className="size-5 text-mist" />}
          <span className="flex-1">
            <span className="block font-medium">{t('sound_effects')}</span>
            <span className="block text-xs text-mist mt-0.5">أصوات خفيفة عند الاختيار والفوز ووصول الرسائل</span>
          </span>
          <span className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-iris-500' : 'bg-white/15'}`}>
            <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${on ? 'start-6' : 'start-1'}`} />
          </span>
        </button>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <SunMoon className="size-5 text-iris-300" />
            <span className="font-medium">المظهر</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['auto', 'تلقائي'],
              ['light', 'صباحي ☀️'],
              ['dark', 'ليلي 🌙'],
            ] as [ThemePref, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => {
                  setTheme(v)
                  setThemePref(v)
                }}
                className={`h-11 rounded-xl text-sm ${theme === v ? 'btn-primary text-white' : 'bg-white/10 hover:bg-white/15'}`}
                aria-pressed={theme === v}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-mist mt-2">«تلقائي» يتبع إعداد جهازك.</p>
        </div>
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <Languages className="size-5 text-iris-300" />
          <span className="flex-1">
            <span className="block font-medium">{t('language')}</span>
            <span className="block text-xs text-mist mt-0.5">الإنجليزية قريبًا</span>
          </span>
          <select className="rounded-xl bg-white/10 px-3 h-10" value="ar" onChange={() => {}} aria-label={t('language')}>
            <option value="ar">العربية</option>
            <option value="en" disabled>
              English (قريبًا)
            </option>
          </select>
        </div>
        <p className="text-xs text-mist leading-relaxed px-1">
          الحركات تتبع إعداد «تقليل الحركة» في جهازك تلقائيًا. الميكروفون لا يعمل إلا بعد ضغطك على زر المكالمة.
        </p>
      </div>
    </Sheet>
  )
}
