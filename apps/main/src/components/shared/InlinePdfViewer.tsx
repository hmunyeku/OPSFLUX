/**
 * InlinePdfViewer — modal wrapper around an <iframe> rendering a PDF
 * blob URL. Closes the "Pour l'instant Papyrus télécharge pour voir"
 * gap from MODULE_ANALYSIS §14 without pulling in a 500 KB pdf.js
 * bundle — every current browser ships a built-in PDF renderer.
 *
 * Fetches the PDF bytes with the user's auth token (so we work with
 * permission-gated endpoints), converts to an object URL, and pipes
 * into an iframe. The blob URL is revoked on close to avoid memory
 * leaks on subsequent re-opens.
 *
 * Usage:
 *   <InlinePdfViewer
 *     url="/api/v1/papyrus/.../export/pdf?inline=true"
 *     title="DOC-2026-0042"
 *     onClose={() => setOpen(false)}
 *   />
 */
import { useEffect, useRef, useState } from 'react'
import { Download, X, ExternalLink, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface Props {
  /** Absolute or relative API URL that returns application/pdf. */
  url: string
  /** Shown in the modal header. Defaults to "Aperçu PDF". */
  title?: string
  /** Suggested filename for the "Télécharger" action. */
  downloadName?: string
  onClose: () => void
  className?: string
}

export function InlinePdfViewer({ url, title, downloadName, onClose, className }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const blobRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setBlobUrl(null)
    ;(async () => {
      try {
        const resp = await api.get(url, { responseType: 'blob' })
        if (cancelled) return
        const obj = URL.createObjectURL(resp.data)
        blobRef.current = obj
        setBlobUrl(obj)
      } catch (err: unknown) {
        if (cancelled) return
        const msg = (err as { message?: string })?.message || 'Impossible de charger le PDF'
        setError(msg)
      }
    })()
    return () => {
      cancelled = true
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [url])

  const handleDownload = () => {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = downloadName || 'document.pdf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleOpenTab = () => {
    if (!blobUrl) return
    window.open(blobUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className={cn('bg-card border border-border rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col', className)}>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <span className="text-sm font-medium text-foreground truncate flex-1">
            {title ?? 'Aperçu PDF'}
          </span>
          {blobUrl && (
            <>
              <button
                type="button"
                onClick={handleOpenTab}
                className="gl-button-sm gl-button-default"
                title="Ouvrir dans un nouvel onglet"
              >
                <ExternalLink size={12} />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="gl-button-sm gl-button-default"
                title="Télécharger"
              >
                <Download size={12} /> Télécharger
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="gl-button-sm gl-button-default !w-7 !p-0 flex items-center justify-center"
            aria-label="Fermer"
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-muted/30">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-sm text-destructive gap-2">
              <AlertTriangle size={20} />
              <span>{error}</span>
            </div>
          ) : !blobUrl ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <iframe
              src={blobUrl}
              title={title ?? 'PDF'}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  )
}
