import { ChevronRight, ArrowLeft } from 'lucide-react'

interface FileBreadcrumbsProps {
  breadcrumbs: { name: string; path: string }[]
  currentPath: string
  onNavigate: (path: string) => void
  onNavigateUp: () => void
}

export function FileBreadcrumbs({ breadcrumbs, currentPath, onNavigate, onNavigateUp }: FileBreadcrumbsProps) {
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none">
      {currentPath !== '/' && (
        <button onClick={onNavigateUp} className="gl-button gl-button-default shrink-0">
          <ArrowLeft size={14} />
        </button>
      )}
      {breadcrumbs.map((b, i) => (
        <span key={b.path} className="flex items-center gap-0.5 shrink-0">
          {i > 0 && <ChevronRight size={10} className="text-muted-foreground" />}
          <button
            onClick={() => onNavigate(b.path)}
            className={`text-xs transition-colors ${b.path === currentPath ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {b.name}
          </button>
        </span>
      ))}
    </div>
  )
}
