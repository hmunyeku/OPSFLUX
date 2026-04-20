import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props { children: React.ReactNode; fallback?: React.ReactNode }
interface State { hasError: boolean; error: Error | null }

/**
 * Root-level error boundary. Users rarely see this screen, but when
 * they do it needs to reassure them — not confront them with a raw
 * stack trace on a blank white page.
 *
 * Visual treatment aligns with the 2026 polish: warm gradient
 * backdrop, glassy card, Archivo heading, two recovery paths (retry
 * + home).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('ErrorBoundary caught:', error, info) }
  handleReset = () => this.setState({ hasError: false, error: null })
  handleHome = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/home'
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="relative flex items-center justify-center min-h-dvh p-4 bg-background overflow-hidden">
          {/* Same mesh backdrop as HomePage / LoginPage — keeps us
              on brand even when everything else is broken. Muted
              further via a vignette so the error card stays legible. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
            <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-destructive/25 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
            <div className="absolute -bottom-16 -right-16 h-96 w-96 rounded-full bg-[hsl(var(--highlight))]/20 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" style={{ animationDelay: '-4s' }} />
          </div>

          <div className="relative w-full max-w-md rounded-2xl border border-border/70 bg-card/90 backdrop-blur-md p-8 shadow-xl shadow-destructive/10 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200">
            {/* Tinted halo behind the icon */}
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-destructive/15 to-[hsl(var(--highlight))]/10 ring-1 ring-destructive/20 shadow-[0_10px_40px_-15px_hsl(var(--destructive)/0.3)]">
              <AlertTriangle size={32} className="text-destructive" strokeWidth={1.8} />
            </div>
            <h2 className="text-xl font-bold font-display tracking-tight">Une erreur est survenue</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
              {this.state.error?.message || 'Une erreur inattendue s\'est produite. L\'équipe technique a été notifiée.'}
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button onClick={this.handleReset} className="gl-button-sm gl-button-default">
                <RefreshCw size={13} /> Réessayer
              </button>
              <button onClick={this.handleHome} className="gl-button-sm gl-button-confirm">
                <Home size={13} /> Accueil
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
