import { useTranslation } from 'react-i18next'
import { Folder, ChevronRight, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FSItem } from '../hooks/useFileManager'

interface FileTreeProps {
  rootDirs: FSItem[]
  currentPath: string
  expandedDirs: Set<string>
  getChildren: (parentPath: string) => FSItem[]
  onNavigate: (path: string) => void
  onToggleExpand: (path: string) => void
}

function TreeItem({ dir, depth, currentPath, expandedDirs, getChildren, onNavigate, onToggleExpand }: {
  dir: FSItem; depth: number
} & Omit<FileTreeProps, 'rootDirs'>) {
  const isExpanded = expandedDirs.has(dir.path)
  const isActive = currentPath === dir.path
  const children = getChildren(dir.path)
  const hasChildren = children.length > 0

  return (
    <div>
      <button
        onClick={() => { onNavigate(dir.path); onToggleExpand(dir.path) }}
        className={cn(
          'w-full flex items-center gap-1.5 py-1 px-2 text-xs rounded transition-colors text-left',
          isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? <ChevronRight size={10} className={cn('shrink-0 transition-transform', isExpanded && 'rotate-90')} /> : <span className="w-2.5" />}
        <Folder size={12} className="shrink-0" />
        <span className="truncate">{dir.name}</span>
      </button>
      {isExpanded && children.map(c => (
        <TreeItem key={c.path} dir={c} depth={depth + 1} currentPath={currentPath} expandedDirs={expandedDirs} getChildren={getChildren} onNavigate={onNavigate} onToggleExpand={onToggleExpand} />
      ))}
    </div>
  )
}

export function FileTree({ rootDirs, currentPath, expandedDirs, getChildren, onNavigate, onToggleExpand }: FileTreeProps) {
  const { t } = useTranslation()
  return (
    <div className="py-2">
      <button
        onClick={() => onNavigate('/')}
        className={cn(
          'w-full flex items-center gap-1.5 py-1 px-2 text-xs rounded transition-colors text-left',
          currentPath === '/' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
        )}
      >
        <HardDrive size={12} />
        <span>{t('common.root')}</span>
      </button>
      {rootDirs.map(d => (
        <TreeItem key={d.path} dir={d} depth={1} currentPath={currentPath} expandedDirs={expandedDirs} getChildren={getChildren} onNavigate={onNavigate} onToggleExpand={onToggleExpand} />
      ))}
    </div>
  )
}
