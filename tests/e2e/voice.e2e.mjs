// اختبار حقيقي للمكالمة الصوتية (WebRTC) بين متصفحين مستقلين باستخدام ميكروفون وهمي من Chromium.
// الإشارة هنا تُمرَّر عبر Playwright بدل Supabase Realtime، لكن منطق المكالمة هو نفس كود التطبيق.
// التشغيل:  node tests/e2e/voice.e2e.mjs   (يحتاج playwright و esbuild)
import http from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const esbuild = require(process.env.ESBUILD_PATH || 'esbuild')
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

const entry = fileURLToPath(new URL('../../src/lib/webrtc/VoiceCall.ts', import.meta.url))
const bundle = (await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName: 'DuoVoice', target: 'es2020' })).outputFiles[0].text
const html = `<!doctype html><html><body><script>${bundle}</script><script>
  window.setup = (self, partner) => {
    window.__partner = partner
    const v = new DuoVoice.VoiceCall({ selfId: self, getPartnerId: () => window.__partner, send: (s) => window.__send(s), iceServers: async () => [] })
    window.__voice = v
    v.subscribe((s) => (window.__state = s))
  }
  window.inbound = async () => {
    const pc = window.__voice.pc
    if (!pc) return null
    const st = await pc.getStats()
    let r = null
    st.forEach((x) => { if (x.type === 'inbound-rtp' && x.kind === 'audio') r = { bytes: x.bytesReceived || 0, level: x.audioLevel || 0, energy: x.totalAudioEnergy || 0 } })
    return r
  }
</script></body></html>`

const server = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/`

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? `  (${extra})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, ms = 15000) {
  const t = Date.now()
  while (Date.now() - t < ms) {
    if (await fn()) return true
    await sleep(200)
  }
  return false
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctxA = await browser.newContext({ permissions: ['microphone'] })
const ctxB = await browser.newContext({ permissions: ['microphone'] })
const ctxC = await browser.newContext()
const A = await ctxA.newPage()
const B = await ctxB.newPage()
const C = await ctxC.newPage()
const ids = { A: 'aaaaaaaa-0000-4000-8000-00000000000a', B: 'bbbbbbbb-0000-4000-8000-00000000000b', C: 'cccccccc-0000-4000-8000-00000000000c' }
const pages = { A, B, C }
const route = { A: 'B', B: 'A', C: 'B' } // C دخيل يحاول إرسال إشارات إلى B

for (const [k, p] of Object.entries(pages)) {
  p.on('pageerror', (e) => console.log(`[${k} error]`, e.message))
  await p.exposeFunction('__send', (sig) => pages[route[k]].evaluate((s) => window.__voice?.handleSignal(s), sig).catch(() => {}))
  await p.goto(url)
}
await A.evaluate(([s, p]) => window.setup(s, p), [ids.A, ids.B])
await B.evaluate(([s, p]) => window.setup(s, p), [ids.B, ids.A])
await C.evaluate(([s, p]) => window.setup(s, p), [ids.C, ids.B])
const state = (p) => p.evaluate(() => window.__state)
const inbound = (p) => p.evaluate(() => window.inbound())

try {
  // 1) الميكروفون مغلق افتراضيًا
  check('الميكروفون مغلق افتراضيًا والمكالمة متوقفة', (await state(A)).micOn === false && (await state(A)).status === 'idle')

  // 2) A يشغّل الميكروفون → اتصال
  await A.evaluate(() => window.__voice.startMic())
  check('A: تشغيل الميكروفون بعد طلب المستخدم', (await state(A)).micOn === true)
  const connected = await waitFor(async () => (await state(A)).status === 'connected' && (await state(B)).status === 'connected')
  check('A ↔ B: الاتصال الصوتي تم', connected, `${(await state(A)).status}/${(await state(B)).status}`)

  // 3) B يستقبل صوت A
  await sleep(1500)
  const b1 = await inbound(B)
  await sleep(1500)
  const b2 = await inbound(B)
  check('B يسمع A (بيانات صوت تصل)', b1 && b2 && b2.bytes > b1.bytes && b2.energy > b1.energy, `bytes ${b1?.bytes}→${b2?.bytes}`)
  check('B: لا يحتاج الميكروفون ليسمع', (await state(B)).micOn === false && (await state(B)).remoteAudio === true)

  // 4) B يشغّل الميكروفون → الصوت في الاتجاه الآخر
  await B.evaluate(() => window.__voice.startMic())
  const twoWay = await waitFor(async () => {
    const a = await inbound(A)
    return a && a.bytes > 2000
  })
  const a1 = await inbound(A)
  await sleep(1200)
  const a2 = await inbound(A)
  check('A يسمع B (الاتجاه العكسي)', twoWay && a2.energy > a1.energy, `bytes ${a1?.bytes}→${a2?.bytes}`)

  // 5) كتم ميكروفون A
  await A.evaluate(() => window.__voice.setMuted(true))
  await sleep(2500)
  const m1 = await inbound(B)
  await sleep(1500)
  const m2 = await inbound(B)
  const mutedEnergy = m2.energy - m1.energy
  check('كتم ميكروفون A يوقف وصول صوته', (await state(A)).muted === true && mutedEnergy < 0.001, `energy Δ=${mutedEnergy.toFixed(5)}`)

  // 6) إلغاء الكتم
  await A.evaluate(() => window.__voice.setMuted(false))
  await sleep(2000)
  const u1 = await inbound(B)
  await sleep(1500)
  const u2 = await inbound(B)
  check('إلغاء الكتم يعيد الصوت', u2.energy - u1.energy > 0.001, `energy Δ=${(u2.energy - u1.energy).toFixed(5)}`)

  // 7) كتم صوت الطرف الآخر محليًا
  await B.evaluate(() => window.__voice.setRemoteMuted(true))
  check('B يكتم صوت A محليًا فقط', (await state(B)).remoteMuted === true && (await state(A)).muted === false && (await B.evaluate(() => window.__voice.audio.muted)) === true)
  await B.evaluate(() => window.__voice.setRemoteMuted(false))

  // 8) لاعب دخيل لا يستطيع التدخل في المكالمة
  const beforePc = await B.evaluate(() => window.__voice.pc?.remoteDescription?.sdp?.length)
  await C.evaluate(() => window.__voice.startMic())
  await sleep(2500)
  const afterPc = await B.evaluate(() => window.__voice.pc?.remoteDescription?.sdp?.length)
  check('إشارات طرف ثالث تُتجاهل', beforePc === afterPc && (await state(B)).status === 'connected')
  await C.evaluate(() => window.__voice.hangup())

  // 9) إعادة الاتصال بعد إعادة ICE (محاكاة انقطاع الشبكة)
  await A.evaluate(() => window.__voice.pc.restartIce())
  const restarted = await waitFor(async () => (await state(A)).status === 'connected' && (await state(B)).status === 'connected', 15000)
  const r1 = await inbound(B)
  await sleep(1500)
  const r2 = await inbound(B)
  check('إعادة التفاوض (ICE restart) تحافظ على الصوت', restarted && r2.energy > r1.energy)

  // 10) الشريك أعاد تحميل الصفحة → اتصال جديد تلقائيًا لأن ميكروفون A يعمل
  await B.reload()
  await B.evaluate(([s, p]) => window.setup(s, p), [ids.B, ids.A])
  await A.evaluate(() => window.__voice.partnerGone())
  check('A يعرض حالة إعادة الاتصال عند غياب الشريك', (await state(A)).status === 'reconnecting')
  await A.evaluate(() => window.__voice.partnerBack())
  const rejoined = await waitFor(async () => (await state(B)).remoteAudio === true && (await state(A)).status === 'connected', 15000)
  await sleep(1000)
  const j1 = await inbound(B)
  await sleep(1500)
  const j2 = await inbound(B)
  check('بعد عودة الشريك يصله الصوت دون تشغيل ميكروفونه تلقائيًا', rejoined && j2.energy > j1.energy && (await state(B)).micOn === false)

  // 11) إنهاء المكالمة يوقف الميكروفون عند الطرفين
  await B.evaluate(() => window.__voice.startMic())
  await waitFor(async () => (await inbound(A))?.bytes > 1000)
  await A.evaluate(() => window.__voice.hangup())
  await sleep(1000)
  const sa = await state(A)
  const sb = await state(B)
  const tracksA = await A.evaluate(() => window.__voice.localStream === null && window.__voice.pc === null)
  const tracksB = await B.evaluate(() => window.__voice.localStream === null && window.__voice.pc === null)
  check('إنهاء المكالمة: الحالة متوقفة عند الطرفين', sa.status === 'idle' && sb.status === 'idle' && sb.endedByPartner === true)
  check('إنهاء المكالمة: مسارات الميكروفون أُغلقت عند الطرفين', tracksA && tracksB && !sa.micOn && !sb.micOn)
} catch (e) {
  check('خطأ غير متوقع', false, e.message)
}

// 12) رفض إذن الميكروفون
const deny = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream'] })
const D = await (await deny.newContext()).newPage()
await D.goto(url)
const cdp = await deny.newBrowserCDPSession()
await cdp.send('Browser.setPermission', { permission: { name: 'microphone' }, setting: 'denied', origin: url.replace(/\/$/, '') })
await D.evaluate(() => window.setup('dddddddd-0000-4000-8000-00000000000d', 'aaaaaaaa-0000-4000-8000-00000000000a'))
await D.evaluate(() => window.__voice.startMic())
const ds = await D.evaluate(() => window.__state)
check('رفض الإذن: رسالة واضحة والمكالمة لا تبدأ', ds.error === 'denied' && ds.micOn === false && ds.status === 'idle', `error=${ds.error}`)

await deny.close()
await browser.close()
server.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
