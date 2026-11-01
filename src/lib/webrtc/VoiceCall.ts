/**
 * مكالمة صوتية بين لاعبين عبر WebRTC.
 * - مستقلة عن الألعاب: تعيش على مستوى الغرفة وتستمر عند تغيير اللعبة.
 * - الإشارة (Signaling) تُمرَّر عبر دالة send (قناة Realtime خاصة بالغرفة).
 * - تستخدم نمط "Perfect Negotiation" لتجنب تضارب العروض بين الطرفين.
 * - لا تسجّل الصوت ولا تحفظه في أي مكان.
 */

export type VoiceSignal =
  | { type: 'offer' | 'answer'; from: string; to: string; inst: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; to: string; inst: string; candidate: RTCIceCandidateInit }
  | { type: 'hangup'; from: string; to: string; inst: string }

export type VoiceStatus =
  | 'idle' // لا مكالمة
  | 'requesting' // ننتظر إذن الميكروفون
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export type VoiceError = 'denied' | 'no_mic' | 'unsupported' | 'insecure' | 'busy' | 'failed' | null

export type VoiceState = {
  status: VoiceStatus
  micOn: boolean // مسار الميكروفون يعمل (حتى لو مكتوم)
  muted: boolean // كتم ميكروفوني
  remoteMuted: boolean // كتم صوت الطرف الآخر محليًا
  remoteAudio: boolean // يصلني صوت من الطرف الآخر
  localSpeaking: boolean
  remoteSpeaking: boolean
  needsTap: boolean // المتصفح منع التشغيل التلقائي، نحتاج ضغطة
  error: VoiceError
  endedByPartner: boolean
  relay: boolean | null // هل الاتصال عبر خادم TURN
}

export type VoiceOptions = {
  selfId: string
  getPartnerId: () => string | undefined
  send: (s: VoiceSignal) => void
  iceServers: () => Promise<RTCIceServer[]>
  audioElement?: HTMLAudioElement
}

const initial: VoiceState = {
  status: 'idle',
  micOn: false,
  muted: false,
  remoteMuted: false,
  remoteAudio: false,
  localSpeaking: false,
  remoteSpeaking: false,
  needsTap: false,
  error: null,
  endedByPartner: false,
  relay: null,
}

export class VoiceCall {
  readonly instance = Math.random().toString(36).slice(2, 10)
  private opts: VoiceOptions
  private pc: RTCPeerConnection | null = null
  private pcPromise: Promise<RTCPeerConnection> | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private audio: HTMLAudioElement
  private makingOffer = false
  private ignoreOffer = false
  private partnerInst: string | null = null
  private queue: Promise<void> = Promise.resolve()
  private listeners = new Set<(s: VoiceState) => void>()
  private _state: VoiceState = { ...initial }
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null
  private failCount = 0
  private audioCtx: AudioContext | null = null
  private meters: { stop: () => void }[] = []
  private disposed = false

  constructor(opts: VoiceOptions) {
    this.opts = opts
    this.audio = opts.audioElement ?? new Audio()
    this.audio.autoplay = true
    this.audio.setAttribute('playsinline', '')
  }

  get state() {
    return this._state
  }

  subscribe(fn: (s: VoiceState) => void) {
    this.listeners.add(fn)
    fn(this._state)
    return () => this.listeners.delete(fn)
  }

  private set(patch: Partial<VoiceState>) {
    this._state = { ...this._state, ...patch }
    for (const l of this.listeners) l(this._state)
  }

  private get polite() {
    const p = this.opts.getPartnerId()
    return !p || this.opts.selfId > p
  }

  static support(): VoiceError {
    if (typeof window === 'undefined') return 'unsupported'
    if (!window.isSecureContext) return 'insecure'
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') return 'unsupported'
    return null
  }

  /** يُستدعى فقط بعد ضغط المستخدم على زر الميكروفون */
  async startMic(): Promise<void> {
    if (this.localStream) {
      this.setMuted(false)
      return
    }
    const sup = VoiceCall.support()
    if (sup) {
      this.set({ error: sup })
      return
    }
    this.set({ status: this._state.status === 'idle' ? 'requesting' : this._state.status, error: null, endedByPartner: false })
    this.unlockAudio()
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
    } catch (e) {
      const name = (e as DOMException)?.name
      const error: VoiceError =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'no_mic'
            : name === 'NotReadableError'
              ? 'busy'
              : name === 'NotSupportedError' || name === 'TypeError'
                ? 'unsupported'
                : 'failed'
      this.set({ status: this.pc ? this._state.status : 'idle', error })
      return
    }
    if (this.disposed) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    this.localStream = stream
    const track = stream.getAudioTracks()[0]
    this.set({ micOn: true, muted: false })
    this.watchLevel(stream, (v) => this._state.localSpeaking !== v && this.set({ localSpeaking: v }))
    const pc = await this.ensurePc()
    const tr = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio')
    if (tr) {
      await tr.sender.replaceTrack(track)
      tr.sender.setStreams?.(stream)
      if (tr.direction !== 'sendrecv') tr.direction = 'sendrecv' // يطلق negotiationneeded
    } else {
      pc.addTrack(track, stream)
    }
    if (this._state.status === 'requesting' || this._state.status === 'idle') this.set({ status: 'connecting' })
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted))
    this.set({ muted })
  }

  setRemoteMuted(remoteMuted: boolean) {
    this.audio.muted = remoteMuted
    this.set({ remoteMuted })
  }

  /** ضغطة لتشغيل الصوت عندما يمنع المتصفح التشغيل التلقائي (iOS) */
  async tapToPlay() {
    this.unlockAudio()
    try {
      await this.audio.play()
      this.set({ needsTap: false })
    } catch {
      /* يبقى الزر ظاهرًا */
    }
  }

  /** إنهاء المكالمة للطرفين */
  hangup() {
    const to = this.opts.getPartnerId()
    if (to && (this.pc || this.localStream)) {
      this.opts.send({ type: 'hangup', from: this.opts.selfId, to, inst: this.instance })
    }
    this.cleanup()
    this.set({ ...initial, remoteMuted: this._state.remoteMuted })
  }

  /** عند مغادرة الغرفة: أوقف كل شيء نهائيًا */
  dispose() {
    this.hangup()
    this.disposed = true
    this.listeners.clear()
    void this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
  }

  /** الطرف الآخر غادر الغرفة أو أعاد تحميل الصفحة */
  partnerGone() {
    this.partnerInst = null
    if (!this.pc) return
    this.closePc()
    this.set({ remoteAudio: false, remoteSpeaking: false, status: this.localStream ? 'reconnecting' : 'idle' })
  }

  /** الطرف الآخر عاد: إن كان ميكروفوني يعمل نبدأ اتصالًا جديدًا */
  async partnerBack() {
    if (this.localStream && !this.pc) {
      const pc = await this.ensurePc()
      pc.addTrack(this.localStream.getAudioTracks()[0], this.localStream)
    }
  }

  handleSignal(s: VoiceSignal) {
    if (this.disposed) return
    if (s.to !== this.opts.selfId || s.from !== this.opts.getPartnerId()) return // ليس لنا أو من غير الشريك
    this.queue = this.queue.then(() => this.process(s)).catch((e) => console.warn('[voice]', e))
  }

  private async process(s: VoiceSignal) {
    if (s.type === 'hangup') {
      this.cleanup()
      this.set({ ...initial, remoteMuted: this._state.remoteMuted, endedByPartner: true })
      return
    }
    // أعاد الطرف الآخر تحميل الصفحة وبدأ اتصالًا جديدًا: الاتصال القديم لم يعد صالحًا
    if (this.partnerInst && this.partnerInst !== s.inst && this.pc && s.type === 'offer') {
      this.closePc()
    }
    this.partnerInst = s.inst

    if (s.type === 'ice') {
      const pc = this.pc
      if (!pc) return
      try {
        await pc.addIceCandidate(s.candidate)
      } catch (e) {
        if (!this.ignoreOffer) console.warn('[voice] ice', e)
      }
      return
    }

    const pc = await this.ensurePc()
    const description = s.sdp
    const collision = description.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable')
    this.ignoreOffer = !this.polite && collision
    if (this.ignoreOffer) return
    await pc.setRemoteDescription(description)
    if (description.type === 'offer') {
      await pc.setLocalDescription()
      const to = this.opts.getPartnerId()
      if (to && pc.localDescription) {
        this.opts.send({ type: 'answer', from: this.opts.selfId, to, inst: this.instance, sdp: pc.localDescription.toJSON() })
      }
      if (this._state.status === 'idle') this.set({ status: 'connecting', endedByPartner: false })
    }
  }

  private ensurePc(): Promise<RTCPeerConnection> {
    if (this.pc) return Promise.resolve(this.pc)
    if (this.pcPromise) return this.pcPromise
    this.pcPromise = (async () => {
      let iceServers: RTCIceServer[] = []
      try {
        iceServers = await this.opts.iceServers()
      } catch {
        /* نكمل بدون TURN */
      }
      const pc = new RTCPeerConnection({ iceServers })
      this.pc = pc
      this.makingOffer = false
      this.ignoreOffer = false

      pc.onnegotiationneeded = async () => {
        try {
          this.makingOffer = true
          await pc.setLocalDescription()
          const to = this.opts.getPartnerId()
          if (to && pc.localDescription) {
            this.opts.send({ type: 'offer', from: this.opts.selfId, to, inst: this.instance, sdp: pc.localDescription.toJSON() })
          }
        } catch (e) {
          console.warn('[voice] negotiation', e)
        } finally {
          this.makingOffer = false
        }
      }
      pc.onicecandidate = ({ candidate }) => {
        const to = this.opts.getPartnerId()
        if (candidate && to) {
          this.opts.send({ type: 'ice', from: this.opts.selfId, to, inst: this.instance, candidate: candidate.toJSON() })
        }
      }
      pc.ontrack = (ev) => {
        const stream = ev.streams[0] ?? new MediaStream([ev.track])
        this.remoteStream = stream
        this.audio.srcObject = stream
        this.audio.muted = this._state.remoteMuted
        this.set({ remoteAudio: true })
        ev.track.onunmute = () => this.set({ remoteAudio: true })
        this.audio.play().then(
          () => this.set({ needsTap: false }),
          () => this.set({ needsTap: true }),
        )
        this.watchLevel(stream, (v) => this._state.remoteSpeaking !== v && this.set({ remoteSpeaking: v }))
      }
      pc.onconnectionstatechange = () => this.onConnState(pc)
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') this.onConnState(pc, true)
      }
      return pc
    })()
    this.pcPromise.finally(() => (this.pcPromise = null))
    return this.pcPromise
  }

  private onConnState(pc: RTCPeerConnection, iceFailed = false) {
    if (pc !== this.pc) return
    const st = iceFailed ? 'failed' : pc.connectionState
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }
    if (st === 'connected') {
      this.failCount = 0
      this.set({ status: 'connected', error: null })
      void this.detectRelay(pc)
    } else if (st === 'connecting' || st === 'new') {
      if (this._state.status !== 'connected') this.set({ status: 'connecting' })
    } else if (st === 'disconnected') {
      this.set({ status: 'reconnecting' })
      this.disconnectTimer = setTimeout(() => pc === this.pc && pc.restartIce(), 4000)
    } else if (st === 'failed') {
      this.failCount++
      if (this.failCount <= 3) {
        this.set({ status: 'reconnecting' })
        pc.restartIce()
      } else {
        this.set({ status: 'failed', error: 'failed' })
      }
    }
  }

  private async detectRelay(pc: RTCPeerConnection) {
    try {
      const stats = await pc.getStats()
      let relay: boolean | null = null
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && (r.selected || r.nominated) && r.state === 'succeeded') {
          const local = stats.get(r.localCandidateId)
          if (local) relay = local.candidateType === 'relay'
        }
      })
      this.set({ relay })
    } catch {
      /* غير مهم */
    }
  }

  private unlockAudio() {
    try {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (Ctx) this.audioCtx = new Ctx()
      }
      void this.audioCtx?.resume()
    } catch {
      /* لا يدعم */
    }
  }

  /** مؤشر "يتحدث الآن" بقياس مستوى الصوت (لا يسجّل شيئًا) */
  private watchLevel(stream: MediaStream, cb: (speaking: boolean) => void) {
    const ctx = this.audioCtx
    if (!ctx) return
    try {
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      const buf = new Uint8Array(an.fftSize)
      let speaking = false
      let quietFor = 0
      const id = setInterval(() => {
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        if (rms > 0.035) {
          quietFor = 0
          if (!speaking) cb((speaking = true))
        } else if (speaking && ++quietFor > 4) {
          cb((speaking = false))
        }
      }, 120)
      this.meters.push({
        stop: () => {
          clearInterval(id)
          try {
            src.disconnect()
          } catch {
            /* */
          }
        },
      })
    } catch {
      /* بعض المتصفحات لا تدعم القياس */
    }
  }

  private closePc() {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer)
    this.disconnectTimer = null
    const pc = this.pc
    this.pc = null
    if (pc) {
      pc.onnegotiationneeded = pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = pc.oniceconnectionstatechange = null
      pc.getSenders().forEach((s) => {
        try {
          // لا نوقف مسار الميكروفون هنا: قد نعيد استخدامه في اتصال جديد
          pc.removeTrack(s)
        } catch {
          /* */
        }
      })
      pc.close()
    }
    this.remoteStream?.getTracks().forEach((t) => t.stop())
    this.remoteStream = null
    this.audio.srcObject = null
    this.failCount = 0
  }

  private cleanup() {
    this.closePc()
    this.localStream?.getTracks().forEach((t) => t.stop()) // يطفئ مؤشر الميكروفون في المتصفح
    this.localStream = null
    this.meters.forEach((m) => m.stop())
    this.meters = []
    this.partnerInst = null
  }
}
