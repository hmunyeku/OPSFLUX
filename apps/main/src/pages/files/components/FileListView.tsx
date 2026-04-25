import { Folder, FileText, Image, Film, FileArchive, File, Music, ArrowUp, ArrowDown, Loader2, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FSItem, SortField, SortDir } from '../hooks/useFileManager'

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getIcon(item: FSItem) {
  if (item.isDirectory) return Folder
  const ext = item.name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return Image
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return Film
  if (['mp3', 'wav', 'ogg'].includes(ext)) return Music
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return FileArchive
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'].includes(ext)) return FileText
  return File
}

interface FileListViewProps {
  items: FSItem[]
  loading: boolean
  search: string
  isSelected: (path: string) => boolean
  allSelected: boolean
  focusedIndex: number
  sortBy: SortField
  sortDir: SortDir
  onToggleSort: (field: SortField) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleSelect: (path: string, index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void
  onOpen: (item: FSItem) => void
  onContextMenu: (e: React.MouseEvent, item: FSItem) => void
}

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: SortDir }) {
  if (field !== sortBy) return null
  return sortDir === 'asc' ? <ArrowUp size={10} className="inline ml-0.5" /> : <ArrowDown size={10} className="inline ml-0.5" />
}

export function FileListView({
  items, loading, search, isSelected, allSelected, focusedIndex,
  sortBy, sortDir, onToggleSort, onSelectAll, onClearSelection,
  onToggleSelect, onOpen, onContextMenu,
}: FileListViewProps) {
  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FolderOpen size={32} className="mb-2 opacity-30" />
        <p className="text-sm">{search ? 'Aucun résultat' : 'Dossier vide'}</p>
      </div>
    )
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border text-[10px] font-semibold text-muted-foreground uppercase sticky top-0 bg-background z-[1]">
          <th className="w-8 px-2 py-1.5">
            <input
              type="checkbox"
              checked={allSelected && items.length > 0}
              onChange={() => allSelected ? onClearSelection() : onSelectAll()}
              className="gl-checkbox"
            />
          </th>
          <th className="text-left px-3 py-1.5 cursor-pointer select-none hover:text-foreground" onClick={() => onToggleSort('name')}>
            Nom <SortIcon field="name" sortBy={sortBy} sortDir={sortDir} />
          </th>
          <th className="text-left px-3 py-1.5 w-28 cursor-pointer select-none hover:text-foreground hidden sm:table-cell" onClick={() => onToggleSort('size')}>
            Taille <SortIcon field="size" sortBy={sortBy} sortDir={sortDir} />
          </th>
          <th className="text-left px-3 py-1.5 w-40 cursor-pointer select-none hover:text-foreground hidden md:table-cell" onClick={() => onToggleSort('date')}>
            Modifié <SortIcon field="date" sortBy={sortBy} sortDir={sortDir} />
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => {
          const Icon = getIcon(item)
          const selected = isSelected(item.path)
          const focused = idx === focusedIndex

          return (
            <tr
              key={item.path}
              className={cn(
                'border-b border-border/30 transition-colors cursor-pointer group',
                selected ? 'bg-primary/5' : 'hover:bg-muted/30',
                focused && 'ring-2 ring-primary/30 ring-inset',
              )}
              onClick={(e) => {
                onToggleSelect(item.path, idx, e)
                onOpen(item)
              }}
              onDoubleClick={() => item.isDirectory && onOpen(item)}
              onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, item) }}
            >
              <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(item.path, idx, { shiftKey: false, ctrlKey: false, metaKey: false })}
                  className="gl-checkbox"
                  onClick={(e) => e.stopPropagation()}
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                    item.isDirectory ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-muted/50'
                  )}>
                    <Icon size={16} className={item.isDirectory ? 'text-amber-600' : 'text-muted-foreground'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    {!item.isDirectory && <p className="text-[10px] text-muted-foreground">{item.name.split('.').pop()?.toUpperCase()}</p>}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums hidden sm:table-cell">{item.isDirectory ? '—' : formatBytes(item.size || 0)}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums hidden md:table-cell">{formatDate(item.updatedAt)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
