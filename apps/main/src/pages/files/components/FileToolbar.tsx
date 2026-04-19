import { Search, LayoutList, LayoutGrid, RefreshCw, FolderPlus, Upload, Trash2, Filter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ViewMode, FileFilter } from '../hooks/useFileManager'

const FILTER_OPTIONS: { value: FileFilter; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'image', label: 'Images' },
  { value: 'document', label: 'Documents' },
  { value: 'video', label: 'Vidéos' },
  { value: 'audio', label: 'Audio' },
  { value: 'archive', label: 'Archives' },
]

interface FileToolbarProps {
  search: string
  onSearchChange: (v: string) => void
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  filterType: FileFilter
  onFilterChange: (v: FileFilter) => void
  selectedCount: number
  onBatchDelete: () => void
  onCreateFolder: () => void
  onUpload: (files: FileList | null) => void
  onRefresh: () => void
}

export function FileToolbar({
  search, onSearchChange, viewMode, onViewModeChange,
  filterType, onFilterChange, selectedCount,
  onBatchDelete, onCreateFolder, onUpload, onRefresh,
}: FileToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[120px] max-w-xs">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filtrer..."
          className="gl-form-input text-xs pl-8 w-full h-7"
          autoComplete="off"
        />
      </div>

      {/* Filter */}
      <div className="relative">
        <Filter size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <select
          value={filterType}
          onChange={(e) => onFilterChange(e.target.value as FileFilter)}
          className="gl-form-input text-xs h-7 pl-7 pr-6 appearance-none cursor-pointer"
        >
          {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* View toggle */}
      <div className="flex items-center border border-border rounded-md overflow-hidden">
        <button
          onClick={() => onViewModeChange('list')}
          className={cn('p-1.5 transition-colors', viewMode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted')}
          title="Vue liste"
        >
          <LayoutList size={13} />
        </button>
        <button
          onClick={() => onViewModeChange('grid')}
          className={cn('p-1.5 transition-colors', viewMode === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted')}
          title="Vue grille"
        >
          <LayoutGrid size={13} />
        </button>
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-border" />

      {/* Actions */}
      <button onClick={onRefresh} className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Actualiser">
        <RefreshCw size={13} />
      </button>
      <button onClick={onCreateFolder} className="p-1.5 rounded hover:bg-accent text-muted-foreground" title={t('files.nouveau_dossier')}>
        <FolderPlus size={13} />
      </button>
      <label className="p-1.5 rounded hover:bg-accent text-muted-foreground cursor-pointer" title="Uploader">
        <Upload size={13} />
        <input type="file" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
      </label>

      {/* Batch actions */}
      {selectedCount > 0 && (
        <>
          <div className="h-5 w-px bg-border" />
          <span className="text-[10px] text-primary font-medium">{selectedCount} sélectionné(s)</span>
          <button onClick={onBatchDelete} className="gl-button-sm gl-button-danger" title={t('files.supprimer_la_selection')}>
            <Trash2 size={11} /> Supprimer
          </button>
        </>
      )}
    </div>
  )
}
