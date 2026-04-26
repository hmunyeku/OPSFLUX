/**
 * VariablePobEditor — Spreadsheet-like editor for the daily POB schedule of
 * a variable-mode planner activity. Replaces the previous one-input-per-row
 * table with a denser, keyboard-driven grid that supports range selection,
 * bulk fill, +/− nudges and pattern fills (weekdays/weekends only, custom
 * day ranges, etc.).
 *
 * Reusable: takes startDate / endDate / value / onChange. Stores keys as
 * UTC YYYY-MM-DD to stay aligned with the rest of the planner.
 */
import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Minus, Trash2, Copy, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────

function utcDateKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateUTC(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

function buildDayList(startISO: string, endISO: string): Array<{ key: string; date: Date; weekday: number }> {
  const out: Array<{ key: string; date: Date; weekday: number }> = []
  const start = parseDateUTC(startISO)
  const end = parseDateUTC(endISO)
  if (end < start) return out
  const cur = new Date(start)
  let safety = 0
  while (cur <= end) {
    out.push({ key: utcDateKey(cur), date: new Date(cur), weekday: cur.getUTCDay() })
    cur.setUTCDate(cur.getUTCDate() + 1)
    if (++safety > 3650) break // ~10 years cap
  }
  return out
}

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const WEEKDAY_FULL = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

// ── Component ────────────────────────────────────────────────

export interface VariablePobEditorProps {
  /** Inclusive start date (YYYY-MM-DD or any string parseable as ISO date) */
  startDate: string
  /** Inclusive end date */
  endDate: string
  /** Current daily values, keys = UTC YYYY-MM-DD */
  value: Record<string, number> | null | undefined
  /** Called whenever the user edits a cell (or batch operation) */
  onChange: (next: Record<string, number>) => void
  /** Default value used by Fill / +1 nudge when a cell is empty */
  defaultValue?: number
  /** Compact mode (smaller cells, denser typography) */
  compact?: boolean
}

export function VariablePobEditor({
  startDate,
  endDate,
  value,
  onChange,
  defaultValue = 0,
  compact = false,
}: VariablePobEditorProps) {
  const { t } = useTranslation()
  const days = useMemo(() => buildDayList(startDate, endDate), [startDate, endDate])
  const valueMap = value || {}

  // ── Selection model ──
  // Anchor + lead define a contiguous range [min..max] over day indices.
  const [anchor, setAnchor] = useState<number | null>(null)
  const [lead, setLead] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selRange = useMemo(() => {
    if (anchor == null || lead == null) return null
    const lo = Math.min(anchor, lead)
    const hi = Math.max(anchor, lead)
    return { lo, hi }
  }, [anchor, lead])

  const isSelected = useCallback((idx: number) => {
    if (!selRange) return false
    return idx >= selRange.lo && idx <= selRange.hi
  }, [selRange])

  const selectedKeys = useMemo(() => {
    if (!selRange) return [] as string[]
    return days.slice(selRange.lo, selRange.hi + 1).map((d) => d.key)
  }, [days, selRange])

  // ── Bulk operations ──
  const setRange = useCallback((keys: string[], updater: (current: number) => number) => {
    if (keys.length === 0) return
    const next = { ...valueMap }
    for (const k of keys) {
      next[k] = Math.max(0, Math.round(updater(next[k] ?? defaultValue)))
    }
    onChange(next)
  }, [valueMap, onChange, defaultValue])

  const fillSelectionWith = useCallback((v: number) => {
    setRange(selectedKeys, () => v)
  }, [selectedKeys, setRange])

  const nudge = useCallback((delta: number) => {
    setRange(selectedKeys, (cur) => cur + delta)
  }, [selectedKeys, setRange])

  const clearSelection = useCallback(() => {
    if (selectedKeys.length === 0) return
    const next = { ...valueMap }
    for (const k of selectedKeys) delete next[k]
    onChange(next)
  }, [selectedKeys, valueMap, onChange])

  const fillAllWith = useCallback((v: number, predicate?: (d: typeof days[number]) => boolean) => {
    const next = { ...valueMap }
    for (const d of days) {
      if (!predicate || predicate(d)) next[d.key] = v
    }
    onChange(next)
  }, [days, valueMap, onChange])

  const fillWeekdaysOnly = useCallback((v: number) => {
    fillAllWith(v, (d) => d.weekday >= 1 && d.weekday <= 5)
  }, [fillAllWith])

  const fillWeekendsOnly = useCallback((v: number) => {
    fillAllWith(v, (d) => d.weekday === 0 || d.weekday === 6)
  }, [fillAllWith])

  const copyValueToSelection = useCallback(() => {
    if (anchor == null) return
    const src = valueMap[days[anchor]?.key ?? ''] ?? defaultValue
    fillSelectionWith(src)
  }, [anchor, days, valueMap, defaultValue, fillSelectionWith])

  // ── Per-cell editable inputs (Excel-like behavior) ──
  // Each cell carries its own ref so paste / drag-fill / arrow nav can
  // hand keyboard focus to the right input without re-rendering.
  const cellRefs = useRef<(HTMLInputElement | null)[]>([])

  // Update a single cell value (or clear if v is null/empty).
  const setSingleCell = useCallback((idx: number, raw: string) => {
    const key = days[idx]?.key
    if (!key) return
    const next = { ...valueMap }
    if (raw === '' || raw == null) {
      delete next[key]
    } else {
      const n = Number(raw.replace(',', '.').trim())
      if (!Number.isFinite(n)) return
      next[key] = Math.max(0, Math.round(n))
    }
    onChange(next)
  }, [days, valueMap, onChange])

  // Parse a clipboard string and write the values starting at `startIdx`,
  // distributing across following cells. Supports:
  //   - Tab-separated (Excel paste)
  //   - Comma / semicolon separated
  //   - Whitespace separated (space, newline)
  //   - Decimal comma -> dot
  // Empty tokens are skipped (the cell is left untouched).
  const writePastedValues = useCallback((startIdx: number, text: string) => {
    const tokens = text
      .replace(/\r/g, '')
      .split(/[\t,;\s]+/u)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (tokens.length === 0) return
    const next = { ...valueMap }
    let cursor = startIdx
    for (const tok of tokens) {
      if (cursor >= days.length) break
      const n = Number(tok.replace(',', '.'))
      if (Number.isFinite(n)) next[days[cursor].key] = Math.max(0, Math.round(n))
      cursor++
    }
    onChange(next)
    // Move focus to the last written cell so the user can keep typing.
    requestAnimationFrame(() => {
      const last = Math.min(days.length - 1, cursor - 1)
      cellRefs.current[last]?.focus()
      cellRefs.current[last]?.select()
      setAnchor(last); setLead(last)
    })
  }, [days, valueMap, onChange])

  // Cell-level keyboard nav between inputs. Mirrors the parent's
  // selection nav but operates on the focused input directly.
  const handleCellKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    const max = days.length - 1
    let target: number | null = null
    if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      target = Math.min(max, idx + 1)
    } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      target = Math.max(0, idx - 1)
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      target = Math.min(max, idx + 7)
    } else if (e.key === 'ArrowUp') {
      target = Math.max(0, idx - 7)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // Only intercept when the input is empty — otherwise let the
      // user delete characters normally.
      if ((e.target as HTMLInputElement).value === '') {
        e.preventDefault()
        setSingleCell(idx, '')
      }
      return
    }
    if (target != null) {
      e.preventDefault()
      cellRefs.current[target]?.focus()
      cellRefs.current[target]?.select()
      setAnchor(target); setLead(target)
    }
  }, [days.length, setSingleCell])

  // ── Drag-to-fill (Excel autofill handle) ──
  // When the user mousedowns on the small handle in the focused cell
  // and drags over neighbouring cells, fill them with the source
  // cell's value. Released → commits.
  const dragFillRef = useRef<{ from: number; sourceVal: number } | null>(null)
  const [dragFillTo, setDragFillTo] = useState<number | null>(null)

  const startDragFill = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const sourceVal = valueMap[days[idx]?.key ?? ''] ?? defaultValue ?? 0
    dragFillRef.current = { from: idx, sourceVal }
    setDragFillTo(idx)
  }, [days, valueMap, defaultValue])

  useEffect(() => {
    if (!dragFillRef.current) return
    const onMove = (e: MouseEvent) => {
      if (!dragFillRef.current) return
      const target = (e.target as HTMLElement | null)?.closest('[data-pob-cell]') as HTMLElement | null
      const idxAttr = target?.getAttribute('data-pob-cell')
      if (idxAttr) setDragFillTo(Number(idxAttr))
    }
    const onUp = () => {
      const ref = dragFillRef.current
      if (ref && dragFillTo != null) {
        const [lo, hi] = [Math.min(ref.from, dragFillTo), Math.max(ref.from, dragFillTo)]
        const next = { ...valueMap }
        for (let i = lo; i <= hi; i++) {
          const k = days[i]?.key
          if (k) next[k] = ref.sourceVal
        }
        onChange(next)
      }
      dragFillRef.current = null
      setDragFillTo(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp, { once: true })
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragFillTo, days, valueMap, onChange])

  // Range highlight while dragging the autofill handle
  const isInDragFill = useCallback((idx: number) => {
    const ref = dragFillRef.current
    if (!ref || dragFillTo == null) return false
    const [lo, hi] = [Math.min(ref.from, dragFillTo), Math.max(ref.from, dragFillTo)]
    return idx >= lo && idx <= hi
  }, [dragFillTo])

  // ── Bulk fill prompt ──
  const [bulkFillOpen, setBulkFillOpen] = useState(false)
  const [bulkFillValue, setBulkFillValue] = useState<string>('')

  const applyBulkFill = useCallback(() => {
    const n = Number(bulkFillValue)
    if (!Number.isFinite(n)) return
    fillSelectionWith(n)
    setBulkFillOpen(false)
    setBulkFillValue('')
  }, [bulkFillValue, fillSelectionWith])

  // ── Cell click / shift+click / drag ──
  const dragStartRef = useRef<number | null>(null)
  const onCellMouseDown = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault()
    if (e.shiftKey && anchor != null) {
      setLead(idx)
    } else {
      setAnchor(idx)
      setLead(idx)
      dragStartRef.current = idx
    }
  }, [anchor])

  const onCellMouseEnter = useCallback((idx: number, e: React.MouseEvent) => {
    if (e.buttons === 1 && dragStartRef.current != null) {
      setLead(idx)
    }
  }, [])

  useEffect(() => {
    const onUp = () => { dragStartRef.current = null }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [])

  // ── Keyboard ──
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (anchor == null) return
    const max = days.length - 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(max, (lead ?? anchor) + 1)
      if (e.shiftKey) setLead(next)
      else { setAnchor(next); setLead(next) }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(0, (lead ?? anchor) - 1)
      if (e.shiftKey) setLead(next)
      else { setAnchor(next); setLead(next) }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      clearSelection()
    } else if (e.key === '+') {
      e.preventDefault()
      nudge(1)
    } else if (e.key === '-') {
      e.preventDefault()
      nudge(-1)
    } else if (/^[0-9]$/.test(e.key)) {
      // Start typing a number → open the bulk fill prompt with that digit.
      // preventDefault + stopPropagation so the digit isn't re-captured by
      // the autoFocus'd input below (was producing "55" when user typed "5").
      e.preventDefault()
      e.stopPropagation()
      setBulkFillValue(e.key)
      setBulkFillOpen(true)
    }
  }, [anchor, lead, days.length, clearSelection, nudge])

  // ── Aggregate: total + average ──
  const totals = useMemo(() => {
    let sum = 0
    let count = 0
    let max = 0
    for (const d of days) {
      const v = valueMap[d.key] ?? 0
      sum += v
      if (v > max) max = v
      if (valueMap[d.key] != null) count++
    }
    return {
      sum,
      avg: days.length > 0 ? sum / days.length : 0,
      max,
      filledCount: count,
      totalCount: days.length,
    }
  }, [days, valueMap])

  if (days.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic px-2 py-3">
        Renseignez d'abord une date de début et une date de fin pour configurer le plan POB variable.
      </div>
    )
  }

  const cellSize = compact ? 'w-9 h-9 text-[11px]' : 'w-11 h-11 text-xs'

  return (
    <div
      ref={containerRef}
      className="border border-border rounded-md bg-card focus:outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30">
        <button
          type="button"
          onClick={() => nudge(1)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-border hover:bg-muted"
          title={t('planner.augmenter_de_1_raccourci')}
          disabled={selectedKeys.length === 0}
        >
          <Plus size={13} /> 1
        </button>
        <button
          type="button"
          onClick={() => nudge(-1)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-border hover:bg-muted"
          title={t('planner.diminuer_de_1_raccourci')}
          disabled={selectedKeys.length === 0}
        >
          <Minus size={13} /> 1
        </button>
        <button
          type="button"
          onClick={() => setBulkFillOpen(true)}
          className="gl-button gl-button-default"
          title={t('planner.remplir_la_selection_avec_une_valeur')}
          disabled={selectedKeys.length === 0}
        >
          <Wand2 size={13} /> Remplir
        </button>
        <button
          type="button"
          onClick={copyValueToSelection}
          className="gl-button gl-button-default"
          title={t('planner.copier_la_premiere_cellule_sur_toute_la')}
          disabled={selectedKeys.length === 0}
        >
          <Copy size={13} /> Copier
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="gl-button gl-button-default"
          title={t('planner.vider_la_selection_suppr')}
          disabled={selectedKeys.length === 0}
        >
          <Trash2 size={13} /> Vider
        </button>

        <span className="mx-1 text-[10px] text-muted-foreground">|</span>

        <button
          type="button"
          onClick={() => {
            const v = Number(prompt('Valeur PAX pour tous les jours :', String(defaultValue || 1)))
            if (Number.isFinite(v)) fillAllWith(v)
          }}
          className="gl-button gl-button-default"
          title={t('planner.remplir_tous_les_jours')}
        >
          Tout
        </button>
        <button
          type="button"
          onClick={() => {
            const v = Number(prompt('Valeur PAX en semaine (Lun-Ven) :', String(defaultValue || 1)))
            if (Number.isFinite(v)) fillWeekdaysOnly(v)
          }}
          className="gl-button gl-button-default"
          title="Lun-Ven uniquement"
        >
          Semaine
        </button>
        <button
          type="button"
          onClick={() => {
            const v = Number(prompt('Valeur PAX le week-end (Sam-Dim) :', '0'))
            if (Number.isFinite(v)) fillWeekendsOnly(v)
          }}
          className="gl-button gl-button-default"
          title="Sam-Dim uniquement"
        >
          Week-end
        </button>

        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          Σ {totals.sum} · max {totals.max} · moy {totals.avg.toFixed(1)} · {totals.filledCount}/{totals.totalCount}
        </span>
      </div>

      {/* ── Bulk fill inline prompt ── */}
      {bulkFillOpen && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/5 border-b border-border">
          <span className="text-[10px] text-muted-foreground">{t('planner.remplir_avec')}</span>
          <input
            type="number"
            min={0}
            autoFocus
            value={bulkFillValue}
            onChange={(e) => setBulkFillValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyBulkFill()
              if (e.key === 'Escape') { setBulkFillOpen(false); setBulkFillValue('') }
            }}
            className="w-20 h-6 text-xs px-1.5 border border-border rounded bg-background"
          />
          <button
            type="button"
            onClick={applyBulkFill}
            className="gl-button gl-button-confirm"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => { setBulkFillOpen(false); setBulkFillValue('') }}
            className="gl-button gl-button-default"
          >
            Annuler
          </button>
        </div>
      )}

      {/* ── Grid (Excel-like inline edit) ── */}
      <div className="p-2 max-h-[320px] overflow-y-auto">
        <div className="flex flex-wrap gap-1">
          {days.map((d, idx) => {
            const v = valueMap[d.key]
            const sel = isSelected(idx)
            const isWeekend = d.weekday === 0 || d.weekday === 6
            const inDragFill = isInDragFill(idx)
            const isFocused = anchor === idx && lead === idx
            return (
              <div
                key={d.key}
                data-pob-cell={idx}
                className={cn(
                  'relative flex flex-col items-center rounded border select-none transition-colors',
                  cellSize,
                  inDragFill
                    ? 'border-primary bg-primary/20 ring-1 ring-primary'
                    : sel
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/60'
                      : isWeekend
                        ? 'border-border/60 bg-muted/40 hover:bg-muted'
                        : 'border-border hover:bg-muted/40',
                )}
                onMouseDown={(e) => {
                  // Mouse-select behavior: only takes over when the
                  // user clicks OUTSIDE the input (ie. the date label
                  // strip). Inside the input, focus + caret handling
                  // is native.
                  if ((e.target as HTMLElement).tagName !== 'INPUT') {
                    onCellMouseDown(idx, e)
                  }
                }}
                onMouseEnter={(e) => onCellMouseEnter(idx, e)}
                title={`${WEEKDAY_FULL[d.weekday]} ${d.date.getUTCDate()}/${String(d.date.getUTCMonth() + 1).padStart(2, '0')}`}
              >
                <span className="text-[8px] text-muted-foreground leading-none mt-0.5">
                  {WEEKDAY_LABELS[d.weekday]}{d.date.getUTCDate()}
                </span>
                <input
                  ref={(el) => { cellRefs.current[idx] = el }}
                  type="text"
                  inputMode="numeric"
                  value={v ?? ''}
                  placeholder="·"
                  onFocus={(e) => {
                    setAnchor(idx); setLead(idx)
                    // Auto-select content so typing replaces.
                    e.currentTarget.select()
                  }}
                  onChange={(e) => setSingleCell(idx, e.target.value)}
                  onKeyDown={(e) => handleCellKey(e, idx)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text')
                    if (!text) return
                    e.preventDefault()
                    writePastedValues(idx, text)
                  }}
                  className={cn(
                    'w-full bg-transparent text-center font-semibold tabular-nums leading-none mt-0.5 outline-none border-0 p-0',
                    compact ? 'text-[11px] h-5' : 'text-xs h-6',
                    v == null ? 'text-muted-foreground/50' : 'text-foreground',
                  )}
                />
                {/* Autofill handle — small primary dot at bottom-right
                    of the focused cell. Drag to spread the cell's
                    value across following cells. */}
                {isFocused && !inDragFill && (
                  <span
                    onMouseDown={(e) => startDragFill(idx, e)}
                    className="absolute -right-[3px] -bottom-[3px] w-2 h-2 rounded-sm bg-primary cursor-crosshair shadow-sm"
                    title="Glisser pour remplir"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Hint footer ── */}
      <div className="px-2 py-1 border-t border-border bg-muted/20 text-[9px] text-muted-foreground">
        Tape directement dans la case · Coller depuis Excel ou un texte (séparé par tab/virgule/espace) · Tab/← → / ↑ ↓ pour naviguer · Glisser le coin pour recopier · Suppr pour vider
      </div>
    </div>
  )
}

export default VariablePobEditor
