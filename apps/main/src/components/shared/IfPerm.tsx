/**
 * <IfPerm> — conditional render gated by a single RBAC permission.
 *
 * Replaces the ubiquitous pattern:
 *
 *   const canFoo = hasPermission('foo.bar.manage')
 *   ...
 *   {canFoo && <Button>...</Button>}
 *
 * with the more declarative:
 *
 *   <IfPerm code="foo.bar.manage">
 *     <Button>...</Button>
 *   </IfPerm>
 *
 * Benefits:
 *   - Fewer one-off `const can...` lines cluttering component bodies.
 *   - Grep-friendly: `rg "IfPerm code=\"foo\""` surfaces every place
 *     a given permission gates UI.
 *   - Optional `fallback` lets you show a hint ("Admin only") instead
 *     of nothing, without an else-branch in JSX.
 *   - Accepts an array of codes for multi-permission AND (all must
 *     be held) or OR (any of them) via `mode`.
 *
 * For the common "render a disabled version instead of hiding" case,
 * use the <IfPermDisabled> variant which injects `disabled` + a
 * tooltip when the user lacks the permission.
 */
import type { ReactNode } from 'react'
import { usePermission } from '@/hooks/usePermission'

interface IfPermProps {
  /** Permission code, or an array for composite checks. */
  code: string | string[]
  /** Matching logic when `code` is an array. Default: 'all'. */
  mode?: 'all' | 'any'
  /** Rendered when the user holds the permission(s). */
  children: ReactNode
  /** Rendered when the user is missing the permission(s). Omit → null. */
  fallback?: ReactNode
}

export function IfPerm({ code, mode = 'all', children, fallback = null }: IfPermProps) {
  const { hasPermission } = usePermission()
  const codes = Array.isArray(code) ? code : [code]
  if (codes.length === 0) return <>{children}</>
  const ok = mode === 'any'
    ? codes.some((c) => hasPermission(c))
    : codes.every((c) => hasPermission(c))
  return <>{ok ? children : fallback}</>
}
