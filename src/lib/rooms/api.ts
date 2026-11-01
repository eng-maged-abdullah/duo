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
  sendMessage: (roomId: string, body: string, clientId: string) =>
    rpc<{ id: string; created_at: string; duplicate?: boolean }>('send_message', {
      p_room: roomId,
      p_body: body,
      p_client_id: clientId,
    }),
}
