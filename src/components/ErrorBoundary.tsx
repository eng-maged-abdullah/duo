import { Component, type ReactNode } from 'react'

/** يمنع أي خطأ غير متوقع من إظهار شاشة فارغة */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.error('[DUO]', e)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <div className="glass rounded-3xl p-6 max-w-sm text-center">
          <p className="font-display text-lg mb-2">حدث خطأ غير متوقع</p>
          <p className="text-mist text-sm mb-5">أعد تحميل الصفحة؛ سترجع إلى غرفتك تلقائيًا.</p>
          <button className="btn-primary text-white rounded-2xl h-12 px-6" onClick={() => window.location.reload()}>
            إعادة التحميل
          </button>
        </div>
      </div>
    )
  }
}
