function formatBytes(bytes: number): string {
  if (!bytes) return '0 o'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

interface FileStatusBarProps {
  stats: { total: number; files: number; dirs: number; totalSize: number }
  currentPath: string
  selectedCount: number
}

export function FileStatusBar({ stats, currentPath, selectedCount }: FileStatusBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground shrink-0 bg-muted/20 select-none">
      {selectedCount > 0 ? (
        <span className="font-medium text-primary">{selectedCount} sélectionné(s)</span>
      ) : (
        <>
          <span>{stats.total} élément{stats.total !== 1 ? 's' : ''}</span>
          <span className="text-border">|</span>
          <span>{stats.files} fichier{stats.files !== 1 ? 's' : ''}</span>
          <span className="text-border">|</span>
          <span>{stats.dirs} dossier{stats.dirs !== 1 ? 's' : ''}</span>
        </>
      )}
      <span className="ml-auto font-mono tabular-nums">{formatBytes(stats.totalSize)}</span>
      <span className="text-border">|</span>
      <span className="font-mono truncate max-w-[200px]" title={currentPath}>{currentPath}</span>
    </div>
  )
}
