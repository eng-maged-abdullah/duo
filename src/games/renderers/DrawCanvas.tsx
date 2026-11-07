import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Eraser, Trash2, Undo2 } from 'lucide-react'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { roomsApi } from '../../lib/rooms/api'
import { supabase } from '../../lib/supabase/client'
import { uuid } from '../../utils/random'
import { useToast } from '../../components/ui/Toast'

/** خط مرسوم: النقاط مضغوطة كنص (كل نقطة ٤ حروف) والإحداثيات من 0 إلى 1023 */
export type Stroke = { k: string; c: string; w: number; p: string; by?: string; clear?: boolean; undo?: boolean }

const A = '0123456789abcdefghijklmnopqrstuv'
const enc = (n: number) => A[(n >> 5) & 31] + A[n & 31]
const dec = (s: string, i: number) => A.indexOf(s[i]) * 32 + A.indexOf(s[i + 1])
export function decodePoints(p: string): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i + 3 < p.length; i += 4) out.push([dec(p, i), dec(p, i + 2)])
  return out
}
export function encodePoint(x: number, y: number) {
  return enc(Math.max(0, Math.min(1023, Math.round(x)))) + enc(Math.max(0, Math.min(1023, Math.round(y))))
}

export const PAPER = '#fbfcfd'
export const PALETTE = ['#1d1228', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#8b5a2b', '#ffffff']
const WIDTHS = [4, 9, 18]
const MAX_POINTS = 500

/** تطبيق المسح والتراجع للحصول على الخطوط الظاهرة */
export function visibleStrokes(all: Stroke[]): Stroke[] {
  let out: Stroke[] = []
  for (const s of all) {
    if (s.clear) out = []
    else if (s.undo) {
      for (let i = out.length - 1; i >= 0; i--)
        if (out[i].by === s.by) {
          out.splice(i, 1)
          break
        }
    } else out.push(s)
  }
  return out
}

export function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], size: number) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, size, size)
  const f = size / 1024
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    const pts = decodePoints(s.p)
    if (!pts.length) continue
    ctx.strokeStyle = s.c
    ctx.fillStyle = s.c
    ctx.lineWidth = s.w * f * 2
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0][0] * f, pts[0][1] * f, s.w * f, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.beginPath()
    ctx.moveTo(pts[0][0] * f, pts[0][1] * f)
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * f
      const my = ((pts[i][1] + pts[i + 1][1]) / 2) * f
      ctx.quadraticCurveTo(pts[i][0] * f, pts[i][1] * f, mx, my)
    }
    const l = pts[pts.length - 1]
    ctx.lineTo(l[0] * f, l[1] * f)
    ctx.stroke()
  }
}

/** يجلب خطوط جولة من قاعدة البيانات */
async function fetchStrokes(sessionId: string, round: number, after: number) {
  try {
    const { data } = await supabase()
      .from('game_strokes')
      .select('id, player_id, stroke')
      .eq('session_id', sessionId)
      .eq('round', round)
      .gt('id', after)
      .order('id')
      .limit(1000)
    return (data ?? []) as { id: number; player_id: string; stroke: Stroke }[]
  } catch {
    return []
  }
}

export function useStrokes(sessionId: string, round: number) {
  const { onLive, myId } = useRoom()
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [live, setLive] = useState<Record<string, Stroke>>({})
  const lastId = useRef(0)
  const keys = useRef(new Set<string>())

  const add = useCallback((s: Stroke) => {
    if (keys.current.has(s.k)) return
    keys.current.add(s.k)
    setStrokes((prev) => [...prev, s])
  }, [])

  // إعادة ضبط عند تغيير الجولة
  useEffect(() => {
    lastId.current = 0
    keys.current = new Set()
    setStrokes([])
    setLive({})
  }, [sessionId, round])

  // الجلب من الخادم (أول مرة، ثم كل ثوانٍ كشبكة أمان لو ضاع بث)
  useEffect(() => {
    let alive = true
    const pull = async () => {
      const rows = await fetchStrokes(sessionId, round, lastId.current)
      if (!alive || !rows.length) return
      lastId.current = rows.at(-1)!.id
      for (const r of rows) add({ ...r.stroke, by: r.player_id })
      setLive((l) => {
        const c = { ...l }
        for (const r of rows) delete c[r.stroke.k]
        return c
      })
    }
    void pull()
    const t = setInterval(() => document.visibilityState === 'visible' && void pull(), 3500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [sessionId, round, add])

  // البث المباشر من الشريك
  useEffect(() => {
    if (!onLive) return
    return onLive((m) => {
      if (m.t !== 'draw' || m.sid !== sessionId || Number(m.r) !== round) return
      const s = m.s as Stroke
      if (!s?.k) return
      if (m.done || s.clear || s.undo) {
        add({ ...s, by: String(m.from) })
        setLive((l) => {
          const c = { ...l }
          delete c[s.k]
          return c
        })
      } else {
        setLive((l) => ({ ...l, [s.k]: { ...s, by: String(m.from), p: (l[s.k]?.p ?? '') + s.p } }))
      }
    })
  }, [onLive, sessionId, round, add])

  return { strokes, live, add, myId }
}

export function DrawCanvas({
  sessionId,
  round,
  canDraw,
  single,
  onStrokeDone,
  hideTools,
  label = 'لوحة الرسم',
}: {
  sessionId: string
  round: number
  canDraw: boolean
  /** خط واحد فقط ثم تتوقف (كمّل رسمتي) */
  single?: boolean
  onStrokeDone?: () => void
  hideTools?: boolean
  label?: string
}) {
  const { sendLive, myId } = useRoom()
  const toast = useToast()
  const { strokes, live, add } = useStrokes(sessionId, round)
  const [color, setColor] = useState(PALETTE[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [eraser, setEraser] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drawing = useRef<Stroke | null>(null)
  const pending = useRef('')
  const lastPt = useRef<[number, number] | null>(null)
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [size, setSize] = useState(320)
  const [, force] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize(Math.round(el.clientWidth)))
    ro.observe(el)
    setSize(Math.round(el.clientWidth))
    return () => ro.disconnect()
  }, [])

  const redraw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    if (cv.width !== size * dpr) {
      cv.width = size * dpr
      cv.height = size * dpr
    }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const vis = visibleStrokes(strokes)
    const extra = Object.values(live)
    paint(ctx, drawing.current ? [...vis, ...extra, drawing.current] : [...vis, ...extra], size)
  }, [strokes, live, size])

  useEffect(() => {
    redraw()
  }, [redraw])

  const flush = useCallback(
    (_done: boolean) => {
      const s = drawing.current
      if (!s) return
      if (pending.current) {
        sendLive?.({ t: 'draw', sid: sessionId, r: round, s: { ...s, p: pending.current }, done: false })
        pending.current = ''
      }
    },
    [sendLive, sessionId, round],
  )

  const commit = useCallback(
    (s: Stroke) => {
      add({ ...s, by: myId })
      sendLive?.({ t: 'draw', sid: sessionId, r: round, s, done: true })
      void roomsApi.addStroke(sessionId, round, { k: s.k, c: s.c, w: s.w, p: s.p }).then((res) => {
        if (!res.ok && res.error !== 'session_closed') toast('ما انحفظ الخط، تأكد من الإنترنت', 'error')
      })
    },
    [add, myId, round, sendLive, sessionId, toast],
  )

  const finishStroke = useCallback(() => {
    const s = drawing.current
    if (!s) return
    flush(false)
    drawing.current = null
    lastPt.current = null
    if (!s.p) return
    commit(s)
    if (single) onStrokeDone?.()
  }, [commit, flush, onStrokeDone, single])

  const toLocal = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * 1024, ((e.clientY - r.top) / r.height) * 1024] as [number, number]
  }

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const [x, y] = toLocal(e)
    const pt = encodePoint(x, y)
    drawing.current = { k: uuid().slice(0, 12), c: eraser ? PAPER : color, w: eraser ? WIDTHS[2] + 6 : width, p: pt, by: myId }
    pending.current = pt
    lastPt.current = [x, y]
    force((n) => n + 1)
    redraw()
  }
  const onMove = (e: React.PointerEvent) => {
    const s = drawing.current
    if (!s || !lastPt.current) return
    const [x, y] = toLocal(e)
    const [lx, ly] = lastPt.current
    if (Math.hypot(x - lx, y - ly) < 5) return
    const pt = encodePoint(x, y)
    s.p += pt
    pending.current += pt
    lastPt.current = [x, y]
    redraw()
    if (!sendTimer.current)
      sendTimer.current = setTimeout(() => {
        sendTimer.current = null
        flush(false)
      }, 70)
    // الخط الطويل يتقسم تلقائيًا (بدون ما يحس الرسام)
    if (s.p.length / 4 >= MAX_POINTS && !single) {
      flush(false)
      commit(s)
      drawing.current = { k: uuid().slice(0, 12), c: s.c, w: s.w, p: pt, by: myId }
      pending.current = pt
    }
  }
  const onUp = () => {
    if (sendTimer.current) {
      clearTimeout(sendTimer.current)
      sendTimer.current = null
    }
    finishStroke()
  }

  const special = async (kind: 'clear' | 'undo') => {
    const s: Stroke = { k: uuid().slice(0, 12), c: '', w: 0, p: '', [kind]: true, by: myId }
    add(s)
    sendLive?.({ t: 'draw', sid: sessionId, r: round, s, done: true })
    await roomsApi.addStroke(sessionId, round, { k: s.k, c: '', w: 0, p: '', [kind]: true })
  }

  const download = async () => {
    const cv = canvasRef.current
    if (!cv) return
    const url = cv.toDataURL('image/png')
    try {
      const blob = await (await fetch(url)).blob()
      const file = new File([blob], 'duo-drawing.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'رسمتنا في DUO' })
        return
      }
    } catch {
      /* نكمل للتحميل */
    }
    const a = document.createElement('a')
    a.href = url
    a.download = 'duo-drawing.png'
    a.click()
  }

  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/10" style={{ height: size || undefined, aspectRatio: size ? undefined : '1 / 1' }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className={`block size-full touch-none select-none ${canDraw ? 'cursor-crosshair' : ''}`}
          style={{ width: size, height: size }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={(e) => e.buttons && onUp()}
        />
        {!canDraw && !strokes.length && !Object.keys(live).length && (
          <div className="absolute inset-0 grid place-items-center text-[#626877] text-sm pointer-events-none">اللوحة فاضية…</div>
        )}
      </div>
      {canDraw && !hideTools && (
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 px-0.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c)
                  setEraser(false)
                }}
                className={`size-9 shrink-0 rounded-full border-2 transition-transform ${!eraser && color === c ? 'scale-110 border-iris-400' : 'border-black/10'}`}
                style={{ background: c }}
                aria-label={`لون ${c}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => {
                  setWidth(w)
                  setEraser(false)
                }}
                className={`size-10 grid place-items-center rounded-xl ${!eraser && width === w ? 'bg-iris-500/25 ring-1 ring-iris-400/50' : 'glass'}`}
                aria-label={`سماكة ${w}`}
              >
                <span className="rounded-full bg-cloud" style={{ width: w + 2, height: w + 2 }} />
              </button>
            ))}
            <button onClick={() => setEraser((v) => !v)} className={`size-10 grid place-items-center rounded-xl ${eraser ? 'bg-iris-500/25 ring-1 ring-iris-400/50' : 'glass'}`} aria-label="ممحاة">
              <Eraser className="size-5" />
            </button>
            {!single && (
              <>
                <div className="flex-1" />
                <button onClick={() => void special('undo')} className="size-10 grid place-items-center rounded-xl glass" aria-label="تراجع">
                  <Undo2 className="size-5" />
                </button>
                <button
                  onClick={() => window.confirm('تمسح الرسمة كلها؟') && void special('clear')}
                  className="size-10 grid place-items-center rounded-xl glass text-rose-300"
                  aria-label="مسح الكل"
                >
                  <Trash2 className="size-5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {!canDraw && strokes.length > 0 && (
        <button onClick={() => void download()} className="mt-2 inline-flex items-center gap-1.5 text-xs text-mist hover:text-cloud">
          <Download className="size-3.5" /> احفظ الرسمة في جوالك
        </button>
      )}
    </div>
  )
}

/** معاينة رسمة جولة (للنتائج) */
export function DrawingPreview({ sessionId, round, size = 260 }: { sessionId: string; round: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  useEffect(() => {
    let alive = true
    fetchStrokes(sessionId, round, 0).then((rows) => alive && setStrokes(rows.map((r) => ({ ...r.stroke, by: r.player_id }))))
    return () => {
      alive = false
    }
  }, [sessionId, round])
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    cv.width = size * dpr
    cv.height = size * dpr
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paint(ctx, visibleStrokes(strokes), size)
  }, [strokes, size])
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-2xl shadow-lg ring-1 ring-black/10 mx-auto block" aria-label="الرسمة" />
}
