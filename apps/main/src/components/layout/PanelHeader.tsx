/**
 * PanelHeader — Pajamas-style static panel header (40px).
 *
 * Pajamas: 14px semibold title, 28px toolbar buttons.
 */
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface PanelHeaderProps {
  icon?: LucideIcon
  title: string
  /** Inline element rendered right after the title — typically a count
      or status badge (Pajamas++ design pattern: "Tiers 248"). Wrapped
      with a muted color + tabular nums so it reads as metadata. */
  titleSuffix?: React.ReactNode
  subtitle?: string
  children?: React.ReactNode
}

export function PanelHeader({ icon: Icon, title, titleSuffix, subtitle, children }: PanelHeaderProps) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-border bg-background px-4 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          // Icon sits inside a soft primary-tinted chip — reads as a
          // proper page identifier rather than a floating glyph, and
          // lines up visually with the sidebar active item accent.
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/[0.08] ring-1 ring-inset ring-primary/10">
            <Icon size={14} className="text-primary" />
          </span>
        )}
        {/* Display font (Archivo) for page titles — gives the header
            a bit of character vs. all-Inter body. Wide letter shapes
            read well at 14px even with the grotesk weight. */}
        <h1 className="text-sm font-semibold text-foreground truncate font-display tracking-tight">
          {title}
          {titleSuffix !== undefined && (
            <span className="ml-2 text-muted-foreground font-normal tabular-nums">{titleSuffix}</span>
          )}
        </h1>
        {subtitle && (
          <>
            <span className="text-muted-foreground/60 text-xs">·</span>
            <span className="text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</span>
          </>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-1.5 shrink-0">
          {children}
        </div>
      )}
    </div>
  )
}

export function PanelContent({ children, className, scroll = true }: { children: React.ReactNode; className?: string; scroll?: boolean }) {
  return (
    <div className={cn(scroll ? 'flex-1 overflow-y-auto' : 'flex-1 flex flex-col min-h-0 overflow-hidden', className)}>
      {children}
    </div>
  )
}

interface ToolbarButtonProps {
  icon?: LucideIcon
  label: string
  onClick?: () => void
  variant?: 'default' | 'primary'
  disabled?: boolean
}

export function ToolbarButton({ icon: Icon, label, onClick, variant = 'default', disabled }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'btn-sm',
        variant === 'primary' ? 'btn-primary' : 'btn-secondary',
      )}
    >
      {Icon && <Icon size={14} />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
