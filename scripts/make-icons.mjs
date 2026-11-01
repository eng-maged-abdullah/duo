// يولّد أيقونات PNG من icon.svg (يُشغَّل مرة واحدة عند تغيير الشعار)
// node scripts/make-icons.mjs   (يحتاج مكتبة sharp)
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require(process.env.SHARP_PATH || 'sharp')
const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url))
const out = (n) => new URL(`../public/icons/${n}`, import.meta.url).pathname

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out(name))
}

// أيقونة maskable: الشعار داخل منطقة آمنة 80% على خلفية كاملة
const inner = await sharp(svg, { density: 384 }).resize(400, 400).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0d0714' } })
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toFile(out('icon-maskable-512.png'))
console.log('icons done')
