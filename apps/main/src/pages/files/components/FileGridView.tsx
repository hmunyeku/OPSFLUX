import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Folder, FileText, Image, Film, FileArchive, File, Music, Loader2, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { FSItem } from '../hooks/useFileManager'

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']

/** Fetches an image via authenticated API and renders as blob URL. */
function AuthImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let revoke: string | null = null
    setError(false)
    setBlobUrl(null)
    api.get(src, { responseType: 'blob' })
      .then(({ data }) => {
        const url = URL.createObjectURL(data)
        revoke = url
        setBlobUrl(url)
      })
      .catch(() => setError(true))
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [src])

  if (error) return <Image size={32} className="text-muted-foreground/50" />
  if (!blobUrl) return <Loader2 size={16} className="animate-spin text-muted-foreground/30" />
  return <img src={blobUrl} alt={alt} className={className} loading="lazy" />
}

function getIcon(item: FSItem) {
  if (item.isDirectory) return Folder
  const ext = item.name.split('.').pop()?.toLowerCase() || ''
  if (IMAGE_EXT.includes(ext)) return Image
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return Film
  if (['mp3', 'wav', 'ogg'].includes(ext)) return Music
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return FileArchive
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'].includes(ext)) return FileText
  return File
}

interface FileGridViewProps {
  items: FSItem[]
  loading: boolean
  search: string
  isSelected: (path: string) => boolean
  focusedIndex: number
  apiBase: string
  onToggleSelect: (path: string, index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void
  onOpen: (item: FSItem) => void
  onContextMenu: (e: React.MouseEvent, item: FSItem) => void
}

export function FileGridView({
  items, loading, search, isSelected, focusedIndex, apiBase: _apiBase,
  onToggleSelect, onOpen, onContextMenu,
}: FileGridViewProps) {
  const { t } = useTranslation()
  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FolderOpen size={32} className="mb-2 opacity-30" />
        <p className="text-sm">{search ? t('files.aucun_resultat') : t('files.dossier_vide')}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-3">
      {items.map((item, idx) => {
        const Icon = getIcon(item)
        const selected = isSelected(item.path)
        const focused = idx === focusedIndex
        const ext = item.name.split('.').pop()?.toLowerCase() || ''
        const isImage = !item.isDirectory && IMAGE_EXT.includes(ext)

        return (
          <div
            key={item.path}
            className={cn(
              'border rounded-lg overflow-hidden transition-all cursor-pointer group relative',
              selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-border/80 hover:bg-muted/20',
              focused && 'ring-2 ring-primary/30',
            )}
            onClick={(e) => { onToggleSelect(item.path, idx, e); onOpen(item) }}
            onDoubleClick={() => item.isDirectory && onOpen(item)}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, item) }}
          >
            {/* Checkbox */}
            <div className={cn('absolute top-1.5 left-1.5 z-[1]', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity')}>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(item.path, idx, { shiftKey: false, ctrlKey: false, metaKey: false })}
                className="gl-checkbox"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Preview area */}
            <div className="h-24 flex items-center justify-center bg-muted/30 overflow-hidden">
              {isImage ? (
                <AuthImage
                  src={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Icon size={32} className={item.isDirectory ? 'text-amber-500' : 'text-muted-foreground/50'} />
              )}
            </div>

            {/* Name */}
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-foreground truncate" title={item.name}>{item.name}</p>
              {!item.isDirectory && <p className="text-[9px] text-muted-foreground uppercase">{ext}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
