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
  subtitle?: string
  children?: React.ReactNode
}

export function PanelHeader({ icon: Icon, title, subtitle, children }: PanelHeaderProps) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-border bg-background px-4 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon size={16} className="text-muted-foreground shrink-0" />}
        <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
        {subtitle && (
          <>
            <span className="text-muted-foreground text-xs">·</span>
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

export function PanelContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 overflow-y-auto', className)}>
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
        'gl-button-sm',
        variant === 'primary' ? 'gl-button-confirm' : 'gl-button-default',
      )}
    >
      {Icon && <Icon size={14} />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
