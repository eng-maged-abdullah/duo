import { supabase } from '../supabase/client'
import { ensureSession } from '../supabase/session'

export type RpcOk<T> = { ok: true } & T
export type RpcFail = { ok: false; error: string }
export type Rpc<T = object> = RpcOk<T> | RpcFail

/** كل العمليات الحساسة تمر عبر دوال قاعدة البيانات الآمنة (RPC) */
export async function rpc<T = object>(fn: string, args: Record<string, unknown>): Promise<Rpc<T>> {
  try {
    await ensureSession()
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'no_session' }
  }
  try {
    const { data, error } = await supabase().rpc(fn, args)
    if (error) {
      if (/jwt|token/i.test(error.message)) return { ok: false, error: 'no_session' }
      if (error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message)) return { ok: false, error: 'need_update' }
      return { ok: false, error: 'network' }
    }
    const res = data as Rpc<T>
    if (!res || typeof res !== 'object') return { ok: false, error: 'network' }
    return res
  } catch {
    return { ok: false, error: 'network' }
  }
}

export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
}

export const roomsApi = {
  create: (nickname: string, game?: string | null) =>
    rpc<{ room_id: string; code: string; expires_at: string }>('create_room', {
      p_nickname: nickname,
      p_game: game ?? null,
    }),
  join: (code: string, nickname: string) =>
    rpc<{ room_id: string; code: string; rejoined?: boolean }>('join_room', {
      p_code: normalizeCode(code),
      p_nickname: nickname,
    }),
  leave: (roomId: string) => rpc('leave_room', { p_room: roomId }),
  deleteRoom: (roomId: string) => rpc('delete_room', { p_room: roomId }),
  selectGame: (roomId: string, game: string | null) => rpc('select_game', { p_room: roomId, p_game: game }),
  startGame: (args: {
    roomId: string
    game: string
    requestId: string
    mode: string
    rounds: number
    seconds: number | null
    content: unknown
  }) =>
    rpc<{ session_id: string }>('start_game', {
      p_room: args.roomId,
      p_game: args.game,
      p_request: args.requestId,
      p_mode: args.mode,
      p_rounds: args.rounds,
      p_round_seconds: args.seconds,
      p_content: args.content,
    }),
  submitAnswer: (sessionId: string, round: number, answer: Record<string, unknown>) =>
    rpc<{ duplicate?: boolean }>('submit_answer', { p_session: sessionId, p_round: round, p_answer: answer }),
  expireRound: (sessionId: string, round: number) => rpc('expire_round', { p_session: sessionId, p_round: round }),
  nextRound: (sessionId: string, round: number) => rpc('next_round', { p_session: sessionId, p_round: round }),
  judge: (sessionId: string, round: number, target: string, correct: boolean) =>
    rpc('judge_answer', { p_session: sessionId, p_round: round, p_target: target, p_correct: correct }),
  move: (sessionId: string, seq: number, move: Record<string, unknown>) =>
    rpc<{ seq: number; move: unknown }>('submit_move', { p_session: sessionId, p_seq: seq, p_move: move }),
  endSession: (sessionId: string) => rpc('end_session', { p_session: sessionId }),
  secrets: (sessionId: string) => rpc<{ secrets: Record<string, { v: unknown; mine: boolean; revealed: boolean }> }>('get_secrets', { p_session: sessionId }),
  secret: (sessionId: string, action: string, slot: string, value: unknown = null) =>
    rpc<{ seq?: number; correct?: boolean; duplicate?: boolean; value?: unknown; values?: Record<string, unknown> }>('secret_action', {
      p_session: sessionId,
      p_action: action,
      p_slot: slot,
      p_value: value,
    }),
  addStroke: (sessionId: string, round: number, stroke: unknown) => rpc<{ id: number }>('add_stroke', { p_session: sessionId, p_round: round, p_stroke: stroke }),
  rate: (sessionId: string, round: number, target: string, score: number) =>
    rpc('rate_answer', { p_session: sessionId, p_round: round, p_target: target, p_score: score }),
  letterCreate: (roomId: string, body: string, unlockAt: string) => rpc<{ id: string }>('letter_create', { p_room: roomId, p_body: body, p_unlock_at: unlockAt }),
  letterList: (roomId: string) =>
    rpc<{ now: string; letters: { id: string; author_id: string; unlock_at: string; created_at: string; open: boolean; body: string | null }[] }>('letter_list', { p_room: roomId }),
  letterDelete: (id: string) => rpc('letter_delete', { p_id: id }),
  momentAdd: (roomId: string, kind: 'timeline' | 'bucket' | 'saved', title: string, body = '', emoji = '', date: string | null = null) =>
    rpc<{ id: string }>('moment_add', { p_room: roomId, p_kind: kind, p_title: title, p_body: body, p_emoji: emoji, p_date: date }),
  momentDone: (id: string, done: boolean) => rpc('moment_done', { p_id: id, p_done: done }),
  momentDelete: (id: string) => rpc('moment_delete', { p_id: id }),
  dailyAnswer: (roomId: string, day: string, text: string) => rpc('daily_answer', { p_room: roomId, p_day: day, p_text: text }),
  dailyGet: (roomId: string, day: string) =>
    rpc<{ mine: string | null; theirs: string | null; their_done: boolean; streak: number; history: { day: string; mine: string; theirs: string }[] }>('daily_get', {
      p_room: roomId,
      p_day: day,
    }),
  touch: (roomId: string) => rpc('touch_room', { p_room: roomId }),
  stats: (roomId: string) =>
    rpc<{ games: number; days: number; since: string; letters: number; moments: number; dreams: number; dreams_done: number; daily: number }>('room_stats', { p_room: roomId }),
  sendMessage: (roomId: string, body: string, clientId: string) =>
    rpc<{ id: string; created_at: string; duplicate?: boolean }>('send_message', {
      p_room: roomId,
      p_body: body,
      p_client_id: clientId,
    }),
}
