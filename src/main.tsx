import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import '@fontsource/ibm-plex-sans-arabic/latin-400.css'
import '@fontsource/readex-pro/arabic-500.css'
import '@fontsource/readex-pro/arabic-600.css'
import '@fontsource/readex-pro/latin-600.css'
import './styles/index.css'
import { App } from './app/App'
import { applyTheme } from './lib/theme'

applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// تطبيق ويب قابل للتثبيت: يخزّن الملفات الثابتة فقط، ولا يخزّن حالة الغرف
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
