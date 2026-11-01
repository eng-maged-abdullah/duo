// يلتقط صورًا للشاشات (جوال + كمبيوتر) للمراجعة المرئية
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright')
const base = process.env.BASE || 'http://localhost:5199'
const out = process.env.OUT || '/tmp/shots'
const views = ['waiting','lobby','pair','pair-reveal','quick','emoji-reveal','text','rank','who','memory','truth','number','story','sixty','results','chat']
const b = await chromium.launch()
const errs = []
for (const [label, vp] of [['m', { width: 390, height: 844 }], ['d', { width: 1366, height: 860 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(`${label} ${p.url()}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && errs.push(`${label} console: ${m.text()}`))
  for (const page of ['/', '/#/create', '/#/join/K7PX3M']) {
    await p.goto(base + page); await p.waitForTimeout(700)
    await p.screenshot({ path: `${out}/${label}-page${page.replace(/[^a-z0-9]/gi,'_')}.png`, fullPage: page === '/' })
  }
  for (const v of (label === 'm' ? views : ['lobby', 'pair', 'memory', 'chat'])) {
    await p.goto(`${base}/tests/visual/index.html?view=${v}`); await p.waitForTimeout(900)
    await p.screenshot({ path: `${out}/${label}-${v}.png` })
  }
  await ctx.close()
}
await b.close()
console.log(errs.length ? errs.join('\n---\n') : 'no page errors')
