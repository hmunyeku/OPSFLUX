/**
 * SignaturePad — lightweight canvas-based electronic signature.
 *
 * Captures a hand-drawn signature on a canvas (mouse + touch + pen) and
 * exposes it as a base64 PNG data URL via `onChange(dataUrl)`. The value
 * (if provided) is rendered as an image; users can clear it to draw a
 * new one.
 *
 * Reusable anywhere — MOC signatories, contracts, inspections, etc.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SignaturePadProps {
  value?: string | null
  onChange: (dataUrl: string | null) => void
  width?: number
  height?: number
  disabled?: boolean
  label?: string
  /** Render in read-only / display mode when true — always shows the image
   *  and hides the drawing controls.
   */
  readOnly?: boolean
  className?: string
}

export function SignaturePad({
  value,
  onChange,
  width = 320,
  height = 120,
  disabled,
  label,
  readOnly,
  className,
}: SignaturePadProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [isEditing, setIsEditing] = useState(!value && !readOnly)

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setDrawing(true)
  }, [disabled])

  const move = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || disabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    e.preventDefault?.()
    const { x, y } = getPos(e)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
    ctx.lineTo(x, y)
    ctx.stroke()
  }, [drawing, disabled])

  const end = useCallback(() => {
    if (!drawing) return
    setDrawing(false)
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    onChange(dataUrl)
  }, [drawing, onChange])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    onChange(null)
  }, [onChange])

  // Initialise canvas bg once
  useEffect(() => {
    if (!isEditing) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [isEditing, width, height])

  // Display mode: show existing signature as an image
  if (!isEditing && value) {
    return (
      <div className={cn('space-y-1', className)}>
        {label && <div className="text-[10px] font-medium text-muted-foreground">{label}</div>}
        <div
          className="border border-border rounded bg-white"
          style={{ width, height }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Signature"
            className="w-full h-full object-contain"
          />
        </div>
        {!readOnly && !disabled && (
          <button
            type="button"
            onClick={() => {
              clear()
              setIsEditing(true)
            }}
            className="text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
          >
            <Eraser size={11} /> {t('common.clear')}
          </button>
        )}
      </div>
    )
  }

  // Empty + read-only → placeholder
  if (readOnly) {
    return (
      <div className={cn('space-y-1', className)}>
        {label && <div className="text-[10px] font-medium text-muted-foreground">{label}</div>}
        <div
          className="border border-dashed border-border rounded bg-muted/20 flex items-center justify-center text-[10px] text-muted-foreground italic"
          style={{ width, height }}
        >
          {t('common.not_signed', '— non signé —')}
        </div>
      </div>
    )
  }

  // Editing mode
  return (
    <div className={cn('space-y-1', className)}>
      {label && <div className="text-[10px] font-medium text-muted-foreground">{label}</div>}
      <canvas
        ref={canvasRef}
        className={cn(
          'border border-border rounded bg-white cursor-crosshair touch-none',
          disabled && 'opacity-50 pointer-events-none',
        )}
        style={{ width, height }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex items-center gap-2 text-[10px]">
        <button
          type="button"
          onClick={clear}
          className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
        >
          <Eraser size={11} /> {t('common.clear')}
        </button>
        <span className="text-muted-foreground/60 inline-flex items-center gap-1">
          <PenLine size={11} />
          {t('common.draw_hint', 'Cliquez et glissez pour signer')}
        </span>
      </div>
    </div>
  )
}
