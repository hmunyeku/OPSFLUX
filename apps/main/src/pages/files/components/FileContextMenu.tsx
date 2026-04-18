import { Eye, Download, Pencil, Copy, Trash2, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FSItem } from '../hooks/useFileManager'

interface FileContextMenuProps {
  position: { x: number; y: number }
  item: FSItem
  downloadUrl: string
  onClose: () => void
  onOpen: (item: FSItem) => void
  onRename: (item: FSItem) => void
  onDelete: (item: FSItem) => void
  onCopyPath: (item: FSItem) => void
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left ${
        danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-foreground hover:bg-accent'
      }`}
    >
      <Icon size={13} className="shrink-0" />
      <span>{label}</span>
    </button>
  )
}

export function FileContextMenu({ position, item, downloadUrl, onClose, onOpen, onRename, onDelete, onCopyPath }: FileContextMenuProps) {
  const { t } = useTranslation()
  // Clamp position to viewport
  const menuW = 180
  const menuH = item.isDirectory ? 140 : 180
  const x = Math.min(position.x, window.innerWidth - menuW - 8)
  const y = Math.min(position.y, window.innerHeight - menuH - 8)

  return (
    <div className="fixed inset-0 z-[250]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div
        className="absolute bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[180px] animate-in fade-in-0 zoom-in-95"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        {item.isDirectory ? (
          <MenuItem icon={FolderOpen} label="Ouvrir" onClick={() => { onClose(); onOpen(item) }} />
        ) : (
          <>
            <MenuItem icon={Eye} label="Aperçu" onClick={() => { onClose(); onOpen(item) }} />
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
              onClick={onClose}
            >
              <Download size={13} className="shrink-0" />
              <span>Télécharger</span>
            </a>
          </>
        )}
        <div className="h-px bg-border my-1" />
        <MenuItem icon={Pencil} label="Renommer" onClick={() => { onClose(); onRename(item) }} />
        <MenuItem icon={Copy} label="Copier le chemin" onClick={() => { onCopyPath(item); onClose() }} />
        <div className="h-px bg-border my-1" />
        <MenuItem icon={Trash2} label={t('common.delete')} onClick={() => { onClose(); onDelete(item) }} danger />
      </div>
    </div>
  )
}
