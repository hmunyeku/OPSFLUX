/**
 * SubModelManager — Generic CRUD list manager for user sub-models.
 *
 * Provides: list view with inline create/edit/delete for any sub-model
 * that follows the {id, user_id, created_at, ...} pattern.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Plus, X, Loader2, Trash2, Pencil, Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { panelInputClass } from '@/components/layout/DynamicPanel'

export interface FieldDef<T> {
  key: keyof T & string
  label: string
  /** 'select' = plain <select> (≤5 options), 'combobox' = searchable autocomplete (>5 options) */
  type?: 'text' | 'date' | 'select' | 'combobox'
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  width?: string // e.g. 'flex-1', 'w-32'
}

/** Inline searchable combobox for SubModelManager fields */
function InlineCombobox({
  value,
  options,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (val: string) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedLabel = useMemo(() => options.find((o) => o.value === value)?.label ?? '', [options, value])

  const filtered = useMemo(() => {
    if (!query) return options
    const q = query.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => { setHighlightIdx(0) }, [filtered.length])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = useCallback((opt: { value: string }) => {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && filtered[highlightIdx]) handleSelect(filtered[highlightIdx])
      else setOpen(true)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }, [open, filtered, highlightIdx, handleSelect])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={panelInputClass + ' h-7 text-xs flex items-center gap-1 cursor-text'}
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-0 outline-none text-xs p-0 placeholder:text-muted-foreground min-w-0"
          placeholder={open ? (placeholder || 'Rechercher...') : (selectedLabel || placeholder || '—')}
          value={open ? query : ''}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <ChevronDown size={12} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <ul ref={listRef} className="absolute z-50 mt-1 w-full max-h-44 overflow-auto rounded-lg border border-border bg-popover shadow-md py-1">
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-[10px] text-muted-foreground text-center">Aucun résultat</li>
          )}
          {filtered.map((o, idx) => (
            <li
              key={o.value}
              className={`px-2 py-1 text-xs cursor-pointer transition-colors ${idx === highlightIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'} ${value === o.value ? 'font-semibold' : ''}`}
              onMouseEnter={() => setHighlightIdx(idx)}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(o) }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface SubModelManagerProps<TRead extends { id: string }, TCreate> {
  items: TRead[] | undefined
  isLoading?: boolean
  fields: FieldDef<TCreate>[]
  /** Columns to show in list (keys from TRead) */
  displayColumns: { key: keyof TRead & string; label: string; format?: (v: unknown) => string; render?: (v: unknown, item: TRead) => React.ReactNode }[]
  emptyLabel: string
  emptyIcon: LucideIcon
  onCreate: (payload: TCreate) => void
  onUpdate: (itemId: string, payload: Partial<TCreate>) => void
  onDelete: (itemId: string) => void
  createPending?: boolean
  compact?: boolean
}

export function SubModelManager<TRead extends { id: string }, TCreate>({
  items,
  isLoading,
  fields,
  displayColumns,
  emptyLabel,
  emptyIcon: EmptyIcon,
  onCreate,
  onUpdate,
  onDelete,
  createPending,
  compact,
}: SubModelManagerProps<TRead, TCreate>) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const initDraft = useCallback((fieldsArr: FieldDef<TCreate>[], existing?: TRead) => {
    const d: Record<string, string> = {}
    for (const f of fieldsArr) {
      d[f.key] = existing ? String((existing as Record<string, unknown>)[f.key] ?? '') : ''
    }
    return d
  }, [])

  const handleAdd = useCallback(() => {
    setDraft(initDraft(fields))
    setShowForm(true)
    setEditingId(null)
  }, [fields, initDraft])

  const handleEdit = useCallback((item: TRead) => {
    setDraft(initDraft(fields, item))
    setEditingId(item.id)
    setShowForm(false)
  }, [fields, initDraft])

  const handleSave = useCallback(() => {
    // Build payload, only include non-empty values
    const payload: Record<string, string | null> = {}
    for (const f of fields) {
      const val = draft[f.key]?.trim()
      if (f.required && !val) return // skip if required field empty
      payload[f.key] = val || null
    }

    if (editingId) {
      onUpdate(editingId, payload as Partial<TCreate>)
      setEditingId(null)
    } else {
      onCreate(payload as TCreate)
      setShowForm(false)
    }
    setDraft({})
  }, [draft, fields, editingId, onCreate, onUpdate])

  const handleCancel = useCallback(() => {
    setShowForm(false)
    setEditingId(null)
    setDraft({})
  }, [])

  const handleConfirmDelete = useCallback((id: string) => {
    onDelete(id)
    setDeletingId(null)
  }, [onDelete])

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '—'
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return String(d) }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={14} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasItems = items && items.length > 0

  return (
    <div className="space-y-2">
      {/* Add button */}
      <div className="flex justify-end">
        <button
          onClick={handleAdd}
          className="gl-button-sm gl-button-confirm flex items-center gap-1"
          disabled={showForm}
        >
          <Plus size={12} /> Ajouter
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex flex-wrap gap-2">
            {fields.map((f) => (
              <div key={f.key} className={f.width ?? 'flex-1 min-w-[120px]'}>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">{f.label}</label>
                {f.type === 'combobox' && f.options ? (
                  <InlineCombobox
                    value={draft[f.key] || ''}
                    options={f.options}
                    onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                    placeholder={f.placeholder}
                  />
                ) : f.type === 'select' && f.options ? (
                  <select
                    value={draft[f.key] || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    className={panelInputClass + ' h-7 text-xs'}
                  >
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type || 'text'}
                    value={draft[f.key] || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className={panelInputClass + ' h-7 text-xs'}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={handleCancel} className="gl-button-sm gl-button-default flex items-center gap-1">
              <X size={12} /> Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={createPending}
              className="gl-button-sm gl-button-confirm flex items-center gap-1"
            >
              {createPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {!hasItems && !showForm ? (
        <EmptyState icon={EmptyIcon} title={emptyLabel} size={compact ? 'compact' : 'default'} />
      ) : (
        <div className="space-y-1">
          {items?.map((item) => (
            <div key={item.id}>
              {editingId === item.id ? (
                <div className="border border-primary/30 rounded-lg p-3 space-y-2 bg-primary/5">
                  <div className="flex flex-wrap gap-2">
                    {fields.map((f) => (
                      <div key={f.key} className={f.width ?? 'flex-1 min-w-[120px]'}>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">{f.label}</label>
                        {f.type === 'select' && f.options ? (
                          <select
                            value={draft[f.key] || ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            className={panelInputClass + ' h-7 text-xs'}
                          >
                            <option value="">—</option>
                            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <input
                            type={f.type || 'text'}
                            value={draft[f.key] || ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            className={panelInputClass + ' h-7 text-xs'}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={handleCancel} className="gl-button-sm gl-button-default flex items-center gap-1">
                      <X size={12} /> Annuler
                    </button>
                    <button onClick={handleSave} className="gl-button-sm gl-button-confirm flex items-center gap-1">
                      <Check size={12} /> Enregistrer
                    </button>
                  </div>
                </div>
              ) : deletingId === item.id ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <span className="text-xs text-destructive flex-1">Supprimer cet élément ?</span>
                  <button onClick={() => setDeletingId(null)} className="gl-button-sm gl-button-default text-xs">Non</button>
                  <button onClick={() => handleConfirmDelete(item.id)} className="gl-button-sm gl-button-danger text-xs">Oui</button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-accent/50 group cursor-pointer transition-colors"
                  onDoubleClick={() => handleEdit(item)}
                >
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {displayColumns.map((col, i) => {
                      const raw = (item as Record<string, unknown>)[col.key]
                      const content = col.render
                        ? col.render(raw, item)
                        : col.format
                          ? col.format(raw)
                          : (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? formatDate(raw) : String(raw ?? '—'))
                      return (
                        <span key={col.key} className={i === 0 ? 'text-sm font-medium text-foreground' : 'text-xs text-muted-foreground'}>
                          {i > 0 && <span className="text-muted-foreground/40 mr-1">·</span>}
                          {content}
                        </span>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(item)} className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent">
                      <Pencil size={11} className="text-muted-foreground" />
                    </button>
                    <button onClick={() => setDeletingId(item.id)} className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10">
                      <Trash2 size={11} className="text-destructive" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
