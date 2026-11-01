import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { ToastProvider } from '../components/ui/Toast'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { HomePage } from '../pages/HomePage'
import { CreatePage, JoinPage } from '../pages/EntryPages'
import { RoomPage } from '../pages/RoomPage'

/** HashRouter يجعل الروابط تعمل على GitHub Pages دون إعداد خادم */
export function App() {
  return (
    <ErrorBoundary>
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="/join" element={<JoinPage />} />
            <Route path="/join/:code" element={<JoinPage />} />
            <Route path="/room/:code" element={<RoomPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </MotionConfig>
    </ErrorBoundary>
  )
}
