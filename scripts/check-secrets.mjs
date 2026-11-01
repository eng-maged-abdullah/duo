// يفحص ملفات المشروع وملفات البناء بحثًا عن مفاتيح سرية لا يجب نشرها
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['src', 'public', 'supabase', 'dist', 'index.html', '.env.example']
const skip = new Set(['node_modules', '.git'])
const patterns = [
  { name: 'Supabase secret key (sb_secret_)', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'service_role JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/, check: (m) => /service_role/.test(Buffer.from(m[1], 'base64url').toString()) },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Cloudflare API token assignment', re: /CF_TURN_API_TOKEN\s*=\s*['"]?[A-Za-z0-9_-]{20,}/ },
]

const files = []
const walk = (p) => {
  if (!existsSync(p)) return
  const st = statSync(p)
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) if (!skip.has(f)) walk(join(p, f))
  } else if (st.size < 5_000_000 && !/\.(png|jpg|woff2?|ico)$/.test(p)) files.push(p)
}
roots.forEach(walk)

let bad = 0
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  for (const p of patterns) {
    const m = text.match(p.re)
    if (m && (!p.check || p.check(m))) {
      console.error(`✗ ${f}: ${p.name}`)
      bad++
    }
  }
}
if (bad) {
  console.error(`\nوُجد ${bad} مفتاح/مفاتيح سرية. احذفها قبل النشر.`)
  process.exit(1)
}
console.log(`✓ لا توجد مفاتيح سرية في ${files.length} ملفًا`)
