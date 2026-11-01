import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'
import { ensureSession } from '../supabase/session'
import type { Answer, GameSession, Message, Move, Player, Room } from '../../types/db'
import { roomsApi } from './api'
import { local } from './storage'
import { uuid } from '../../utils/random'
import { VoiceCall, type VoiceSignal, type VoiceState } from '../webrtc/VoiceCall'
import { getIceServers } from '../webrtc/iceServers'
import { sfx } from '../sound'

export type ChatMessage = Message & { mine: boolean; pending?: boolean; failed?: string }
export type Connection = 'connecting' | 'live' | 'reconnecting' | 'offline'
export type RoomStatus = 'loading' | 'ready' | 'not_member' | 'error'

export type RoomCtxValue = {
  status: RoomStatus
  error: string | null
  myId: string
  room: Room | null
  players: Player[]
  me: Player | undefined
  partner: Player | undefined
  isHost: boolean
  online: Set<string>
  connection: Connection
  session: GameSession | null
  answers: Answer[]
  moves: Move[]
  refreshGame: () => Promise<void>
  serverNow: () => number
  // chat
  messages: ChatMessage[]
  sendMessage: (body: string) => Promise<void>
  retryMessage: (clientId: string) => Promise<void>
  unread: number
  setChatOpen: (open: boolean) => void
  partnerTyping: boolean
  notifyTyping: () => void
  // voice
  voice: VoiceCall | null
  voiceState: VoiceState | null
  leave: () => Promise<void>
  deleteRoom: () => Promise<string | null>
}

/** مُصدَّر لاختبارات الواجهة المرئية فقط */
export const RoomCtx = createContext<RoomCtxValue | null>(null)

export function useRoom() {
  const c = useContext(RoomCtx)
  if (!c) throw new Error('useRoom outside RoomProvider')
  return c
}

export function RoomProvider({ code, children }: { code: string; children: ReactNode }) {
  const [status, setStatus] = useState<RoomStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [myId, setMyId] = useState('')
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [connection, setConnection] = useState<Connection>('connecting')
  const [session, setSession] = useState<GameSession | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [moves, setMoves] = useState<Move[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unread, setUnread] = useState(0)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState | null>(null)

  const chRef = useRef<RealtimeChannel | null>(null)
  const roomIdRef = useRef<string | null>(null)
  const myIdRef = useRef('')
  const chatOpenRef = useRef(false)
  const offsetRef = useRef(0)
  const voiceRef = useRef<VoiceCall | null>(null)
  const playersRef = useRef<Player[]>([])
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSent = useRef(0)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const onlineRef = useRef<Set<string>>(new Set())
  const sessionIdRef = useRef<string | null>(null)

  playersRef.current = players

  // ---------- جلب الحالة من قاعدة البيانات (مصدر الحقيقة) ----------
  const fetchRoom = useCallback(async () => {
    const rid = roomIdRef.current
    if (!rid) return
    const sb = supabase()
    const [r, p] = await Promise.all([
      sb.from('rooms').select('*').eq('id', rid).maybeSingle(),
      sb.from('room_players').select('*').eq('room_id', rid).order('seat'),
    ])
    if (r.error || p.error) return
    if (!r.data) {
      setStatus('not_member')
      return
    }
    setRoom(r.data as Room)
    const list = (p.data ?? []) as Player[]
    if (!list.some((x) => x.user_id === myIdRef.current)) {
      setStatus('not_member')
      return
    }
    setPlayers((prev) => {
      const prevIds = prev.map((x) => x.user_id).join()
      const ids = list.map((x) => x.user_id).join()
      if (prev.length && prevIds !== ids) {
        if (list.length > prev.length) sfx('join')
        if (list.length < prev.length) voiceRef.current?.partnerGone()
      }
      return list
    })
  }, [])

  const fetchGame = useCallback(async () => {
    const rid = roomIdRef.current
    if (!rid) return
    const sb = supabase()
    const s = await sb.from('game_sessions').select('*').eq('room_id', rid).order('created_at', { ascending: false }).limit(1)
    if (s.error) return
    const sess = (s.data?.[0] as GameSession | undefined) ?? null
    if (!sess) {
      sessionIdRef.current = null
      setSession(null)
      setAnswers([])
      setMoves([])
      return
    }
    const [a, m] = await Promise.all([
      sb.from('game_answers').select('*').eq('session_id', sess.id),
      sb.from('game_moves').select('*').eq('session_id', sess.id).order('seq'),
    ])
    if (a.error || m.error) return
    sessionIdRef.current = sess.id
    setSession((prev) => (prev && prev.id === sess.id && prev.version > sess.version ? prev : sess))
    setAnswers((a.data ?? []) as Answer[])
    setMoves((m.data ?? []) as Move[])
  }, [])

  const fetchMessages = useCallback(async () => {
    const rid = roomIdRef.current
    if (!rid) return
    const { data, error } = await supabase()
      .from('room_messages')
      .select('*')
      .eq('room_id', rid)
      .order('created_at', { ascending: false })
      .limit(150)
    if (error || !data) return
    const fetched = (data as Message[]).reverse().map((m) => ({ ...m, mine: m.sender_id === myIdRef.current }))
    setMessages((prev) => {
      const byClient = new Map(fetched.map((m) => [m.client_id, m]))
      // نحتفظ بالرسائل المحلية التي لم تصل للخادم بعد
      const localOnly = prev.filter((m) => (m.pending || m.failed) && !byClient.has(m.client_id))
      return [...fetched, ...localOnly]
    })
  }, [])

  const schedule = useCallback(
    (key: 'room' | 'game' | 'messages', ms = 80) => {
      clearTimeout(timers.current[key])
      timers.current[key] = setTimeout(() => {
        if (key === 'room') void fetchRoom()
        else if (key === 'game') void fetchGame()
        else void fetchMessages()
      }, ms)
    },
    [fetchRoom, fetchGame, fetchMessages],
  )

  const refetchAll = useCallback(async () => {
    await Promise.all([fetchRoom(), fetchGame(), fetchMessages()])
  }, [fetchRoom, fetchGame, fetchMessages])

  // ---------- الاتصال الفوري ----------
  useEffect(() => {
    let cancelled = false
    let ch: RealtimeChannel | null = null
    let voice: VoiceCall | null = null
    let unsubVoice: (() => void) | null = null

    ;(async () => {
      try {
        const uid = await ensureSession()
        if (cancelled) return
        myIdRef.current = uid
        setMyId(uid)
        const sb = supabase()

        const t0 = Date.now()
        const now = await sb.rpc('server_now')
        if (!now.error && now.data) {
          const t1 = Date.now()
          offsetRef.current = new Date(now.data as string).getTime() - (t0 + t1) / 2
        }

        const { data: r, error: rErr } = await sb.from('rooms').select('*').eq('code', code).maybeSingle()
        if (cancelled) return
        if (rErr) throw new Error('network')
        if (!r) {
          setStatus('not_member')
          return
        }
        roomIdRef.current = (r as Room).id
        setRoom(r as Room)
        local.setLastRoom(code)
        await refetchAll()
        if (cancelled) return
        setStatus((s) => (s === 'loading' ? 'ready' : s))

        const rid = (r as Room).id
        await sb.realtime.setAuth()
        ch = sb.channel(`room:${rid}`, {
          config: { private: true, broadcast: { self: false }, presence: { key: uid } },
        })
        chRef.current = ch

        voice = new VoiceCall({
          selfId: uid,
          getPartnerId: () => playersRef.current.find((p) => p.user_id !== uid)?.user_id,
          send: (s: VoiceSignal) => void ch?.send({ type: 'broadcast', event: 'rtc', payload: s }),
          iceServers: getIceServers,
        })
        voiceRef.current = voice
        unsubVoice = voice.subscribe(setVoiceState)

        const filter = `room_id=eq.${rid}`
        ch.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${rid}` }, () => schedule('room'))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter }, () => schedule('room'))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter }, () => schedule('game', 40))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_answers', filter }, () => schedule('game', 40))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_moves', filter }, () => schedule('game', 40))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter }, (payload) => {
            const m = payload.new as Message
            if (m.room_id !== rid) return
            const mine = m.sender_id === myIdRef.current
            setMessages((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev
              const i = prev.findIndex((x) => x.client_id === m.client_id)
              const msg: ChatMessage = { ...m, mine }
              if (i >= 0) {
                const copy = prev.slice()
                copy[i] = msg
                return copy
              }
              return [...prev, msg]
            })
            if (!mine) {
              setPartnerTyping(false)
              if (!chatOpenRef.current) setUnread((u) => u + 1)
              sfx('message')
            }
          })
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (payload?.from === myIdRef.current) return
            setPartnerTyping(true)
            if (typingTimer.current) clearTimeout(typingTimer.current)
            typingTimer.current = setTimeout(() => setPartnerTyping(false), 3500)
          })
          .on('broadcast', { event: 'rtc' }, ({ payload }) => voice?.handleSignal(payload as VoiceSignal))
          .on('presence', { event: 'sync' }, () => {
            const state = ch!.presenceState()
            const ids = new Set(Object.keys(state))
            const partner = playersRef.current.find((p) => p.user_id !== uid)?.user_id
            const wasOnline = partner ? onlineRef.current.has(partner) : false
            const isOnline = partner ? ids.has(partner) : false
            onlineRef.current = ids
            setOnline(ids)
            if (partner && wasOnline && !isOnline) voice?.partnerGone()
            if (partner && !wasOnline && isOnline) void voice?.partnerBack()
            schedule('room', 200)
          })
          .subscribe(async (st) => {
            if (cancelled) return
            if (st === 'SUBSCRIBED') {
              setConnection('live')
              await ch!.track({ at: Date.now() })
              void refetchAll()
            } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
              setConnection('reconnecting')
            } else if (st === 'CLOSED') {
              setConnection('offline')
            }
          })
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message || 'network')
        setStatus('error')
      }
    })()

    // شبكة احتياطية: إعادة جلب دوري، وعند عودة الإنترنت أو عودة التبويب
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && roomIdRef.current) void refetchAll()
    }, 25000)
    const onOnline = () => {
      setConnection('reconnecting')
      void refetchAll()
    }
    const onOffline = () => setConnection('offline')
    const onVisible = () => document.visibilityState === 'visible' && roomIdRef.current && void refetchAll()
    const onPageHide = () => voiceRef.current?.hangup()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onPageHide)

    const timersNow = timers.current
    return () => {
      cancelled = true
      clearInterval(poll)
      Object.values(timersNow).forEach(clearTimeout)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onPageHide)
      unsubVoice?.()
      voice?.dispose()
      voiceRef.current = null
      if (ch) void supabase().removeChannel(ch)
      chRef.current = null
    }
  }, [code, refetchAll, schedule])

  // ---------- الشات ----------
  const deliver = useCallback(async (clientId: string, body: string) => {
    const rid = roomIdRef.current
    if (!rid) return
    const res = await roomsApi.sendMessage(rid, body, clientId)
    setMessages((prev) =>
      prev.map((m) =>
        m.client_id !== clientId
          ? m
          : res.ok
            ? { ...m, id: res.id, created_at: res.created_at, pending: false, failed: undefined }
            : { ...m, pending: false, failed: res.error },
      ),
    )
  }, [])

  const sendMessage = useCallback(
    async (raw: string) => {
      const body = raw.trim().slice(0, 500)
      if (!body || !roomIdRef.current) return
      const clientId = uuid()
      const me = playersRef.current.find((p) => p.user_id === myIdRef.current)
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${clientId}`,
          room_id: roomIdRef.current!,
          sender_id: myIdRef.current,
          nickname: me?.nickname ?? '',
          body,
          client_id: clientId,
          created_at: new Date(Date.now() + offsetRef.current).toISOString(),
          mine: true,
          pending: true,
        },
      ])
      await deliver(clientId, body)
    },
    [deliver],
  )

  const retryMessage = useCallback(
    async (clientId: string) => {
      let body = ''
      setMessages((prev) =>
        prev.map((m) => {
          if (m.client_id !== clientId) return m
          body = m.body
          return { ...m, pending: true, failed: undefined }
        }),
      )
      if (body) await deliver(clientId, body)
    },
    [deliver],
  )

  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastTypingSent.current < 2000) return
    lastTypingSent.current = now
    void chRef.current?.send({ type: 'broadcast', event: 'typing', payload: { from: myIdRef.current } })
  }, [])

  const setChatOpen = useCallback((open: boolean) => {
    chatOpenRef.current = open
    if (open) setUnread(0)
  }, [])

  const leave = useCallback(async () => {
    voiceRef.current?.dispose()
    const rid = roomIdRef.current
    if (rid) await roomsApi.leave(rid)
    local.setLastRoom(null)
  }, [])

  const deleteRoom = useCallback(async () => {
    const rid = roomIdRef.current
    if (!rid) return null
    const res = await roomsApi.deleteRoom(rid)
    if (!res.ok) return res.error
    voiceRef.current?.dispose()
    local.setLastRoom(null)
    return null
  }, [])

  const me = players.find((p) => p.user_id === myId)
  const partner = players.find((p) => p.user_id !== myId)

  const value = useMemo<RoomCtxValue>(
    () => ({
      status,
      error,
      myId,
      room,
      players,
      me,
      partner,
      isHost: Boolean(room && room.host_id === myId),
      online,
      connection,
      session,
      answers,
      moves,
      refreshGame: fetchGame,
      serverNow: () => Date.now() + offsetRef.current,
      messages,
      sendMessage,
      retryMessage,
      unread,
      setChatOpen,
      partnerTyping,
      notifyTyping,
      voice: voiceRef.current,
      voiceState,
      leave,
      deleteRoom,
    }),
    [status, error, myId, room, players, me, partner, online, connection, session, answers, moves, fetchGame, messages, sendMessage, retryMessage, unread, setChatOpen, partnerTyping, notifyTyping, voiceState, leave, deleteRoom],
  )

  return <RoomCtx.Provider value={value}>{children}</RoomCtx.Provider>
}
