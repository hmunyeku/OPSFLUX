/**
 * ImageEditor — Reusable image editing modal.
 *
 * Features:
 *  - Crop (drag to select area)
 *  - Rotate (90deg increments + free rotation slider)
 *  - Flip (horizontal/vertical)
 *  - Zoom slider
 *  - Canvas-based — no external dependencies
 *  - Returns edited image as Blob via onSave callback
 *
 * Usage:
 *   <ImageEditor
 *     open={showEditor}
 *     imageSrc={previewUrl}       // data:... or blob: URL
 *     onSave={(blob) => upload(blob)}
 *     onClose={() => setShowEditor(false)}
 *     aspectRatio={1}             // optional: force square crop (for avatars)
 *   />
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  ZoomIn,
  ZoomOut,
  Check,
  Loader2,
  Crop,
  RotateCcwSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageEditorProps {
  open: boolean
  imageSrc: string
  onSave: (blob: Blob) => void | Promise<void>
  onClose: () => void
  /** Force aspect ratio for crop (e.g. 1 for square, 16/9 for widescreen). */
  aspectRatio?: number
  /** Output format (default: 'image/png'). */
  outputFormat?: string
  /** Output quality for JPEG (0-1, default: 0.92). */
  outputQuality?: number
}

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export function ImageEditor({
  open,
  imageSrc,
  onSave,
  onClose,
  aspectRatio,
  outputFormat = 'image/png',
  outputQuality = 0.92,
}: ImageEditorProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [cropping, setCropping] = useState(false)
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const cropStart = useRef<{ x: number; y: number } | null>(null)

  // Load image
  useEffect(() => {
    if (!open || !imageSrc) return
    setLoaded(false)
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    setZoom(1)
    setCropRect(null)
    setCropping(false)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      setLoaded(true)
    }
    img.src = imageSrc
  }, [open, imageSrc])

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !loaded) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const container = containerRef.current
    const maxW = container ? container.clientWidth - 32 : 600
    const maxH = container ? container.clientHeight - 32 : 400

    // Compute display dimensions
    const isRotated90 = rotation % 180 !== 0
    const srcW = isRotated90 ? img.height : img.width
    const srcH = isRotated90 ? img.width : img.height

    const scale = Math.min(maxW / srcW, maxH / srcH, 1) * zoom
    const displayW = Math.round(srcW * scale)
    const displayH = Math.round(srcH * scale)

    canvas.width = displayW
    canvas.height = displayH

    ctx.clearRect(0, 0, displayW, displayH)
    ctx.save()
    ctx.translate(displayW / 2, displayH / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    ctx.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale)
    ctx.restore()

    // Draw crop overlay
    if (cropRect) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      // Top
      ctx.fillRect(0, 0, displayW, cropRect.y)
      // Bottom
      ctx.fillRect(0, cropRect.y + cropRect.h, displayW, displayH - cropRect.y - cropRect.h)
      // Left
      ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h)
      // Right
      ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, displayW - cropRect.x - cropRect.w, cropRect.h)
      // Border
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.setLineDash([])
    }
  }, [loaded, rotation, flipH, flipV, zoom, cropRect])

  useEffect(() => {
    draw()
  }, [draw])

  // Crop mouse handlers
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropping) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    cropStart.current = { x, y }
    setCropRect(null)
  }, [cropping])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropping || !cropStart.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const curX = Math.max(0, Math.min(canvas.width, e.clientX - rect.left))
    const curY = Math.max(0, Math.min(canvas.height, e.clientY - rect.top))

    let x = Math.min(cropStart.current.x, curX)
    let y = Math.min(cropStart.current.y, curY)
    let w = Math.abs(curX - cropStart.current.x)
    let h = Math.abs(curY - cropStart.current.y)

    if (aspectRatio && w > 0 && h > 0) {
      // Enforce aspect ratio
      const currentRatio = w / h
      if (currentRatio > aspectRatio) {
        w = h * aspectRatio
      } else {
        h = w / aspectRatio
      }
    }

    setCropRect({ x, y, w, h })
  }, [cropping, aspectRatio])

  const handleCanvasMouseUp = useCallback(() => {
    cropStart.current = null
  }, [])

  // Export
  const handleSave = useCallback(async () => {
    const img = imgRef.current
    if (!img) return

    setSaving(true)
    try {
      // Create output canvas at full resolution
      const outCanvas = document.createElement('canvas')
      const outCtx = outCanvas.getContext('2d')!

      const isRotated90 = rotation % 180 !== 0
      const fullW = isRotated90 ? img.height : img.width
      const fullH = isRotated90 ? img.width : img.height

      outCanvas.width = fullW
      outCanvas.height = fullH

      outCtx.translate(fullW / 2, fullH / 2)
      outCtx.rotate((rotation * Math.PI) / 180)
      outCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
      outCtx.drawImage(img, -img.width / 2, -img.height / 2)

      // Apply crop if set
      if (cropRect && canvasRef.current) {
        const displayCanvas = canvasRef.current
        const scaleX = fullW / displayCanvas.width
        const scaleY = fullH / displayCanvas.height

        const cx = Math.round(cropRect.x * scaleX)
        const cy = Math.round(cropRect.y * scaleY)
        const cw = Math.round(cropRect.w * scaleX)
        const ch = Math.round(cropRect.h * scaleY)

        const cropCanvas = document.createElement('canvas')
        cropCanvas.width = cw
        cropCanvas.height = ch
        const cropCtx = cropCanvas.getContext('2d')!
        cropCtx.drawImage(outCanvas, cx, cy, cw, ch, 0, 0, cw, ch)

        cropCanvas.toBlob(
          (blob) => {
            if (blob) onSave(blob)
            setSaving(false)
          },
          outputFormat,
          outputQuality,
        )
      } else {
        outCanvas.toBlob(
          (blob) => {
            if (blob) onSave(blob)
            setSaving(false)
          },
          outputFormat,
          outputQuality,
        )
      }
    } catch {
      setSaving(false)
    }
  }, [rotation, flipH, flipV, cropRect, onSave, outputFormat, outputQuality])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-xl border border-border shadow-2xl flex flex-col w-[90vw] max-w-3xl h-[85vh] max-h-[700px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-11 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">{t('shared.image_editor.title')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center bg-[#1a1a2e] dark:bg-[#0d0d1a] overflow-hidden p-4"
        >
          {!loaded ? (
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          ) : (
            <canvas
              ref={canvasRef}
              className={cn(
                'max-w-full max-h-full rounded shadow-lg',
                cropping && 'cursor-crosshair',
              )}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border shrink-0 bg-background-subtle">
          <div className="flex items-center gap-1">
            {/* Rotate */}
            <ToolBtn
              icon={RotateCcw}
              title="Pivoter -90°"
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            />
            <ToolBtn
              icon={RotateCw}
              title="Pivoter +90°"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            />

            <div className="w-px h-5 bg-border mx-1" />

            {/* Flip */}
            <ToolBtn
              icon={FlipHorizontal}
              title="Miroir horizontal"
              active={flipH}
              onClick={() => setFlipH((f) => !f)}
            />
            <ToolBtn
              icon={FlipVertical}
              title="Miroir vertical"
              active={flipV}
              onClick={() => setFlipV((f) => !f)}
            />

            <div className="w-px h-5 bg-border mx-1" />

            {/* Crop toggle */}
            <ToolBtn
              icon={Crop}
              title={cropping ? 'Annuler le recadrage' : 'Recadrer'}
              active={cropping}
              onClick={() => {
                setCropping((c) => !c)
                if (cropping) setCropRect(null)
              }}
            />
            {cropRect && (
              <ToolBtn
                icon={RotateCcwSquare}
                title={t('shared.reinitialiser_le_recadrage')}
                onClick={() => setCropRect(null)}
              />
            )}

            <div className="w-px h-5 bg-border mx-1" />

            {/* Zoom */}
            <ToolBtn
              icon={ZoomOut}
              title={t('shared.dezoomer')}
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))}
            />
            <span className="text-xs font-mono text-muted-foreground w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <ToolBtn
              icon={ZoomIn}
              title="Zoomer"
              onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            />
          </div>

          {/* Save / Cancel */}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="gl-button-sm gl-button-default">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !loaded}
              className="gl-button-sm gl-button-confirm"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              <span className="ml-1">Appliquer</span>
            </button>
          </div>
        </div>

        {/* Status bar */}
        {loaded && imgRef.current && (
          <div className="flex items-center gap-4 px-4 py-1 text-[10px] text-muted-foreground border-t border-border/50 bg-background">
            <span>{imgRef.current.width} × {imgRef.current.height} px</span>
            <span>Rotation : {rotation}°</span>
            {cropRect && <span>Recadrage : {Math.round(cropRect.w)} × {Math.round(cropRect.h)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Toolbar button ──────────────────────────────────────────

function ToolBtn({
  icon: Icon,
  title,
  onClick,
  active,
}: {
  icon: React.ElementType
  title: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'h-7 w-7 flex items-center justify-center rounded-md transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon size={14} />
    </button>
  )
}
