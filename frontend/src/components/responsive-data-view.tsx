import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ResponsiveDataViewProps {
  /**
   * Vue mobile (affichée sur petit écran)
   * Généralement une liste de cartes
   */
  mobileView: ReactNode

  /**
   * Vue desktop (affichée sur grand écran)
   * Généralement une DataTable
   */
  desktopView: ReactNode

  /**
   * Breakpoint où switcher de mobile à desktop
   * @default 'md' (768px)
   */
  breakpoint?: 'sm' | 'md' | 'lg' | 'xl'

  /**
   * Classes additionnelles
   */
  className?: string
}

/**
 * Composant pour gérer l'affichage responsive des données
 * Affiche des cartes sur mobile et une table sur desktop
 *
 * @example
 * ```tsx
 * <ResponsiveDataView
 *   mobileView={
 *     <div className="space-y-3">
 *       {items.map(item => <ItemCard key={item.id} item={item} />)}
 *     </div>
 *   }
 *   desktopView={
 *     <DataTable columns={columns} data={items} />
 *   }
 * />
 * ```
 */
export function ResponsiveDataView({
  mobileView,
  desktopView,
  breakpoint = 'md',
  className,
}: ResponsiveDataViewProps) {
  const breakpoints = {
    sm: 'sm:hidden',
    md: 'md:hidden',
    lg: 'lg:hidden',
    xl: 'xl:hidden',
  }

  const showFromBreakpoints = {
    sm: 'hidden sm:block',
    md: 'hidden md:block',
    lg: 'hidden lg:block',
    xl: 'hidden xl:block',
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile View */}
      <div className={cn('block', breakpoints[breakpoint])}>
        {mobileView}
      </div>

      {/* Desktop View */}
      <div className={cn(showFromBreakpoints[breakpoint])}>
        {desktopView}
      </div>
    </div>
  )
}

/**
 * Exemple de composant Card pour mobile
 * À personnaliser selon les besoins
 */
interface DataCardProps {
  title: string
  description?: string
  metadata?: Array<{ label: string; value: React.ReactNode }>
  actions?: ReactNode
  className?: string
}

export function DataCard({
  title,
  description,
  metadata = [],
  actions,
  className,
}: DataCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 text-card-foreground shadow-sm',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>

      {metadata.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 mt-3 text-sm">
          {metadata.map((item, index) => (
            <div key={index}>
              <dt className="text-muted-foreground text-xs">{item.label}</dt>
              <dd className="font-medium mt-0.5">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
