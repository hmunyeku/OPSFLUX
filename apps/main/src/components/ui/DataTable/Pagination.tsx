/**
 * DataTable — compact pagination footer (GitLab Pajamas style, 28px height).
 */
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DataTablePagination } from './types'

interface PaginationProps {
  pagination: DataTablePagination
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

export function DataTablePaginationBar({
  pagination,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: PaginationProps) {
  const { page, pageSize, total, pages } = pagination
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  if (total === 0) return null

  return (
    <div className="flex items-center justify-between border-t border-border px-3 h-7 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {start}–{end} sur {total.toLocaleString('fr-FR')}
        </span>

        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="text-[11px] bg-transparent border border-border rounded px-1 py-0 text-foreground h-5 cursor-pointer"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-0">
        <NavButton disabled={page <= 1} onClick={() => onPageChange(1)} title="Première page">
          <ChevronsLeft size={12} />
        </NavButton>
        <NavButton disabled={page <= 1} onClick={() => onPageChange(page - 1)} title="Précédent">
          <ChevronLeft size={12} />
        </NavButton>

        {generatePageNumbers(page, pages).map((p, i) => (
          p === '...' ? (
            <span key={`e-${i}`} className="px-0.5 text-[10px] text-muted-foreground/50">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={cn(
                'min-w-[22px] h-[22px] rounded text-[11px] font-medium transition-colors tabular-nums',
                p === page
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {p}
            </button>
          )
        ))}

        <NavButton disabled={page >= pages} onClick={() => onPageChange(page + 1)} title="Suivant">
          <ChevronRight size={12} />
        </NavButton>
        <NavButton disabled={page >= pages} onClick={() => onPageChange(pages)} title="Dernière page">
          <ChevronsRight size={12} />
        </NavButton>
      </div>
    </div>
  )
}

function NavButton({ disabled, onClick, title, children }: {
  disabled: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        'p-0.5 rounded text-muted-foreground transition-colors',
        disabled ? 'opacity-25 cursor-not-allowed' : 'hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}
