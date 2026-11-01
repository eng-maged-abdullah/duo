export type Room = {
  id: string
  code: string
  host_id: string
  status: 'open' | 'closed'
  current_game: string | null
  created_at: string
  expires_at: string
}

export type Player = {
  room_id: string
  user_id: string
  nickname: string
  seat: 1 | 2
  joined_at: string
}

export type SessionStatus = 'playing' | 'finished' | 'abandoned'
export type GameMode = 'rounds' | 'sprint' | 'turns'

export type GameSession = {
  id: string
  room_id: string
  game_id: string
  request_id: string
  status: SessionStatus
  mode: GameMode
  round: number
  rounds_total: number
  phase: 'answering' | 'revealed'
  round_seconds: number | null
  round_started_at: string
  round_deadline: string | null
  answered: string[]
  progress: Record<string, number>
  turn_player: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any
  version: number
  started_by: string
  created_at: string
  finished_at: string | null
}

export type Answer = {
  session_id: string
  room_id: string
  round: number
  player_id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answer: any
  judged: boolean | null
  created_at: string
}

export type Move = {
  session_id: string
  room_id: string
  seq: number
  player_id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  move: any
  created_at: string
}

export type Message = {
  id: string
  room_id: string
  sender_id: string
  nickname: string
  body: string
  client_id: string
  created_at: string
}

export type RpcResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string }
