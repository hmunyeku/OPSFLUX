import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { cn } from '@/lib/utils'

type PrimitiveFieldType =
  | 'section'
  | 'input_text'
  | 'textarea'
  | 'input_number'
  | 'input_date'
  | 'input_select'
  | 'input_multiselect'
  | 'input_table'

interface PapyrusRunnerColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'select'
  options?: Array<{ label: string; value: string }>
}

interface PapyrusRunnerField {
  id: string
  type: PrimitiveFieldType
  label: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
  placeholder?: string
  columns?: PapyrusRunnerColumn[]
}

interface PapyrusFormRunnerProps {
  schema: Record<string, unknown> | undefined
  value: Record<string, unknown> | undefined
  readOnly?: boolean
  isSaving?: boolean
  onSave: (value: Record<string, unknown>) => void
}

function normalizeFields(schema: Record<string, unknown> | undefined): PapyrusRunnerField[] {
  const rawFields = Array.isArray(schema?.fields) ? schema.fields : []
  return rawFields
    .filter((field): field is Record<string, unknown> => !!field && typeof field === 'object' && !Array.isArray(field))
    .map((field) => ({
      id: typeof field.id === 'string' ? field.id : `field_${Math.random().toString(36).slice(2, 10)}`,
      type: typeof field.type === 'string' ? field.type as PrimitiveFieldType : 'input_text',
      label: typeof field.label === 'string' ? field.label : 'Champ',
      required: Boolean(field.required),
      placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
      options: Array.isArray(field.options)
        ? field.options.map((option) =>
            typeof option === 'object' && option
              ? {
                  label: String((option as { label?: string }).label ?? (option as { value?: string }).value ?? ''),
                  value: String((option as { value?: string }).value ?? (option as { label?: string }).label ?? ''),
                }
              : { label: String(option), value: String(option) },
          )
        : undefined,
      columns: Array.isArray(field.columns)
        ? field.columns
            .filter((column): column is Record<string, unknown> => !!column && typeof column === 'object' && !Array.isArray(column))
            .map((column) => ({
              key: typeof column.key === 'string' ? column.key : `col_${Math.random().toString(36).slice(2, 8)}`,
              label: typeof column.label === 'string' ? column.label : 'Colonne',
              type: typeof column.type === 'string' ? column.type as PapyrusRunnerColumn['type'] : 'text',
              options: Array.isArray(column.options)
                ? column.options.map((option) =>
                    typeof option === 'object' && option
                      ? {
                          label: String((option as { label?: string }).label ?? (option as { value?: string }).value ?? ''),
                          value: String((option as { value?: string }).value ?? (option as { label?: string }).label ?? ''),
                        }
                      : { label: String(option), value: String(option) },
                  )
                : undefined,
            }))
        : undefined,
    }))
}

function normalizeValue(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function PapyrusFormRunner({
  schema,
  value,
  readOnly = false,
  isSaving = false,
  onSave,
}: PapyrusFormRunnerProps) {
  const fields = useMemo(() => normalizeFields(schema), [schema])
  const [draft, setDraft] = useState<Record<string, unknown>>(() => normalizeValue(value))

  useEffect(() => {
    setDraft(normalizeValue(value))
  }, [value])

  const setFieldValue = (fieldId: string, nextValue: unknown) => {
    setDraft((current) => ({ ...current, [fieldId]: nextValue }))
  }

  return (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Aucun champ configuré pour ce formulaire.
        </div>
      ) : null}

      {fields.map((field) => {
        if (field.type === 'section') {
          return (
            <div key={field.id} className="border-t border-border pt-4">
              <div className="text-sm font-semibold text-foreground">{field.label}</div>
            </div>
          )
        }

        if (field.type === 'textarea') {
          return (
            <label key={field.id} className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
              <textarea
                value={String(draft[field.id] ?? '')}
                onChange={(event) => setFieldValue(field.id, event.target.value)}
                className={cn(panelInputClass, 'min-h-[96px]')}
                placeholder={field.placeholder}
                disabled={readOnly}
              />
            </label>
          )
        }

        if (field.type === 'input_select') {
          return (
            <label key={field.id} className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
              <select
                value={String(draft[field.id] ?? '')}
                onChange={(event) => setFieldValue(field.id, event.target.value)}
                className={panelInputClass}
                disabled={readOnly}
              >
                <option value="">--</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )
        }

        if (field.type === 'input_multiselect') {
          const current = Array.isArray(draft[field.id]) ? draft[field.id] as string[] : []
          return (
            <div key={field.id} className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
              <div className="flex flex-wrap gap-2">
                {(field.options ?? []).map((option) => {
                  const checked = current.includes(option.value)
                  return (
                    <label key={option.value} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={readOnly}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...current, option.value]
                            : current.filter((item) => item !== option.value)
                          setFieldValue(field.id, next)
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        }

        if (field.type === 'input_table') {
          const rows = Array.isArray(draft[field.id]) ? draft[field.id] as Array<Record<string, unknown>> : []
          return (
            <div key={field.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
                <button
                  type="button"
                  className="gl-button-sm gl-button-default"
                  disabled={readOnly}
                  onClick={() => {
                    const emptyRow = Object.fromEntries((field.columns ?? []).map((column) => [column.key, '']))
                    setFieldValue(field.id, [...rows, emptyRow])
                  }}
                >
                  <Plus size={12} />
                  <span>Ajouter une ligne</span>
                </button>
              </div>
              <div className="space-y-2">
                {rows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Aucune ligne.
                  </div>
                ) : null}
                {rows.map((row, rowIndex) => (
                  <div key={`${field.id}_${rowIndex}`} className="rounded-md border border-border bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-muted-foreground">Ligne {rowIndex + 1}</div>
                      <button
                        type="button"
                        className="gl-button-sm gl-button-danger"
                        disabled={readOnly}
                        onClick={() => setFieldValue(field.id, rows.filter((_, index) => index !== rowIndex))}
                      >
                        <Trash2 size={12} />
                        <span>Supprimer</span>
                      </button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {(field.columns ?? []).map((column) => {
                        const cellValue = row?.[column.key]
                        if (column.type === 'select') {
                          return (
                            <label key={column.key} className="space-y-1">
                              <div className="text-[11px] font-medium text-muted-foreground">{column.label}</div>
                              <select
                                value={String(cellValue ?? '')}
                                onChange={(event) => {
                                  const nextRows = [...rows]
                                  nextRows[rowIndex] = { ...nextRows[rowIndex], [column.key]: event.target.value }
                                  setFieldValue(field.id, nextRows)
                                }}
                                className={panelInputClass}
                                disabled={readOnly}
                              >
                                <option value="">--</option>
                                {(column.options ?? []).map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                          )
                        }
                        return (
                          <label key={column.key} className="space-y-1">
                            <div className="text-[11px] font-medium text-muted-foreground">{column.label}</div>
                            <input
                              type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
                              value={String(cellValue ?? '')}
                              onChange={(event) => {
                                const nextRows = [...rows]
                                nextRows[rowIndex] = { ...nextRows[rowIndex], [column.key]: event.target.value }
                                setFieldValue(field.id, nextRows)
                              }}
                              className={panelInputClass}
                              disabled={readOnly}
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        return (
          <label key={field.id} className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
            <input
              type={field.type === 'input_number' ? 'number' : field.type === 'input_date' ? 'date' : 'text'}
              value={String(draft[field.id] ?? '')}
              onChange={(event) => setFieldValue(field.id, event.target.value)}
              className={panelInputClass}
              placeholder={field.placeholder}
              disabled={readOnly}
            />
          </label>
        )
      })}

      <div className="flex justify-end">
        <button
          type="button"
          className="gl-button-sm gl-button-confirm"
          disabled={readOnly || isSaving}
          onClick={() => onSave(draft)}
        >
          <span>{isSaving ? 'Enregistrement...' : 'Enregistrer les données structurées'}</span>
        </button>
      </div>
    </div>
  )
}
