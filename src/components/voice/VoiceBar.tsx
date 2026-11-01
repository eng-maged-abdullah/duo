import { useState } from 'react'
import { Mic, MicOff, PhoneOff, Volume2, VolumeX, Phone } from 'lucide-react'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import type { VoiceError, VoiceState } from '../../lib/webrtc/VoiceCall'
import { hasTurn } from '../../lib/webrtc/iceServers'
import { local } from '../../lib/rooms/storage'

const errorMsg: Record<Exclude<VoiceError, null>, string> = {
  denied: 'رُفض إذن الميكروفون. فعّله من إعدادات المتصفح ثم حاول مجددًا. الشات والألعاب تعمل بدونه.',
  no_mic: 'لم نجد ميكروفونًا في هذا الجهاز.',
  unsupported: 'هذا المتصفح لا يدعم المكالمات الصوتية. جرّب Safari أو Chrome حديث.',
  insecure: 'المكالمات تحتاج رابطًا آمنًا (https).',
  busy: 'الميكروفون مستخدم في تطبيق آخر. أغلقه ثم حاول.',
  failed: hasTurn()
    ? 'تعذّر الاتصال الصوتي. تحقق من الإنترنت وحاول مرة أخرى.'
    : 'تعذّر الاتصال الصوتي، وغالبًا السبب أن إحدى الشبكتين تمنع الاتصال المباشر. يحتاج هذا إلى إعداد خادم TURN.',
}

function statusText(v: VoiceState | null, partnerName: string) {
  if (!v) return 'المكالمة غير جاهزة'
  if (v.endedByPartner && v.status === 'idle') return `${partnerName} أنهى المكالمة`
  switch (v.status) {
    case 'idle':
      return 'المكالمة متوقفة'
    case 'requesting':
      return 'بانتظار إذن الميكروفون…'
    case 'connecting':
      return v.micOn && !v.remoteAudio ? `بانتظار ${partnerName}…` : 'جارٍ الاتصال…'
    case 'connected':
      return v.micOn ? (v.muted ? 'متصل · ميكروفونك مكتوم' : 'متصل · ميكروفونك يعمل') : `متصل · تسمع ${partnerName} (ميكروفونك مغلق)`
    case 'reconnecting':
      return 'انقطع الصوت، نحاول إعادة الاتصال…'
    case 'failed':
      return 'فشل الاتصال الصوتي'
  }
}

/** شريط الصوت: يظهر في كل شاشات الغرفة ويبقى أثناء تغيير الألعاب */
export function VoiceBar({ compact }: { compact?: boolean }) {
  const { voice, voiceState: v, me, partner, online } = useRoom()
  const [explain, setExplain] = useState(false)
  const partnerName = partner?.nickname ?? 'شريكك'
  const inCall = Boolean(v && (v.micOn || v.status !== 'idle'))

  const startMic = () => {
    if (local.get('duo:micExplained') === '1') return void voice?.startMic()
    setExplain(true)
  }

  return (
    <div className={`glass rounded-2xl ${compact ? 'p-2' : 'p-3'} flex items-center gap-2.5`}>
      <div className="flex -space-x-2 rtl:space-x-reverse shrink-0" dir="ltr">
        {me && <Avatar name={me.nickname} seat={me.seat} size={34} speaking={Boolean(v?.localSpeaking && !v.muted)} />}
        {partner && <Avatar name={partner.nickname} seat={partner.seat} size={34} online={online.has(partner.user_id)} speaking={Boolean(v?.remoteSpeaking && !v.remoteMuted)} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm truncate" aria-live="polite">
          {statusText(v, partnerName)}
        </p>
        {v?.error && <p className="text-[11px] text-rose-300 leading-snug mt-0.5">{errorMsg[v.error]}</p>}
        {v?.needsTap && (
          <button onClick={() => void voice?.tapToPlay()} className="text-[11px] text-champagne underline mt-0.5">
            اضغط هنا لتشغيل صوت {partnerName}
          </button>
        )}
      </div>

      {!v?.micOn ? (
        <button
          onClick={startMic}
          disabled={!partner}
          className="h-10 shrink-0 rounded-xl px-3 flex items-center gap-1.5 text-sm btn-primary text-white disabled:opacity-40"
          aria-label="تشغيل الميكروفون"
        >
          {inCall ? <Mic className="size-4" /> : <Phone className="size-4" />}
          <span className="hidden sm:inline">{inCall ? 'شغّل مايكي' : 'ابدأ مكالمة'}</span>
        </button>
      ) : (
        <button
          onClick={() => voice?.setMuted(!v.muted)}
          className={`size-10 shrink-0 rounded-xl grid place-items-center ${v.muted ? 'bg-rose-500/25 text-rose-200' : 'bg-white/10'}`}
          aria-label={v.muted ? 'إلغاء كتم الميكروفون' : 'كتم الميكروفون'}
          aria-pressed={v.muted}
        >
          {v.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </button>
      )}
      {inCall && (
        <>
          <button
            onClick={() => voice?.setRemoteMuted(!v!.remoteMuted)}
            className={`size-10 shrink-0 rounded-xl grid place-items-center ${v!.remoteMuted ? 'bg-rose-500/25 text-rose-200' : 'bg-white/10'}`}
            aria-label={v!.remoteMuted ? `تشغيل صوت ${partnerName}` : `كتم صوت ${partnerName} عندي`}
            aria-pressed={v!.remoteMuted}
          >
            {v!.remoteMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <button onClick={() => voice?.hangup()} className="size-10 shrink-0 rounded-xl grid place-items-center bg-rose-500/80 text-white" aria-label="إنهاء المكالمة">
            <PhoneOff className="size-5" />
          </button>
        </>
      )}

      <Sheet open={explain} onClose={() => setExplain(false)} title="إذن الميكروفون">
        <div className="space-y-3 text-[15px] leading-relaxed">
          <p>عشان تتكلم مع {partnerName} صوتيًا، المتصفح بيطلب إذن استخدام الميكروفون.</p>
          <ul className="space-y-1.5 text-mist text-sm">
            <li>• الصوت يُنقل مباشرة بينكما ولا يُسجّل ولا يُحفظ.</li>
            <li>• الميكروفون يتوقف تمامًا عند إنهاء المكالمة أو مغادرة الغرفة.</li>
            <li>• إذا رفضت، يبقى الشات والألعاب شغالة عادي.</li>
          </ul>
        </div>
        <Button
          variant="primary"
          size="lg"
          block
          className="mt-5"
          icon={<Mic className="size-5" />}
          onClick={() => {
            local.set('duo:micExplained', '1')
            setExplain(false)
            void voice?.startMic()
          }}
        >
          تمام، اطلب الإذن
        </Button>
      </Sheet>
    </div>
  )
}
