import { useCallback, useEffect, useRef, useState } from 'react'
import { roomsApi } from '../../lib/rooms/api'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { useToast } from '../../components/ui/Toast'
import { errorText } from '../../lib/i18n'

/** واجهة موحّدة لإرسال الإجابات والحركات، تمنع الإرسال المكرر وتعرض الأخطاء بالعربية */
export function useGameApi() {
  const { session, moves, refreshGame } = useRoom()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const inflight = useRef(false)
  // آخر رقم حركة نعرفه — يتحدث فورًا بعد أي عملية ناجحة قبل وصول التحديث
  const seqRef = useRef(0)
  const sessRef = useRef<string | undefined>(undefined)
  const latest = moves.at(-1)?.seq ?? 0
  if (sessRef.current !== session?.id) {
    sessRef.current = session?.id
    seqRef.current = latest
  } else if (latest > seqRef.current) seqRef.current = latest

  const run = useCallback(
    async <T,>(fn: () => Promise<{ ok: boolean; error?: string } & T>, quietErrors: string[] = []) => {
      if (inflight.current) return null
      inflight.current = true
      setBusy(true)
      try {
        const res = await fn()
        if (!res.ok) {
          const code = (res as { error?: string }).error
          // اللعبة انتهت من جهة الشريك (مثلاً ضغطتوا «عرض النتيجة» سوا): الواجهة بتتحدث بروحها
          if (!quietErrors.includes(code ?? '') && code !== 'session_closed') toast(errorText(code), 'error')
          if (code === 'stale' || code === 'round_closed' || code === 'not_your_turn' || code === 'session_closed') void refreshGame()
          return null
        }
        const seq = (res as { seq?: unknown }).seq
        if (typeof seq === 'number' && seq > seqRef.current) seqRef.current = seq
        void refreshGame()
        return res
      } finally {
        inflight.current = false
        setBusy(false)
      }
    },
    [toast, refreshGame],
  )

  const sid = session?.id ?? ''
  return {
    busy,
    answer: (round: number, answer: Record<string, unknown>) => run(() => roomsApi.submitAnswer(sid, round, answer)),
    next: (round: number) => run(() => roomsApi.nextRound(sid, round), ['not_ready', 'round_closed']),
    expire: (round: number) => roomsApi.expireRound(sid, round).then(() => refreshGame()),
    judge: (round: number, target: string, correct: boolean) => run(() => roomsApi.judge(sid, round, target, correct)),
    move: (move: Record<string, unknown>, quiet: string[] = []) => run(() => roomsApi.move(sid, seqRef.current + 1, move), quiet),
    secret: (action: string, slot: string, value: unknown = null, quiet: string[] = []) =>
      run(() => roomsApi.secret(sid, action, slot, value), quiet) as Promise<null | { ok: true; seq?: number; correct?: boolean; duplicate?: boolean; value?: unknown }>,
    rate: (round: number, target: string, score: number) => run(() => roomsApi.rate(sid, round, target, score)),
    end: () => run(() => roomsApi.endSession(sid)),
  }
}

/** عدّاد تنازلي مضبوط على وقت الخادم */
export function useCountdown(deadline: string | null | undefined, serverNow: () => number, onZero?: () => void) {
  const [left, setLeft] = useState<number | null>(null)
  const fired = useRef<string | null>(null)
  const cb = useRef(onZero)
  cb.current = onZero
  useEffect(() => {
    if (!deadline) {
      setLeft(null)
      return
    }
    const end = new Date(deadline).getTime()
    const tick = () => {
      const ms = Math.max(0, end - serverNow())
      setLeft(ms)
      if (ms <= 0 && fired.current !== deadline) {
        fired.current = deadline
        // تأخير بسيط حتى يسبقنا الخادم إلى الموعد
        setTimeout(() => cb.current?.(), 400)
      }
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [deadline, serverNow])
  return left
}

/** أسراري في اللعبة الحالية (كلمتي، نردي، نصف الألغاز…) + الأسرار المكشوفة */
export function useSecrets() {
  const { session, moves } = useRoom()
  const [secrets, setSecrets] = useState<Record<string, { v: unknown; mine: boolean; revealed: boolean }>>({})
  const sid = session?.id
  const key = `${sid}:${moves.length}:${session?.version ?? 0}`
  useEffect(() => {
    if (!sid) return
    let alive = true
    roomsApi.secrets(sid).then((r) => {
      if (alive && r.ok) setSecrets(r.secrets ?? {})
    })
    return () => {
      alive = false
    }
  }, [sid, key])
  return secrets
}

/** مؤقت يبدأ من وقت حركة معيّنة على الخادم */
export function useMoveTimer(startIso: string | null | undefined, seconds: number, onZero?: () => void) {
  const { serverNow } = useRoom()
  const deadline = startIso ? new Date(new Date(startIso).getTime() + seconds * 1000).toISOString() : null
  return useCountdown(deadline, serverNow, onZero)
}
