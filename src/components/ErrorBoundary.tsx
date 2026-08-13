import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans">
        <div className="glass rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-negative-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-negative-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-2xl text-ink-900 tracking-tight mb-2">Något gick fel</h1>
          <p className="text-sm text-ink-500 mb-6 leading-relaxed">
            Ett oväntat fel uppstod. Försök igen. Om problemet kvarstår, kontakta support.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-xs bg-ink-50 border border-ink-100 rounded-xl p-4 mb-5 overflow-auto text-negative-600 max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-3">
            <button
              onClick={this.reset}
              className="flex-1 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl shadow-md shadow-brand-500/20 hover:opacity-90 active:scale-[0.98] transition-[transform,opacity,box-shadow] duration-150"
            >
              Försök igen
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard' }}
              className="flex-1 px-4 py-2.5 bg-ink-100 text-ink-700 text-sm font-semibold rounded-xl hover:bg-ink-200 transition-colors"
            >
              Till startsidan
            </button>
          </div>
        </div>
      </div>
    )
  }
}
