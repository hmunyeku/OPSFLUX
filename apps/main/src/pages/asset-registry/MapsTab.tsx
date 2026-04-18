/**
 * MapsTab — KMZ import/export for the Asset Registry.
 *
 * Two panels side by side:
 *  - Export: download the entity's current assets as a KMZ file
 *    (Google Earth compatible) via GET /asset-registry/kmz/export.
 *  - Import: drag & drop a KMZ, parse it server-side and display a
 *    preview (counts per category + attribute schema + samples) via
 *    POST /asset-registry/kmz/preview. Committing the preview into
 *    the registry is a follow-up (requires field/site naming rules).
 */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Upload, FileWarning, Loader2, Check, X, Map as MapIcon } from 'lucide-react'
import { assetRegistryService, type KmzPreview } from '@/services/assetRegistryService'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

export function MapsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [preview, setPreview] = useState<KmzPreview | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.kmz')) {
      toast({ title: t('assets.kmz.errors.not_kmz'), variant: 'error' })
      return
    }
    setUploading(true)
    try {
      const result = await assetRegistryService.kmzPreview(file)
      setPreview(result)
      toast({
        title: t('assets.kmz.preview_ready'),
        description: `${result.source.placemark_count} placemarks analysés`,
        variant: 'success',
      })
    } catch (err) {
      const typed = err as { response?: { data?: { detail?: string } } }
      toast({
        title: t('assets.kmz.errors.parse_failed'),
        description: typed?.response?.data?.detail,
        variant: 'error',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await assetRegistryService.kmzExportBlob()
      // Browser-level download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'opsflux-assets.kmz'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: t('assets.kmz.export_ready'), variant: 'success' })
    } catch (err) {
      const typed = err as { response?: { data?: { detail?: string } } }
      toast({
        title: t('assets.kmz.errors.export_failed'),
        description: typed?.response?.data?.detail,
        variant: 'error',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MapIcon size={18} className="text-primary" />
              {t('assets.kmz.title')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('assets.kmz.description')}
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="gl-button-sm gl-button-primary shrink-0"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {t('assets.kmz.export_button')}
          </button>
        </div>

        {/* Upload zone */}
        <div
          className={cn(
            'rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/20',
            uploading && 'pointer-events-none opacity-60'
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".kmz"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files) }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={32} strokeWidth={1.5} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('assets.kmz.uploading')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={32} strokeWidth={1.5} className="text-muted-foreground" />
              <p className="text-sm font-medium">{t('assets.kmz.dropzone_title')}</p>
              <p className="text-xs text-muted-foreground">{t('assets.kmz.dropzone_hint')}</p>
            </div>
          )}
        </div>

        {/* Preview result */}
        {preview && (
          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <Check size={14} className="text-success-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{preview.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {preview.source.document_name} · {preview.source.placemark_count} placemarks · {preview.source.folder_count} folders
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="gl-button-sm gl-button-default !h-7 !w-7 !p-0 shrink-0"
                aria-label={t('common.close')}
              >
                <X size={12} />
              </button>
            </div>

            {/* Categories grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {(['platforms', 'wells', 'pipelines', 'cables', 'structures', 'bathymetry'] as const).map(cat => {
                const info = preview.categories[cat]
                return (
                  <div key={cat} className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">{t(`assets.kmz.categories.${cat}`)}</div>
                    <div className="mt-0.5 text-2xl font-bold text-foreground">{info.count}</div>
                    {info.attribute_keys && info.attribute_keys.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {info.attribute_keys.slice(0, 6).map(k => (
                          <span key={k} className="gl-badge gl-badge-neutral text-[10px]">{k}</span>
                        ))}
                        {info.attribute_keys.length > 6 && (
                          <span className="text-[10px] text-muted-foreground">+{info.attribute_keys.length - 6}</span>
                        )}
                      </div>
                    )}
                    {info.note && (
                      <div className="mt-2 text-[10px] text-muted-foreground italic">{info.note}</div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Next steps banner */}
            <div className="mx-4 mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <FileWarning size={14} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">{t('assets.kmz.import_pending_title')}</div>
                <div>{t('assets.kmz.import_pending_message')}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
