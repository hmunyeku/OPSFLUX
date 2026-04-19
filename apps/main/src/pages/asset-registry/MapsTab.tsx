/**
 * MapsTab — KMZ import/export for the Asset Registry.
 *
 * Workflow:
 *  1. User drops a KMZ → POST /kmz/preview → category summary card
 *  2. User picks a target OilField from a dropdown
 *  3. User clicks "Commit to database" → POST /kmz/import with field_id
 *     → displays the structured import report (created/matched/warnings)
 *  4. Optional: rollback the last import run via a ledger drawer
 *  5. Independent: Export current assets as KMZ (Google Earth compatible)
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download, Upload, FileWarning, Loader2, Check, X, Map as MapIcon,
  AlertTriangle, Undo2, ChevronDown, History,
} from 'lucide-react'
import {
  assetRegistryService,
  type KmzPreview,
  type KmzImportReport,
  type KmzImportRunSummary,
} from '@/services/assetRegistryService'
import type { OilField } from '@/types/assetRegistry'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'

export function MapsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<KmzPreview | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fields, setFields] = useState<OilField[]>([])
  const [selectedFieldId, setSelectedFieldId] = useState<string>('')
  const [report, setReport] = useState<KmzImportReport | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<KmzImportRunSummary[]>([])

  // Load fields once for the picker
  useEffect(() => {
    assetRegistryService.listFields({ page: 1, page_size: 100 }).then(
      (res) => setFields(res.items),
      () => setFields([]),
    )
  }, [])

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.kmz')) {
      toast({ title: t('assets.kmz.errors.not_kmz'), variant: 'error' })
      return
    }
    setUploading(true)
    setPendingFile(file)
    setReport(null)
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
      setPendingFile(null)
    } finally {
      setUploading(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await assetRegistryService.kmzExportBlob()
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

  const handleCommit = async () => {
    if (!pendingFile || !selectedFieldId) return
    const ok = await confirm({
      title: t('assets.kmz.commit_confirm_title'),
      message: t('assets.kmz.commit_confirm_message'),
      confirmLabel: t('assets.kmz.commit_button'),
      variant: 'warning',
    })
    if (!ok) return
    setImporting(true)
    try {
      const result = await assetRegistryService.kmzImport(pendingFile, selectedFieldId)
      setReport(result)
      toast({
        title: t('assets.kmz.import_success'),
        description: `${result.installations.created} installations · ${result.wells.created} wells · ${result.pipelines.created} pipelines`,
        variant: 'success',
      })
    } catch (err) {
      const typed = err as { response?: { data?: { detail?: string } } }
      toast({
        title: t('assets.kmz.errors.import_failed'),
        description: typed?.response?.data?.detail,
        variant: 'error',
      })
    } finally {
      setImporting(false)
    }
  }

  const handleLoadHistory = async () => {
    setShowHistory(true)
    try {
      const runs = await assetRegistryService.listKmzImportRuns()
      setHistory(runs)
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }

  const handleRollback = async (runId: string) => {
    const ok = await confirm({
      title: t('assets.kmz.rollback_confirm_title'),
      message: t('assets.kmz.rollback_confirm_message'),
      confirmLabel: t('assets.kmz.rollback_button'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await assetRegistryService.rollbackKmzImport(runId)
      toast({ title: res.detail, variant: 'success' })
      const runs = await assetRegistryService.listKmzImportRuns()
      setHistory(runs)
    } catch (err) {
      const typed = err as { response?: { data?: { detail?: string } } }
      toast({ title: t('common.error'), description: typed?.response?.data?.detail, variant: 'error' })
    }
  }

  const clearPreview = () => {
    setPreview(null)
    setPendingFile(null)
    setReport(null)
    setSelectedFieldId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
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
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleLoadHistory} className="gl-button-sm gl-button-default">
              <History size={13} /> {t('assets.kmz.history_button')}
            </button>
            <button onClick={handleExport} disabled={exporting} className="gl-button-sm gl-button-primary">
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {t('assets.kmz.export_button')}
            </button>
          </div>
        </div>

        {/* Upload zone (hidden once preview exists) */}
        {!preview && (
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
        )}

        {/* Preview result */}
        {preview && !report && (
          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <Check size={14} className="text-green-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{preview.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {preview.source.document_name} · {preview.source.placemark_count} placemarks · {preview.source.folder_count} folders
                  </div>
                </div>
              </div>
              <button onClick={clearPreview} className="gl-button-sm gl-button-default !h-7 !w-7 !p-0 shrink-0">
                <X size={12} />
              </button>
            </div>

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

            {/* Field picker + commit */}
            <div className="border-t border-border px-4 py-3 bg-background-subtle">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                    {t('assets.kmz.commit_field_label')}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedFieldId}
                      onChange={(e) => setSelectedFieldId(e.target.value)}
                      className="w-full h-9 px-2.5 pr-8 rounded-md border border-border bg-background text-sm appearance-none"
                    >
                      <option value="">{t('assets.kmz.commit_field_placeholder')}</option>
                      {fields.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.code} — {f.name} ({f.country})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <button
                  onClick={handleCommit}
                  disabled={!selectedFieldId || importing || !pendingFile}
                  className="gl-button-sm gl-button-primary"
                >
                  {importing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {t('assets.kmz.commit_button')}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t('assets.kmz.commit_hint')}
              </p>
            </div>
          </div>
        )}

        {/* Import report */}
        {report && (
          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Check size={14} className="text-green-600" />
                <div className="text-sm font-semibold">{t('assets.kmz.report_title')}</div>
              </div>
              <button onClick={clearPreview} className="gl-button-sm gl-button-default">
                {t('assets.kmz.report_reset')}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
              {(['sites', 'installations', 'wells', 'pipelines'] as const).map(cat => {
                const stats = report[cat] as { created: number; matched: number; errors: number; skipped?: number }
                return (
                  <div key={cat} className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">{t(`assets.kmz.categories.${cat}`)}</div>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <div className="text-2xl font-bold text-green-600">{stats.created}</div>
                      <div className="text-xs text-muted-foreground">{t('assets.kmz.report_created')}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      <span>{stats.matched} {t('assets.kmz.report_matched')}</span>
                      {typeof stats.skipped === 'number' && stats.skipped > 0 && (
                        <span className="text-amber-700">{stats.skipped} {t('assets.kmz.report_skipped')}</span>
                      )}
                      {stats.errors > 0 && (
                        <span className="text-destructive">{stats.errors} {t('assets.kmz.report_errors')}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {report.warnings.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 mb-2">
                  <AlertTriangle size={12} />
                  {t('assets.kmz.report_warnings_title')} ({report.warnings.length})
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {report.warnings.map((w, i) => (
                    <div key={i} className="text-[11px] flex items-start gap-2 py-1">
                      <span className="gl-badge gl-badge-warning shrink-0">{w.kind}</span>
                      <span className="font-mono text-muted-foreground">{w.name}</span>
                      <span className="text-muted-foreground">— {w.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {report.field.import_run_id && (
              <div className="border-t border-border px-4 py-2 bg-background-subtle flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-mono">run #{report.field.import_run_id.slice(0, 8)}</span>
                <button
                  onClick={() => handleRollback(report.field.import_run_id!)}
                  className="gl-button-sm gl-button-default"
                >
                  <Undo2 size={12} /> {t('assets.kmz.rollback_button')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* History drawer */}
        {showHistory && (
          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <History size={14} /> {t('assets.kmz.history_title')}
              </div>
              <button onClick={() => setShowHistory(false)} className="gl-button-sm gl-button-default !h-7 !w-7 !p-0">
                <X size={12} />
              </button>
            </div>
            {history.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{t('assets.kmz.history_empty')}</div>
            ) : (
              <div className="divide-y divide-border">
                {history.map(run => (
                  <div key={run.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {run.source_filename || run.document_name || run.id.slice(0, 8)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {run.created_at && new Date(run.created_at).toLocaleString('fr-FR')}
                        {run.rolled_back_at && ` · ${t('assets.kmz.history_rolled_back')}`}
                        {run.report && ` · ${run.report.installations.created + run.report.wells.created + run.report.pipelines.created} assets`}
                      </div>
                    </div>
                    {!run.rolled_back_at && (
                      <button onClick={() => handleRollback(run.id)} className="gl-button-sm gl-button-default shrink-0">
                        <Undo2 size={12} /> {t('assets.kmz.rollback_button')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!preview && !report && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
            <FileWarning size={14} className="shrink-0 mt-0.5" />
            <div>{t('assets.kmz.import_ready_hint')}</div>
          </div>
        )}
      </div>
    </div>
  )
}
