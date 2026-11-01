import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, Mic, SkipForward, X } from 'lucide-react'
import type { ChoiceItem, GameDef, RoundItem, TextItem } from '../types'
import type { Answer } from '../../types/db'
import { useRoom } from '../../lib/rooms/RoomProvider'
import { GameShell, PromptCard, WaitingCard } from '../engine/GameShell'
import { useCountdown, useGameApi } from '../engine/useGameApi'
import { nameOf, rankSimilarity, subjectOf } from '../engine/helpers'
import { Button } from '../../components/ui/Button'
import { sfx, vibrate } from '../../lib/sound'

/** المحرك الموحد لألعاب الجولات المتزامنة (الإجابات مخفية حتى يجاوب الاثنان) */
export function PairGame({ def }: { def: GameDef }) {
  const { session, answers, myId, partner, players, serverNow } = useRoom()
  const api = useGameApi()
  const s = session!
  const round = s.round
  const items = (s.content?.items ?? []) as RoundItem[]
  const item = items[round - 1]
  const partnerId = partner?.user_id ?? ''
  const mine = answers.find((a) => a.round === round && a.player_id === myId)
  const theirs = answers.find((a) => a.round === round && a.player_id === partnerId)
  const revealed = s.phase === 'revealed'
  const subject = (item as ChoiceItem | TextItem).guess ? subjectOf(round, players) : undefined
  const partnerAnswered = s.answered.includes(partnerId)

  const left = useCountdown(s.round_deadline, serverNow, () => {
    if (!revealed) void api.expire(round)
  })

  const revealKey = `${s.id}:${round}:${revealed}`
  const lastReveal = useRef('')
  useEffect(() => {
    if (!revealed || lastReveal.current === revealKey) return
    lastReveal.current = revealKey
    if (!mine || !theirs) return
    if (item.type === 'choice' && item.correct !== undefined) sfx(mine.answer.choice === item.correct ? 'match' : 'wrong')
    else if (JSON.stringify(mine.answer.choice ?? mine.answer.who) === JSON.stringify(theirs.answer.choice ?? theirs.answer.who) && (mine.answer.choice !== undefined || mine.answer.who)) sfx('match')
    else sfx('flip')
  }, [revealed, revealKey, mine, theirs, item])

  if (!item) return null
  const last = round >= s.rounds_total

  return (
    <GameShell
      def={def}
      progress={`الجولة ${round} من ${s.rounds_total}${subject ? ` · السؤال عن ${subject === myId ? 'نفسك' : nameOf(subject, players)}` : ''}`}
      timeLeft={!revealed ? left : null}
      totalSeconds={s.round_seconds}
      onEnd={() => void api.end()}
    >
      <PromptCard tag={(item as TextItem).tag} big={(item as ChoiceItem).big}>
        {promptText(item, subject, myId, players, round, def)}
      </PromptCard>

      <AnimatePresence mode="wait">
        {!revealed && !mine && (
          <motion.div key="answer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AnswerInput item={item} busy={api.busy} myId={myId} partnerId={partnerId} partnerName={partner?.nickname ?? ''} onSubmit={(a) => void api.answer(round, a)} />
            {partnerAnswered && <p className="mt-4 text-center text-sm text-emerald-300">✓ {partner?.nickname} جاوب، دورك!</p>}
          </motion.div>
        )}
        {!revealed && mine && (
          <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WaitingCard text={`بانتظار ${partner?.nickname ?? 'شريكك'}…`} sub="إجابتك محفوظة ومخفية حتى يجاوب" />
          </motion.div>
        )}
        {revealed && (
          <motion.div key="reveal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Reveal item={item} round={round} mine={mine} theirs={theirs} answers={answers} myId={myId} partnerId={partnerId} subject={subject} />
            <NextButton item={item} mine={mine} theirs={theirs} subject={subject} myId={myId} last={last} busy={api.busy} onNext={() => void api.next(round)} />
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  )
}

function promptText(item: RoundItem, subject: string | undefined, myId: string, players: { user_id: string; nickname: string; seat: 1 | 2 }[], _round: number, _def: GameDef) {
  if (item.type === 'text' && item.recallOf) {
    const partner = players.find((p) => p.user_id !== myId)
    return `وش قال ${partner?.nickname ?? 'شريكك'} عن: «${item.prompt}»`
  }
  if (subject && subject !== myId) return `توقّع إجابة ${nameOf(subject, players as never)}: ${item.prompt}`
  return item.prompt
}

function AnswerInput({
  item,
  busy,
  myId,
  partnerId,
  partnerName,
  onSubmit,
}: {
  item: RoundItem
  busy: boolean
  myId: string
  partnerId: string
  partnerName: string
  onSubmit: (a: Record<string, unknown>) => void
}) {
  const [text, setText] = useState('')
  const [order, setOrder] = useState<number[]>([])
  const [picked, setPicked] = useState<number | string | null>(null)

  const choose = (v: number | string, payload: Record<string, unknown>) => {
    if (busy || picked !== null) return
    setPicked(v)
    sfx('select')
    vibrate()
    onSubmit(payload)
  }
  // إعادة السماح إذا فشل الإرسال
  useEffect(() => {
    if (!busy && picked !== null) {
      const t = setTimeout(() => setPicked(null), 1500)
      return () => clearTimeout(t)
    }
  }, [busy, picked])

  if (item.type === 'choice') {
    if (item.who) {
      const opts = [
        { id: myId, label: 'أنا 🙋' },
        { id: partnerId, label: `${partnerName} 👉` },
      ]
      return (
        <div className="grid grid-cols-2 gap-3">
          {opts.map((o) => (
            <OptionButton key={o.id} active={picked === o.id} disabled={busy} onClick={() => choose(o.id, { who: o.id })}>
              {o.label}
            </OptionButton>
          ))}
        </div>
      )
    }
    return (
      <div className={`grid gap-3 ${item.options.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {item.options.map((o, i) => (
          <OptionButton key={i} active={picked === i} disabled={busy} onClick={() => choose(i, { choice: i })} tall={item.options.length === 2}>
            {o}
          </OptionButton>
        ))}
        {item.skippable && (
          <Button variant="ghost" className="col-span-full" icon={<SkipForward className="size-4" />} onClick={() => choose('skip', { skip: true })}>
            تخطَّ هذا السؤال
          </Button>
        )}
      </div>
    )
  }

  if (item.type === 'rank') {
    const done = order.length === item.options.length
    return (
      <div>
        <p className="text-sm text-mist mb-3 text-center">اضغط بالترتيب: الأول هو الأحب لك</p>
        <div className="grid gap-2.5">
          {item.options.map((o, i) => {
            const pos = order.indexOf(i)
            return (
              <button
                key={i}
                disabled={busy}
                onClick={() => {
                  sfx('tap')
                  setOrder((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
                }}
                className={`flex items-center gap-3 rounded-2xl px-4 h-14 text-start transition-all ${pos >= 0 ? 'bg-iris-500/25 border border-iris-400/40' : 'glass hover:bg-white/10'}`}
              >
                <span className={`grid size-8 place-items-center rounded-full text-sm font-bold ${pos >= 0 ? 'btn-primary' : 'bg-white/10 text-mist'}`}>{pos >= 0 ? pos + 1 : '·'}</span>
                <span className="font-medium">{o}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex gap-3">
          <Button variant="glass" onClick={() => setOrder([])} disabled={!order.length}>
            إعادة
          </Button>
          <Button variant="primary" block disabled={!done} loading={busy} onClick={() => onSubmit({ order })}>
            اعتمد ترتيبي
          </Button>
        </div>
      </div>
    )
  }

  const value = text.trim()
  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 280))}
        placeholder={item.placeholder ?? 'اكتب إجابتك…'}
        rows={3}
        maxLength={280}
        className="w-full resize-none rounded-2xl glass px-4 py-3 leading-relaxed placeholder:text-mist/60 focus:outline-none focus:ring-2 focus:ring-iris-400/50"
        aria-label="إجابتك"
      />
      <div className="mt-1 text-end text-xs text-mist/70 tabular-nums">{text.length}/280</div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button variant="primary" className="flex-1 min-w-40" disabled={!value} loading={busy} onClick={() => onSubmit({ text: value })} icon={<Check className="size-5" />}>
          أرسل إجابتي
        </Button>
        {item.skippable && (
          <>
            <Button variant="soft" icon={<Mic className="size-4" />} onClick={() => onSubmit({ skip: true, voice: true })} disabled={busy}>
              نتكلم بالصوت
            </Button>
            <Button variant="ghost" icon={<SkipForward className="size-4" />} onClick={() => onSubmit({ skip: true })} disabled={busy}>
              تخطَّ
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function OptionButton({ children, active, disabled, onClick, tall }: { children: ReactNode; active?: boolean; disabled?: boolean; onClick: () => void; tall?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-4 text-[15px] font-medium leading-snug transition-colors ${tall ? 'min-h-28 text-lg font-display' : 'min-h-14 py-3'} ${
        active ? 'btn-primary text-white' : 'glass hover:bg-white/10'
      }`}
    >
      {children}
    </motion.button>
  )
}

function answerLabel(item: RoundItem, a: Answer | undefined, myId: string, partnerName: string): string {
  if (!a) return 'لم يجب ⏳'
  if (a.answer?.skip) return a.answer.voice ? 'نتكلم عنها بالصوت 🎙️' : 'تخطّى ⏭️'
  if (item.type === 'choice') {
    if (item.who) return a.answer.who === myId ? (a.player_id === myId ? 'أنا' : 'أنت') : a.player_id === myId ? partnerName : 'نفسه'
    return item.options[a.answer.choice] ?? '—'
  }
  if (item.type === 'rank') return (a.answer.order as number[]).map((i, k) => `${k + 1}. ${item.options[i]}`).join('  ')
  return String(a.answer.text ?? '')
}

function Reveal({
  item,
  round,
  mine,
  theirs,
  answers,
  myId,
  partnerId,
  subject,
}: {
  item: RoundItem
  round: number
  mine?: Answer
  theirs?: Answer
  answers: Answer[]
  myId: string
  partnerId: string
  subject?: string
}) {
  const { partner, me } = useRoom()
  const api = useGameApi()
  const pName = partner?.nickname ?? 'شريكك'

  // ألعاب الإجابة الصحيحة
  if (item.type === 'choice' && item.correct !== undefined) {
    const ok = (a?: Answer) => a && a.answer?.choice === item.correct
    return (
      <div className="space-y-3">
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-xs text-mist mb-1">الإجابة الصحيحة</p>
          <p className="font-display text-lg text-emerald-300">{item.options[item.correct]}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { n: 'أنت', a: mine },
            { n: pName, a: theirs },
          ].map((x) => (
            <div key={x.n} className={`rounded-2xl p-4 text-center border ${ok(x.a) ? 'bg-emerald-500/10 border-emerald-400/30' : 'bg-rose-500/10 border-rose-400/20'}`}>
              <p className="text-xs text-mist">{x.n}</p>
              <p className="mt-1 font-medium">{answerLabel(item, x.a, myId, pName)}</p>
              <p className="mt-1 text-lg">{ok(x.a) ? '✅' : '❌'}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // تذكر التفاصيل: عرض الأصل مقابل ما تذكره
  if (item.type === 'text' && item.recallOf) {
    const orig = (pid: string) => answers.find((a) => a.round === item.recallOf && a.player_id === pid)
    return (
      <div className="space-y-3">
        <RecallBlock
          title={`تذكّرك لإجابة ${pName}`}
          original={orig(partnerId)?.answer?.text}
          recall={mine?.answer?.text}
          verdict={mine?.judged}
          judgeHint={`${pName} يحكم على إجابتك`}
        />
        <RecallBlock
          title={`تذكّر ${pName} لإجابتك`}
          original={orig(myId)?.answer?.text}
          recall={theirs?.answer?.text}
          verdict={theirs?.judged}
          onJudge={theirs && theirs.judged === null ? (c) => void api.judge(round, partnerId, c) : undefined}
        />
      </div>
    )
  }

  // التوقع مع حكم صاحب السؤال
  if (item.type === 'text' && item.judge === 'subject' && subject) {
    const guesser = subject === myId ? partnerId : myId
    const guessAns = guesser === myId ? mine : theirs
    const subjAns = subject === myId ? mine : theirs
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <AnswerTile title={subject === myId ? 'إجابتك' : `إجابة ${pName}`} text={answerLabel(item, subjAns, myId, pName)} />
          <AnswerTile title={guesser === myId ? 'توقعك' : `توقع ${pName}`} text={answerLabel(item, guessAns, myId, pName)} />
        </div>
        {guessAns && (
          <Verdict
            verdict={guessAns.judged}
            canJudge={subject === myId}
            waitText={`بانتظار حكم ${pName}…`}
            onJudge={(c) => void api.judge(round, guesser, c)}
          />
        )}
      </div>
    )
  }

  // ألعاب التوقع بالخيارات
  if (item.type === 'choice' && item.guess && subject) {
    const subjAns = subject === myId ? mine : theirs
    const guessAns = subject === myId ? theirs : mine
    const hit = subjAns && guessAns && subjAns.answer.choice === guessAns.answer.choice
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <AnswerTile title={subject === myId ? 'إجابتك' : `إجابة ${pName}`} text={answerLabel(item, subjAns, myId, pName)} />
          <AnswerTile title={subject === myId ? `توقع ${pName}` : 'توقعك'} text={answerLabel(item, guessAns, myId, pName)} highlight={hit ? 'good' : 'bad'} />
        </div>
        <p className="text-center font-display text-lg">{hit ? 'توقع صحيح! +1 🎯' : 'قريبة… المرة الجاية 😄'}</p>
      </div>
    )
  }

  const same =
    mine && theirs && !mine.answer.skip && !theirs.answer.skip && JSON.stringify(mine.answer.choice ?? mine.answer.who ?? mine.answer.order) === JSON.stringify(theirs.answer.choice ?? theirs.answer.who ?? theirs.answer.order)
  const isText = item.type === 'text'
  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${isText ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <AnswerTile title={`أنت${me ? ` (${me.nickname})` : ''}`} text={answerLabel(item, mine, myId, pName)} highlight={!isText ? (same ? 'good' : undefined) : undefined} />
        <AnswerTile title={pName} text={answerLabel(item, theirs, myId, pName)} highlight={!isText ? (same ? 'good' : undefined) : undefined} />
      </div>
      {!isText && mine && theirs && !mine.answer.skip && !theirs.answer.skip && (
        <p className="text-center font-display text-lg">
          {item.type === 'rank'
            ? `تشابه الترتيب: ${rankSimilarity(mine.answer.order, theirs.answer.order)}%`
            : item.type === 'choice' && item.who
              ? same
                ? 'اتفقتوا! 🤝'
                : 'كل واحد له رأي 😄'
              : same
                ? 'نفس الاختيار! 💜'
                : 'اختلفتوا هالمرة'}
        </p>
      )}
    </div>
  )
}

function AnswerTile({ title, text, highlight }: { title: string; text: string; highlight?: 'good' | 'bad' }) {
  return (
    <div
      className={`rounded-2xl p-4 border ${highlight === 'good' ? 'bg-emerald-500/10 border-emerald-400/30' : highlight === 'bad' ? 'bg-white/5 border-white/10' : 'glass border-transparent'}`}
    >
      <p className="text-xs text-mist mb-1.5">{title}</p>
      <p className="font-medium leading-relaxed whitespace-pre-wrap break-words">{text}</p>
    </div>
  )
}

function Verdict({ verdict, canJudge, waitText, onJudge }: { verdict: boolean | null; canJudge: boolean; waitText: string; onJudge: (c: boolean) => void }) {
  if (verdict !== null) return <p className="text-center font-display text-lg">{verdict ? 'صح! +1 ✅' : 'مو صح ❌'}</p>
  if (!canJudge) return <WaitingCard text={waitText} />
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-center mb-3 font-medium">هل التوقع صحيح؟</p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="soft" icon={<Check className="size-5" />} onClick={() => onJudge(true)}>
          صح
        </Button>
        <Button variant="danger" icon={<X className="size-5" />} onClick={() => onJudge(false)}>
          خطأ
        </Button>
      </div>
    </div>
  )
}

function RecallBlock({
  title,
  original,
  recall,
  verdict,
  onJudge,
  judgeHint,
}: {
  title: string
  original?: string
  recall?: string
  verdict?: boolean | null
  onJudge?: (c: boolean) => void
  judgeHint?: string
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-sm font-semibold mb-3">{title}</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-mist">الإجابة الأصلية</p>
          <p className="mt-1">{original ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-mist">ما تذكره</p>
          <p className="mt-1">{recall ?? 'لم يجب'}</p>
        </div>
      </div>
      {verdict !== undefined && verdict !== null ? (
        <p className="text-center">{verdict ? 'صح ✅' : 'خطأ ❌'}</p>
      ) : onJudge ? (
        <div className="grid grid-cols-2 gap-3">
          <Button size="sm" variant="soft" onClick={() => onJudge(true)}>
            صح
          </Button>
          <Button size="sm" variant="danger" onClick={() => onJudge(false)}>
            خطأ
          </Button>
        </div>
      ) : recall ? (
        <p className="text-center text-sm text-mist">{judgeHint}…</p>
      ) : null}
    </div>
  )
}

function NextButton({
  item,
  mine,
  theirs,
  subject,
  myId,
  last,
  busy,
  onNext,
}: {
  item: RoundItem
  mine?: Answer
  theirs?: Answer
  subject?: string
  myId: string
  last: boolean
  busy: boolean
  onNext: () => void
}) {
  const pendingJudge = useMemo(() => {
    if (item.type !== 'text') return false
    if (item.recallOf) return [mine, theirs].some((a) => a && a.judged === null)
    if (item.judge === 'subject' && subject) {
      const g = subject === myId ? theirs : mine
      return Boolean(g && g.judged === null)
    }
    return false
  }, [item, mine, theirs, subject, myId])

  return (
    <div className="mt-5">
      <Button variant="primary" size="lg" block disabled={pendingJudge} loading={busy} onClick={onNext} icon={<ChevronLeft className="size-5" />}>
        {pendingJudge ? 'بانتظار الحكم…' : last ? 'عرض النتيجة' : 'الجولة التالية'}
      </Button>
      <p className="mt-2 text-center text-xs text-mist">أي واحد منكم يقدر ينقل الجولة للطرفين</p>
    </div>
  )
}
