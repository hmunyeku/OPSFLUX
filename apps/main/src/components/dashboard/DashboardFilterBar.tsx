/**
 * DashboardFilterBar — Shows active cross-filters as pills.
 *
 * Displayed above the widget grid when filters are active.
 * Each pill shows field name + value with a remove button.
 * A "Clear all" button resets all filters.
 */
import { Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardFilters } from './DashboardFilterContext'

export function DashboardFilterBar() {
  const { filters, removeFilter, clearFilters } = useDashboardFilters()

  if (filters.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/10 flex-wrap">
      <Filter className="h-3.5 w-3.5 text-primary/60 shrink-0" />
      <span className="text-[11px] font-medium text-primary/70 shrink-0">Filtres actifs</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {filters.map((f) => (
          <span
            key={f.field}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium',
              'bg-primary/10 text-primary border border-primary/20',
              'transition-all hover:bg-primary/15',
            )}
          >
            <span className="opacity-60">{f.label || f.field}:</span>
            <span className="font-semibold">{String(f.value)}</span>
            <button
              onClick={() => removeFilter(f.field)}
              className="ml-0.5 p-0.5 rounded-full hover:bg-primary/20 transition-colors"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      {filters.length > 1 && (
        <button
          onClick={clearFilters}
          className="text-[10px] text-primary/60 hover:text-primary underline ml-1"
        >
          Tout effacer
        </button>
      )}
    </div>
  )
}
