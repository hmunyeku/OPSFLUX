import { lazy, Suspense, ComponentType } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Wrapper pour lazy loading de composants avec fallback Skeleton
 * Utile pour les composants lourds (charts, editors, etc.)
 */
export function lazyLoadComponent<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  fallback?: React.ReactNode
) {
  const LazyComponent = lazy(importFunc)

  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={fallback || <Skeleton className="h-full w-full" />}>
      <LazyComponent {...props} />
    </Suspense>
  )
}

/**
 * Fallback spécifique pour les charts
 */
export const ChartFallback = () => (
  <Skeleton className="h-64 w-full rounded-lg" />
)

/**
 * Fallback spécifique pour les editors
 */
export const EditorFallback = () => (
  <Skeleton className="h-96 w-full rounded-lg" />
)

/**
 * Fallback spécifique pour les tables
 */
export const TableFallback = () => (
  <div className="space-y-3">
    {Array.from({ length: 5 }).map((_, i) => (
      <Skeleton key={i} className="h-12 w-full" />
    ))}
  </div>
)
