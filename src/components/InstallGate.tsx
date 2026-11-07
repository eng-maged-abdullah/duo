import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Download, MoreVertical, PlusSquare, Share } from 'lucide-react'
import { Logo } from './ui/Logo'
import { Button } from './ui/Button'
import { canPromptInstall, inAppBrowser, iosBrowser, onInstallChange, platform, promptInstall, wasInstalled, type Platform } from '../lib/pwa'

/** رمز الغرفة من رابط الدعوة (عشان ما يضيع بعد التثبيت) */
function codeFromLink() {
  const m = window.location.hash.match(/\/(?:join|room)\/([A-Za-z0-9]{4,8})/)
  return m ? m[1].toUpperCase() : null
}

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-[150px] h-[250px] rounded-[26px] border border-white/15 bg-night-800 p-2 shadow-xl" aria-hidden>
      <div className="relative h-full overflow-hidden rounded-[18px] bg-night-900 text-[11px] text-cloud">{children}</div>
    </div>
  )
}
const Hl = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`relative inline-flex items-center gap-1 rounded-md outline outline-2 outline-offset-2 outline-iris-400 ${className}`}>
    {children}
    <motion.span className="absolute -inset-2 rounded-lg border-2 border-iris-400" animate={{ opacity: [0.8, 0, 0.8], scale: [1, 1.15, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
  </span>
)
function Step({ n, text, children }: { n: number; text: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      {children}
      <p className="mt-2.5 text-center text-[13px] leading-relaxed">
        <span className="me-1 inline-grid size-5 place-items-center rounded-full bg-iris-400 text-[11px] font-bold text-[#000100]">{n}</span>
        {text}
      </p>
    </div>
  )
}
const Row = ({ children, hl }: { children: ReactNode; hl?: boolean }) => (
  <div className={`flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5 ${hl ? 'font-semibold text-iris-300' : ''}`}>{hl ? <Hl>{children}</Hl> : children}</div>
)
const AppIcon = ({ hl }: { hl?: boolean }) => {
  const icon = <img src="icons/icon-192.png" alt="" className="size-8 rounded-lg" />
  return hl ? <Hl className="rounded-lg">{icon}</Hl> : icon
}

function IosSteps() {
  const chrome = iosBrowser() === 'chrome'
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5">
      <Step n={1} text={chrome ? 'اضغط زر المشاركة فوق جنب الرابط' : 'اضغط زر المشاركة تحت'}>
        <Phone>
          {chrome && (
            <div className="flex h-6 items-center justify-between border-b border-white/10 px-2 text-mist">
              <span>duo.app</span>
              <Hl>
                <Share className="size-3.5 text-cloud" />
              </Hl>
            </div>
          )}
          <div className="p-3 text-center">
            <p className="font-semibold">ثبّت DUO</p>
          </div>
          {!chrome && (
            <div className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-around border-t border-white/10 text-mist">
              <span>‹</span>
              <Hl>
                <Share className="size-4 text-cloud" />
              </Hl>
              <span>▢</span>
              <span>⧉</span>
            </div>
          )}
        </Phone>
      </Step>
      <Step n={2} text="انزل شوي واختر «إضافة إلى الشاشة الرئيسية»">
        <Phone>
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-white/10 bg-night-800">
            <Row>نسخ</Row>
            <Row>إضافة إلى المفضلة</Row>
            <Row hl>
              <PlusSquare className="size-3.5" /> إضافة إلى الشاشة الرئيسية
            </Row>
            <Row>طباعة</Row>
          </div>
        </Phone>
      </Step>
      <Step n={3} text="اضغط «إضافة» فوق">
        <Phone>
          <div className="flex h-6 items-center justify-between border-b border-white/10 px-2">
            <span className="text-mist">إلغاء</span>
            <Hl className="px-1 font-semibold text-iris-300">إضافة</Hl>
          </div>
          <div className="flex items-center gap-2 p-3">
            <AppIcon />
            <span>DUO</span>
          </div>
        </Phone>
      </Step>
      <Step n={4} text="افتح DUO من أيقونته في الشاشة الرئيسية">
        <Phone>
          <div className="grid grid-cols-3 gap-3 p-3">
            <span className="size-8 rounded-lg bg-white/10" />
            <span className="size-8 rounded-lg bg-white/10" />
            <AppIcon hl />
            <span className="size-8 rounded-lg bg-white/10" />
          </div>
        </Phone>
      </Step>
    </div>
  )
}

function AndroidSteps() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5">
      <Step n={1} text="اضغط ⋮ فوق في Chrome">
        <Phone>
          <div className="flex h-6 items-center justify-between border-b border-white/10 px-2 text-mist">
            <span>duo.app</span>
            <Hl>
              <MoreVertical className="size-3.5 text-cloud" />
            </Hl>
          </div>
          <div className="p-3 text-center">
            <p className="font-semibold">ثبّت DUO</p>
          </div>
        </Phone>
      </Step>
      <Step n={2} text="اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»">
        <Phone>
          <div className="absolute end-1 top-6 w-[115px] rounded-lg border border-white/10 bg-night-800">
            <Row>علامة تبويب جديدة</Row>
            <Row>السجل</Row>
            <Row hl>
              <Download className="size-3.5" /> تثبيت التطبيق
            </Row>
            <Row>الإعدادات</Row>
          </div>
        </Phone>
      </Step>
      <Step n={3} text="اضغط «تثبيت»">
        <Phone>
          <div className="absolute inset-x-2 top-16 rounded-xl border border-white/10 bg-night-800 p-2.5">
            <p className="mb-2 font-semibold">تثبيت التطبيق؟</p>
            <div className="mb-2 flex items-center gap-2">
              <AppIcon />
              <span>DUO</span>
            </div>
            <div className="flex justify-end gap-3">
              <span className="text-mist">إلغاء</span>
              <Hl className="px-1 font-semibold text-iris-300">تثبيت</Hl>
            </div>
          </div>
        </Phone>
      </Step>
      <Step n={4} text="افتح DUO من أيقونته">
        <Phone>
          <div className="grid grid-cols-3 gap-3 p-3">
            <span className="size-8 rounded-full bg-white/10" />
            <AppIcon hl />
            <span className="size-8 rounded-full bg-white/10" />
          </div>
        </Phone>
      </Step>
    </div>
  )
}

export function InstallGate() {
  const plat = platform()
  const [show, setShow] = useState<Platform>(plat === 'desktop' ? 'ios' : plat)
  const [canPrompt, setCanPrompt] = useState(canPromptInstall())
  const [installed, setInstalled] = useState(wasInstalled())
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const code = codeFromLink()
  const inApp = inAppBrowser()
  useEffect(
    () =>
      onInstallChange(() => {
        setCanPrompt(canPromptInstall())
        setInstalled(wasInstalled())
      }),
    [],
  )
  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? (code ?? '') : window.location.href)
      setCopied(what)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* */
    }
  }

  return (
    <main className="min-h-dvh px-safe pt-safe pb-safe">
      <div className="mx-auto max-w-md py-6">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        <h1 className="text-center font-display text-2xl font-semibold">ثبّت DUO على جوالك 📲</h1>
        <p className="mt-2 text-center text-mist leading-relaxed">DUO يشتغل كتطبيق. ثبّته مرة وحدة (ما ياخذ مساحة)، وبعدها افتحه من أيقونته في الشاشة الرئيسية.</p>

        {code && (
          <div className="mt-5 glass rounded-3xl p-4 text-center">
            <p className="text-sm text-mist">رمز الغرفة اللي انعزمت عليها</p>
            <p className="code-font font-display text-3xl my-1">{code}</p>
            <p className="text-[13px] text-mist leading-relaxed">بعد التثبيت افتح DUO، واضغط «انضم إلى غرفة»، واكتب هذا الرمز.</p>
            <Button variant="glass" size="sm" className="mt-2" icon={copied === 'code' ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => void copy('code')}>
              {copied === 'code' ? 'انتسخ ✓' : 'انسخ الرمز'}
            </Button>
          </div>
        )}

        {inApp && (
          <div className="mt-5 rounded-3xl border border-champagne/30 bg-champagne/10 p-4 text-center">
            <p className="font-medium">أنت فاتح الرابط من داخل تطبيق ثاني</p>
            <p className="text-[13px] text-mist mt-1 leading-relaxed">
              اضغط ⋯ واختر «فتح في المتصفح» ({plat === 'ios' ? 'Safari' : 'Chrome'})، أو انسخ الرابط والصقه في المتصفح.
            </p>
            <Button variant="glass" size="sm" className="mt-2" icon={copied === 'link' ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => void copy('link')}>
              {copied === 'link' ? 'انتسخ ✓' : 'انسخ الرابط'}
            </Button>
          </div>
        )}

        {plat === 'android' && installed && (
          <div className="mt-5 rounded-3xl bg-emerald-500/15 border border-emerald-400/30 p-4 text-center">
            <p className="font-medium">تم التثبيت ✅</p>
            <p className="text-sm text-mist mt-1">افتح DUO من الشاشة الرئيسية.</p>
          </div>
        )}
        {plat === 'android' && canPrompt && !installed && (
          <Button
            variant="primary"
            size="lg"
            block
            className="mt-5"
            icon={<Download className="size-5" />}
            onClick={async () => {
              const r = await promptInstall()
              if (r === 'accepted') setInstalled(true)
            }}
          >
            تثبيت التطبيق
          </Button>
        )}

        <div className="mt-6 glass rounded-3xl p-4">
          <p className="mb-4 text-center font-semibold">
            {plat === 'android' && canPrompt ? 'ما ضبط الزر؟ سوّها يدوي:' : 'الطريقة'} {show === 'ios' ? '(آيفون)' : '(أندرويد)'}
          </p>
          {show === 'ios' ? <IosSteps /> : <AndroidSteps />}
        </div>

        <button onClick={() => setShow((s) => (s === 'ios' ? 'android' : 'ios'))} className="mx-auto mt-4 block text-sm text-mist underline underline-offset-4">
          {show === 'ios' ? 'جوالك أندرويد؟ شوف طريقته' : 'جوالك آيفون؟ شوف طريقته'}
        </button>
      </div>
    </main>
  )
}
