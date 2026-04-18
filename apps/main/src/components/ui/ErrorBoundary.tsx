import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: React.ReactNode; fallback?: React.ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('ErrorBoundary caught:', error, info) }
  handleReset = () => this.setState({ hasError: false, error: null })
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <AlertTriangle size={32} className="text-destructive mb-3" strokeWidth={1.5} />
          <h2 className="text-base font-semibold mb-1">Une erreur est survenue</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">{this.state.error?.message || 'Erreur inconnue'}</p>
          <button onClick={this.handleReset} className="gl-button-sm gl-button-default">
            <RefreshCw size={13} /> Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
