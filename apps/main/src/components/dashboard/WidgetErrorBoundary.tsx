/**
 * Per-widget error boundary — prevents one broken widget from taking
 * down the entire dashboard.
 *
 * Why we need this in addition to the global ErrorBoundary at the app
 * root: a widget provider throwing (schema mismatch, null dereference
 * in a custom widget, etc.) would bubble up and kill the whole
 * dashboard tree, leaving the user on a "Something went wrong" screen
 * for their entire session. With this boundary wrapped around every
 * <WidgetCard>, the failing widget alone shows a compact error card
 * and the other 15 widgets keep refreshing as normal.
 *
 * The fallback intentionally stays inside the widget card's bounding
 * box (same background, same radius) so the dashboard layout is
 * preserved — no reflow, no empty slots.
 */
import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  /** Displayed in the fallback card header so the user knows which
   *  widget broke — e.g. "PAX on site" or the widget type id. */
  widgetLabel?: string
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Rendering error' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Tag the widget label in the console so we can tell which widget
    // broke from the error logs without inspecting the React tree.
    console.error(
      `[widget-error] ${this.props.widgetLabel || 'widget'}`,
      error,
      info.componentStack,
    )
  }

  private reset = () => this.setState({ hasError: false, message: '' })

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="h-full w-full rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="font-semibold truncate">
            {this.props.widgetLabel || 'Widget'} indisponible
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-3">
          {this.state.message || 'Erreur de rendu interne'}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="gl-button gl-button-sm gl-button-default w-fit text-[11px] mt-auto"
        >
          <RefreshCw size={10} /> Réessayer
        </button>
      </div>
    )
  }
}
