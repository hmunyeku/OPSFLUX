/**
 * DrawioEditor — iframe-based Draw.io / diagrams.net editor.
 *
 * - Communicates with the Draw.io editor via window.postMessage (proto=json).
 * - Loads XML content from props on init.
 * - Saves XML back via onSave callback.
 * - Toolbar: Save, Export SVG, Export PDF.
 * - URL is configurable: self-hosted (default http://localhost:8080) or SaaS (https://embed.diagrams.net).
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import { Save, FileImage, FileDown, Loader2, X } from 'lucide-react'

export interface DrawioEditorProps {
  /** XML content to load into the editor */
  xmlContent?: string | null
  /** Callback when the user saves from the Draw.io editor */
  onSave: (xml: string) => void
  /** Base URL for the Draw.io editor instance */
  drawioUrl?: string
  /** Callback to close/dismiss the editor */
  onClose?: () => void
}

export function DrawioEditor({
  xmlContent,
  onSave,
  drawioUrl = 'http://localhost:8080',
  onClose,
}: DrawioEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // ── PostMessage handler ─────────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Only process messages that look like Draw.io JSON protocol
      if (typeof event.data !== 'string') return
      let data: Record<string, unknown>
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }

      switch (data.event) {
        case 'init':
          // Editor is ready — load initial XML content
          setIsReady(true)
          if (xmlContent) {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ action: 'load', xml: xmlContent }),
              '*',
            )
          }
          break

        case 'save':
          // User triggered save from within the editor
          if (typeof data.xml === 'string') {
            onSave(data.xml)
          }
          break

        case 'export':
          // Export result (SVG/PDF) — trigger browser download
          if (typeof data.data === 'string' && typeof data.format === 'string') {
            const ext = data.format === 'svg' ? 'svg' : 'pdf'
            const mime = data.format === 'svg' ? 'image/svg+xml' : 'application/pdf'
            const blob = data.format === 'svg'
              ? new Blob([data.data], { type: mime })
              : (() => {
                  const binary = atob(data.data as string)
                  const bytes = new Uint8Array(binary.length)
                  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                  return new Blob([bytes], { type: mime })
                })()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `diagram.${ext}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }
          break

        case 'autosave':
          // Auto-save event from the editor
          if (typeof data.xml === 'string') {
            onSave(data.xml)
          }
          break
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [xmlContent, onSave])

  // ── Toolbar actions ─────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return
    setIsSaving(true)
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ action: 'export', format: 'xml', spin: 'Saving...' }),
      '*',
    )
    // The save callback will be handled in the message handler
    setTimeout(() => setIsSaving(false), 1000)
  }, [])

  const handleExportSvg = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ action: 'export', format: 'svg' }),
      '*',
    )
  }, [])

  const handleExportPdf = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ action: 'export', format: 'pdf' }),
      '*',
    )
  }, [])

  // Build the iframe URL with Draw.io embed parameters
  const iframeSrc = `${drawioUrl}?embed=1&proto=json&spin=1&modified=unsavedChanges&saveAndExit=0`

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-background shrink-0">
        <button
          className="gl-button-sm gl-button-confirm"
          onClick={handleSave}
          disabled={!isReady || isSaving}
          title="Sauvegarder"
        >
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          <span>Sauvegarder</span>
        </button>
        <button
          className="gl-button-sm gl-button-default"
          onClick={handleExportSvg}
          disabled={!isReady}
          title="Exporter SVG"
        >
          <FileImage size={12} />
          <span>Exporter SVG</span>
        </button>
        <button
          className="gl-button-sm gl-button-default"
          onClick={handleExportPdf}
          disabled={!isReady}
          title="Exporter PDF"
        >
          <FileDown size={12} />
          <span>Exporter PDF</span>
        </button>
        <div className="flex-1" />
        {!isReady && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Chargement de l&apos;editeur...
          </span>
        )}
        {onClose && (
          <button className="gl-button-sm gl-button-default" onClick={onClose} title="Fermer">
            <X size={12} />
            <span>Fermer</span>
          </button>
        )}
      </div>

      {/* Draw.io iframe */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="flex-1 w-full border-none"
        style={{ minHeight: 0 }}
        title="Draw.io Editor"
      />
    </div>
  )
}
