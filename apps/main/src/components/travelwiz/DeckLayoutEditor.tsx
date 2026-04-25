/**
 * DeckLayoutEditor -- Visual deck surface layout for cargo placement.
 *
 * Renders a rectangular deck surface and positions cargo items as colored blocks.
 * Supports basic drag-and-drop repositioning with mouse events.
 * Color-coded: hazmat=red border, heavy=dark gray, normal=blue, urgent=orange.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  AlertTriangle, CheckCircle2, Loader2, Wand2, Weight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DeckLayout, DeckLayoutItem, DeckLayoutValidation } from '@/types/api'
import { useSuggestDeckLayout, useValidateDeckLayout } from '@/hooks/useTravelWiz'

// ── Types ────────────────────────────────────────────────────

interface CargoMeta {
  cargo_item_id: string
  description: string
  weight_kg: number
  is_hazmat: boolean
  is_urgent: boolean
  is_heavy: boolean
}

interface DeckLayoutEditorProps {
  tripId: string
  deckSurfaceId: string
  /** Deck surface dimensions in metres */
  deckWidth: number
  deckLength: number
  /** Maximum cargo weight in kg */
  maxWeightKg: number
  /** Current layout items */
  layout: DeckLayout | null
  /** Cargo metadata for display */
  cargoMeta: CargoMeta[]
  /** Callback when an item is repositioned */
  onItemMove?: (cargoItemId: string, newX: number, newY: number) => void
}

// ── Constants ────────────────────────────────────────────────

const SCALE = 20 // pixels per metre
const MIN_BLOCK_SIZE = 20

function getBlockColor(meta: CargoMeta | undefined): { bg: string; border: string } {
  if (!meta) return { bg: 'bg-muted', border: 'border-border' }
  if (meta.is_hazmat) return { bg: 'bg-red-100 dark:bg-red-950', border: 'border-red-500' }
  if (meta.is_urgent) return { bg: 'bg-orange-100 dark:bg-orange-950', border: 'border-orange-500' }
  if (meta.is_heavy) return { bg: 'bg-gray-300 dark:bg-gray-700', border: 'border-gray-600' }
  return { bg: 'bg-blue-100 dark:bg-blue-950', border: 'border-blue-500' }
}

// ── DeckLayoutEditor Component ───────────────────────────────

export function DeckLayoutEditor({
  tripId,
  deckSurfaceId,
  deckWidth,
  deckLength,
  maxWeightKg,
  layout,
  cargoMeta,
  onItemMove,
}: DeckLayoutEditorProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<{
    cargoItemId: string
    startX: number
    startY: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const [localItems, setLocalItems] = useState<DeckLayoutItem[]>([])
  const [validation, setValidation] = useState<DeckLayoutValidation | null>(null)

  const suggestLayout = useSuggestDeckLayout()
  const validateLayout = useValidateDeckLayout()

  // Sync layout items from props
  useEffect(() => {
    if (layout?.items) {
      setLocalItems(layout.items)
    }
  }, [layout])

  const metaMap = new Map(cargoMeta.map((m) => [m.cargo_item_id, m]))

  const pixelWidth = Math.max(deckWidth * SCALE, 200)
  const pixelLength = Math.max(deckLength * SCALE, 300)

  // Weight calculations
  const totalWeight = cargoMeta.reduce((sum, m) => sum + (m.weight_kg || 0), 0)
  const portWeight = localItems.reduce((sum, item) => {
    const meta = metaMap.get(item.cargo_item_id)
    if (!meta) return sum
    return item.position_x < deckWidth / 2 ? sum + meta.weight_kg : sum
  }, 0)
  const starboardWeight = totalWeight - portWeight
  const weightPct = maxWeightKg > 0 ? Math.round((totalWeight / maxWeightKg) * 100) : 0

  // ── Drag handlers ──────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent, cargoItemId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return

    const item = localItems.find((i) => i.cargo_item_id === cargoItemId)
    if (!item) return

    const itemPxX = item.position_x * SCALE
    const itemPxY = item.position_y * SCALE
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    setDragState({
      cargoItemId,
      startX: item.position_x,
      startY: item.position_y,
      offsetX: mouseX - itemPxX,
      offsetY: mouseY - itemPxY,
    })
  }, [localItems])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState || !surfaceRef.current) return
    const rect = surfaceRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const newPxX = mouseX - dragState.offsetX
    const newPxY = mouseY - dragState.offsetY
    const newX = Math.max(0, Math.min(deckWidth, newPxX / SCALE))
    const newY = Math.max(0, Math.min(deckLength, newPxY / SCALE))

    setLocalItems((prev) =>
      prev.map((item) =>
        item.cargo_item_id === dragState.cargoItemId
          ? { ...item, position_x: newX, position_y: newY }
          : item,
      ),
    )
  }, [dragState, deckWidth, deckLength])

  const handleMouseUp = useCallback(() => {
    if (!dragState) return
    const item = localItems.find((i) => i.cargo_item_id === dragState.cargoItemId)
    if (item && onItemMove) {
      onItemMove(item.cargo_item_id, item.position_x, item.position_y)
    }
    setDragState(null)
  }, [dragState, localItems, onItemMove])

  // ── Actions ────────────────────────────────────────────────

  const handleAutoSuggest = async () => {
    try {
      const result = await suggestLayout.mutateAsync({ tripId, deckSurfaceId })
      if (result.items) {
        setLocalItems(result.items)
      }
    } catch {
      // handled by mutation error
    }
  }

  const handleValidate = async () => {
    try {
      const result = await validateLayout.mutateAsync({ tripId, deckSurfaceId })
      setValidation(result)
    } catch {
      // handled by mutation error
    }
  }

  return (
    <div className="space-y-3">
      {/* Weight distribution bar */}
      <div className="rounded-lg border border-border bg-background p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Poids total</span>
          <span className={cn(
            'font-medium tabular-nums',
            weightPct > 100 ? 'text-destructive' : weightPct > 85 ? 'text-amber-500' : 'text-foreground',
          )}>
            {totalWeight.toLocaleString('fr-FR')} / {maxWeightKg.toLocaleString('fr-FR')} kg ({weightPct}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-border overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              weightPct > 100 ? 'bg-destructive' : weightPct > 85 ? 'bg-amber-500' : 'bg-primary',
            )}
            style={{ width: `${Math.min(100, weightPct)}%` }}
          />
        </div>

        {/* Port / Starboard balance */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="flex-1 text-left">
            <Weight size={10} className="inline mr-0.5" />
            Babord: {portWeight.toLocaleString('fr-FR')} kg
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex-1 text-right">
            Tribord: {starboardWeight.toLocaleString('fr-FR')} kg
            <Weight size={10} className="inline ml-0.5" />
          </div>
        </div>
      </div>

      {/* Deck surface */}
      <div
        ref={surfaceRef}
        className="relative border-2 border-border rounded-lg bg-muted/30 overflow-hidden cursor-crosshair"
        style={{ width: pixelWidth, height: pixelLength }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Center line */}
        <div
          className="absolute top-0 bottom-0 border-l border-dashed border-border/50"
          style={{ left: pixelWidth / 2 }}
        />

        {/* Grid lines */}
        {Array.from({ length: Math.floor(deckWidth) }).map((_, i) => (
          <div
            key={`vgrid-${i}`}
            className="absolute top-0 bottom-0 border-l border-border/20"
            style={{ left: (i + 1) * SCALE }}
          />
        ))}
        {Array.from({ length: Math.floor(deckLength) }).map((_, i) => (
          <div
            key={`hgrid-${i}`}
            className="absolute left-0 right-0 border-t border-border/20"
            style={{ top: (i + 1) * SCALE }}
          />
        ))}

        {/* Cargo blocks */}
        {localItems.map((item) => {
          const meta = metaMap.get(item.cargo_item_id)
          const colors = getBlockColor(meta)
          const blockW = Math.max(item.width * SCALE, MIN_BLOCK_SIZE)
          const blockH = Math.max(item.height * SCALE, MIN_BLOCK_SIZE)
          const isDragging = dragState?.cargoItemId === item.cargo_item_id

          return (
            <div
              key={item.cargo_item_id}
              className={cn(
                'absolute border-2 rounded-sm flex items-center justify-center select-none transition-shadow',
                colors.bg, colors.border,
                isDragging ? 'shadow-lg ring-2 ring-primary z-10 cursor-grabbing' : 'cursor-grab hover:shadow-md',
              )}
              style={{
                left: item.position_x * SCALE,
                top: item.position_y * SCALE,
                width: blockW,
                height: blockH,
              }}
              onMouseDown={(e) => handleMouseDown(e, item.cargo_item_id)}
              title={meta ? `${meta.description} (${meta.weight_kg} kg)` : item.cargo_item_id}
            >
              <span className="text-[8px] font-medium text-foreground leading-none text-center px-0.5 truncate">
                {item.description || meta?.description?.slice(0, 8) || ''}
              </span>
            </div>
          )
        })}

        {/* Labels */}
        <span className="absolute top-1 left-1 text-[8px] text-muted-foreground/60 select-none">Babord</span>
        <span className="absolute top-1 right-1 text-[8px] text-muted-foreground/60 select-none">Tribord</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground/60 select-none">Proue</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          className="gl-button-sm gl-button-default text-xs inline-flex items-center gap-1"
          onClick={handleAutoSuggest}
          disabled={suggestLayout.isPending}
        >
          {suggestLayout.isPending ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          Auto-suggestion
        </button>
        <button
          className="gl-button-sm gl-button-confirm text-xs inline-flex items-center gap-1"
          onClick={handleValidate}
          disabled={validateLayout.isPending}
        >
          {validateLayout.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Valider
        </button>
      </div>

      {/* Validation results */}
      {validation && (
        <div className={cn(
          'rounded-lg border p-3 text-xs space-y-1',
          validation.valid ? 'border-green-500/50 bg-green-50 dark:bg-green-950/30' : 'border-destructive/50 bg-red-50 dark:bg-red-950/30',
        )}>
          <div className="flex items-center gap-1.5 font-medium">
            {validation.valid ? (
              <><CheckCircle2 size={12} className="text-green-600" /> Disposition valide</>
            ) : (
              <><AlertTriangle size={12} className="text-destructive" /> Disposition invalide</>
            )}
          </div>
          {validation.errors.map((err, i) => (
            <p key={`err-${i}`} className="text-destructive ml-4">- {err}</p>
          ))}
          {validation.warnings.map((warn, i) => (
            <p key={`warn-${i}`} className="text-amber-600 dark:text-amber-400 ml-4">- {warn}</p>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border-2 border-red-500 bg-red-100 dark:bg-red-950" /> HAZMAT</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border-2 border-gray-600 bg-gray-300 dark:bg-gray-700" /> Lourd</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border-2 border-blue-500 bg-blue-100 dark:bg-blue-950" /> Normal</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border-2 border-orange-500 bg-orange-100 dark:bg-orange-950" /> Urgent</span>
      </div>
    </div>
  )
}
