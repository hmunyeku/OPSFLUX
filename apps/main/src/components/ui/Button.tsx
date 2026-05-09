/**
 * Button — Phase 2A
 *
 * Pajamas++ button. Drop-in replacement for btn across the app.
 *
 * Usage:
 *   <Button variant="primary">Save</Button>
 *   <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}>Add</Button>
 *   <Button variant="danger" loading={isDeleting}>Delete</Button>
 *   <Button asChild variant="tertiary">
 *     <Link to="/projects">Browse projects</Link>
 *   </Button>
 *
 * Accessibility:
 *   - aria-busy is set automatically while loading
 *   - disabled is forced true while loading (prevents double-submit)
 *   - aria-pressed is forwarded for toggle buttons
 *   - icon-only buttons MUST pass aria-label (use <IconButton/> for type-safety)
 *
 * Migration mapping for btn:
 *   variant="confirm"  category="primary"   → variant="primary"
 *   variant="default"  category="primary"   → variant="secondary"
 *   variant="default"  category="secondary" → variant="secondary"
 *   variant="default"  category="tertiary"  → variant="tertiary"
 *   variant="danger"   category="primary"   → variant="danger"
 *   variant="danger"   category="tertiary"  → variant="danger-tertiary"
 *   variant="link"                          → variant="link"
 *   size="small"                            → size="sm"
 *   size="medium" | unset                   → size="md"
 *   loading                                 → loading
 *   icon="plus"                             → iconLeft={<Plus/>}
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'danger'
  | 'danger-tertiary'
  | 'link'

export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Show a centered spinner and block clicks. disabled is forced. */
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  /** Render as the single child element (Radix Slot). Useful for <Link>. */
  asChild?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    asChild = false,
    fullWidth = false,
    disabled,
    className,
    type,
    children,
    ...rest
  },
  ref,
) {
  const Comp: any = asChild ? Slot : 'button'
  const isDisabled = disabled || loading

  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(
        'btn',
        `btn-${variant}`,
        size !== 'md' && `btn-${size}`,
        loading && 'btn-loading',
        fullWidth && 'w-full',
        className,
      )}
      disabled={asChild ? undefined : isDisabled}
      aria-disabled={asChild && isDisabled ? true : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {iconLeft}
      <span className="btn-label">{children}</span>
      {iconRight}
    </Comp>
  )
})
