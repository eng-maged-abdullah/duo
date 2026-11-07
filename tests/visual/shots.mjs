// يلتقط صورًا للشاشات (جوال + كمبيوتر) للمراجعة المرئية
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright')
const base = process.env.BASE || 'http://localhost:5199'
const out = process.env.OUT || '/tmp/shots'
const views = (process.env.VIEWS || 'waiting,lobby,pair,pair-reveal,quick,emoji-reveal,text,who,memory,truth,number,story,sixty,results,chat').split(',')
const b = await chromium.launch()
const errs = []
for (const [label, vp] of [['m', { width: 390, height: 844 }], ['d', { width: 1366, height: 860 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(`${label} ${p.url()}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && errs.push(`${label} console: ${m.text()}`))
  for (const page of process.env.VIEWS ? [] : ['/', '/#/create', '/#/join/K7PX3M']) {
    await p.goto(base + page); await p.waitForTimeout(700)
    await p.screenshot({ path: `${out}/${label}-page${page.replace(/[^a-z0-9]/gi,'_')}.png`, fullPage: page === '/' })
  }
  for (const v of (label === 'm' ? views : (process.env.DESK || 'lobby,pair,memory,chat').split(','))) {
    await p.goto(`${base}/tests/visual/index.html?view=${v}${process.env.THEME ? '&theme=' + process.env.THEME : ''}`); await p.waitForTimeout(1100)
    if (v === 'drawguess-draw' || v === 'continue') {
      const c = await p.$('canvas'); const bb = await c.boundingBox()
      await p.mouse.move(bb.x + 60, bb.y + 200); await p.mouse.down()
      for (let i = 0; i <= 30; i++) await p.mouse.move(bb.x + 60 + i * 7, bb.y + 200 - Math.sin(i / 5) * 80)
      await p.mouse.up(); await p.waitForTimeout(300)
    }
    await p.screenshot({ path: `${out}/${label}-${v}.png` })
  }
  await ctx.close()
}
await b.close()
console.log(errs.length ? errs.join('\n---\n') : 'no page errors')
