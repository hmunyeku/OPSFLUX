/**
 * ConfirmDialog — Custom confirmation dialog replacing browser confirm().
 *
 * Renders a centered modal with backdrop blur.
 * Supports configurable title, message, confirm/cancel labels, and variants.
 *
 * Usage (imperative via hook):
 *   const confirm = useConfirm()
 *   const ok = await confirm({
 *     title: 'Supprimer ?',
 *     message: 'Cette action est irréversible.',
 *     confirmLabel: 'Supprimer',
 *     variant: 'danger',
 *   })
 *   if (ok) { ... }
 *
 * Usage (declarative):
 *   <ConfirmDialog
 *     open={showConfirm}
 *     title="Supprimer ?"
 *     message="Cette action est irréversible."
 *     onConfirm={() => { ... }}
 *     onCancel={() => setShowConfirm(false)}
 *   />
 */
import { useState, useCallback, createContext, useContext, useRef, useEffect } from 'react'
import { AlertTriangle, Trash2, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────

type ConfirmVariant = 'default' | 'danger' | 'warning'

interface ConfirmOptions {
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface ConfirmContextValue {
  confirm: (options?: ConfirmOptions) => Promise<boolean>
}

// ── Context ────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm(): (options?: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx.confirm
}

// ── Provider ───────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    open: boolean
    options: ConfirmOptions
    resolve: ((value: boolean) => void) | null
  }>({
    open: false,
    options: {},
    resolve: null,
  })

  const confirm = useCallback((options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, options: options ?? {}, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state.resolve?.(true)
    setState({ open: false, options: {}, resolve: null })
  }, [state.resolve])

  const handleCancel = useCallback(() => {
    state.resolve?.(false)
    setState({ open: false, options: {}, resolve: null })
  }, [state.resolve])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <ConfirmDialog
          open
          title={state.options.title}
          message={state.options.message}
          confirmLabel={state.options.confirmLabel}
          cancelLabel={state.options.cancelLabel}
          variant={state.options.variant}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  )
}

// ── Declarative component ──────────────────────────────────

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  onConfirm: () => void
  onCancel: () => void
}

const variantConfig: Record<ConfirmVariant, {
  icon: typeof HelpCircle
  iconClass: string
  btnClass: string
}> = {
  default: {
    icon: HelpCircle,
    iconClass: 'text-primary',
    btnClass: 'gl-button-sm gl-button-confirm',
  },
  danger: {
    icon: Trash2,
    iconClass: 'text-destructive',
    btnClass: 'gl-button-sm bg-destructive text-destructive-foreground hover:bg-destructive/90',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-yellow-600 dark:text-yellow-400',
    btnClass: 'gl-button-sm bg-yellow-600 text-white hover:bg-yellow-700',
  },
}

export function ConfirmDialog({
  open,
  title = 'Confirmer',
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const config = variantConfig[variant]
  const Icon = config.icon

  // Auto-focus confirm button
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => confirmBtnRef.current?.focus())
    }
  }, [open])

  // ESC key handler
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in-0 duration-200"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative bg-gradient-to-br from-card to-card/80 border border-border/70 rounded-2xl shadow-2xl shadow-black/20 w-full max-w-sm mx-4 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent strip — matches Sidebar active + StatCard vocabulary */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary/80 via-primary to-highlight/40"
        />
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-2">
          <div className={cn('p-2 rounded-lg bg-muted/60 ring-1 ring-border/60', config.iconClass)}>
            <Icon size={18} />
          </div>
          <h3 className="text-sm font-semibold text-foreground font-display tracking-tight">{title}</h3>
        </div>

        {/* Message — whitespace-pre-line so callers can pass multi-line text */}
        {message && (
          <p className="px-4 pb-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line max-h-[60vh] overflow-y-auto">{message}</p>
        )}

        {/* Actions — cancel is hidden when cancelLabel is empty (info dialog) */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/60 bg-gradient-to-b from-transparent to-muted/30 rounded-b-2xl">
          {cancelLabel && (
            <button onClick={onCancel} className="gl-button-sm gl-button-default">
              {cancelLabel}
            </button>
          )}
          <button ref={confirmBtnRef} onClick={onConfirm} className={config.btnClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Prompt Dialog (replaces native prompt()) ────────────────

interface PromptOptions {
  title?: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
}

interface PromptContextValue {
  promptInput: (options?: PromptOptions) => Promise<string | null>
}

const PromptContext = createContext<PromptContextValue | null>(null)

export function usePromptInput(): (options?: PromptOptions) => Promise<string | null> {
  const ctx = useContext(PromptContext)
  if (!ctx) throw new Error('usePromptInput must be used within PromptProvider')
  return ctx.promptInput
}

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    open: boolean
    options: PromptOptions
    value: string
    resolve: ((value: string | null) => void) | null
  }>({ open: false, options: {}, value: '', resolve: null })

  const promptInput = useCallback((options?: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setState({ open: true, options: options ?? {}, value: options?.defaultValue ?? '', resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state.resolve?.(state.value)
    setState({ open: false, options: {}, value: '', resolve: null })
  }, [state.resolve, state.value])

  const handleCancel = useCallback(() => {
    state.resolve?.(null)
    setState({ open: false, options: {}, value: '', resolve: null })
  }, [state.resolve])

  return (
    <PromptContext.Provider value={{ promptInput }}>
      {children}
      {state.open && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in-0 duration-150"
          onClick={handleCancel}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-4 pb-2">
              <div className="p-2 rounded-lg bg-muted text-primary"><HelpCircle size={18} /></div>
              <h3 className="text-sm font-semibold text-foreground">{state.options.title || 'Saisir une valeur'}</h3>
            </div>
            {state.options.message && <p className="px-4 pb-2 text-sm text-muted-foreground">{state.options.message}</p>}
            <div className="px-4 pb-3">
              <input
                className="gl-form-input w-full text-sm"
                placeholder={state.options.placeholder || ''}
                value={state.value}
                onChange={(e) => setState(s => ({ ...s, value: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30 rounded-b-xl">
              <button onClick={handleCancel} className="gl-button-sm gl-button-default">{state.options.cancelLabel || 'Annuler'}</button>
              <button onClick={handleConfirm} className="gl-button-sm gl-button-confirm">{state.options.confirmLabel || 'Confirmer'}</button>
            </div>
          </div>
        </div>
      )}
    </PromptContext.Provider>
  )
}
