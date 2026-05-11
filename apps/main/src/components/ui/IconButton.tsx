/**
 * IconButton — Phase 2A
 *
 * Square, icon-only button. Forces aria-label so screen readers announce
 * the purpose. Use for toolbars, table row actions, header glyphs.
 *
 * Usage:
 *   <IconButton aria-label="Settings" icon={<Settings className="w-4 h-4" />} />
 *   <IconButton aria-label="Delete row" variant="danger-tertiary" size="sm"
 *               icon={<Trash2 className="w-3.5 h-3.5" />} />
 */
import { forwardRef, type ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'
import { cn } from '@/lib/utils'

export interface IconButtonProps extends Omit<ButtonProps, 'iconLeft' | 'iconRight' | 'children' | 'fullWidth'> {
  icon: ReactNode
  /** Required — icon-only buttons need an accessible name. */
  'aria-label': string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, className, ...rest },
  ref,
) {
  return (
    <Button ref={ref} className={cn('btn-icon', className)} {...rest}>
      {icon}
    </Button>
  )
})
