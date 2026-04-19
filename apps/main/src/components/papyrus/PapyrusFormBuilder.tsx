import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { ConditionBuilder } from '@/components/shared/ConditionBuilder'
import { cn } from '@/lib/utils'

type PapyrusFieldType =
  | 'section'
  | 'input_text'
  | 'input_number'
  | 'input_date'
  | 'input_file'
  | 'input_gps'
  | 'input_select'
  | 'input_multiselect'
  | 'input_table'
  | 'input_condition'
  | 'textarea'

interface PapyrusFormField {
  id: string
  type: PapyrusFieldType
  label: string
  section?: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
  columns?: Array<{ key: string; label: string; type?: string; options?: Array<{ label: string; value: string }> }>
  condition?: Record<string, unknown> | null
  placeholder?: string
}

interface PapyrusFormBuilderProps {
  schema: Record<string, unknown> | undefined
  disabled?: boolean
  isSaving?: boolean
  onSave: (schema: Record<string, unknown>) => void
}

const FIELD_TYPE_OPTIONS: Array<{ value: PapyrusFieldType; label: string }> = [
  { value: 'section', label: 'Section' },
  { value: 'input_text', label: 'Texte' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'input_number', label: 'Nombre' },
  { value: 'input_date', label: 'Date' },
  { value: 'input_select', label: 'Liste déroulante' },
  { value: 'input_multiselect', label: 'Choix multiple' },
  { value: 'input_table', label: 'Tableau' },
  { value: 'input_file', label: 'Fichier / photo' },
  { value: 'input_gps', label: 'GPS' },
  { value: 'input_condition', label: 'Condition' },
]

function createField(type: PapyrusFieldType = 'input_text'): PapyrusFormField {
  const id = `field_${Math.random().toString(36).slice(2, 10)}`
  return {
    id,
    type,
    label: 'Nouveau champ',
    required: false,
    options: type === 'input_select' || type === 'input_multiselect'
      ? [{ label: 'Option 1', value: 'option_1' }]
      : undefined,
    columns: type === 'input_table'
      ? [{ key: 'column_1', label: 'Colonne 1', type: 'text' }]
      : undefined,
    condition: null,
    placeholder: '',
  }
}

function normalizeSchema(schema: Record<string, unknown> | undefined): { version: number; extras: Record<string, unknown>; fields: PapyrusFormField[] } {
  const version = typeof schema?.version === 'number' ? schema.version : 1
  const extras = Object.fromEntries(
    Object.entries(schema ?? {}).filter(([key]) => key !== 'version' && key !== 'fields'),
  )
  const rawFields = Array.isArray(schema?.fields) ? schema.fields : []
  const fields: PapyrusFormField[] = rawFields
    .filter((field): field is Record<string, unknown> => !!field && typeof field === 'object' && !Array.isArray(field))
    .map((field) => ({
      id: typeof field.id === 'string' ? field.id : `field_${Math.random().toString(36).slice(2, 10)}`,
      type: typeof field.type === 'string' ? field.type as PapyrusFieldType : 'input_text',
      label: typeof field.label === 'string' ? field.label : 'Champ',
      section: typeof field.section === 'string' ? field.section : undefined,
      required: Boolean(field.required),
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
              key: typeof column.key === 'string' ? column.key : `column_${Math.random().toString(36).slice(2, 8)}`,
              label: typeof column.label === 'string' ? column.label : 'Colonne',
              type: typeof column.type === 'string' ? column.type : 'text',
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
      condition: field.condition && typeof field.condition === 'object' ? field.condition as Record<string, unknown> : null,
      placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
    }))
  return { version, extras, fields }
}

export function PapyrusFormBuilder({ schema, disabled = false, isSaving = false, onSave }: PapyrusFormBuilderProps) {
  const { t } = useTranslation()
  const normalized = useMemo(() => normalizeSchema(schema), [schema])
  const [version, setVersion] = useState(normalized.version)
  const [schemaExtras, setSchemaExtras] = useState(normalized.extras)
  const [fields, setFields] = useState<PapyrusFormField[]>(normalized.fields)

  useEffect(() => {
    setVersion(normalized.version)
    setSchemaExtras(normalized.extras)
    setFields(normalized.fields)
  }, [normalized])

  const conditionFields = useMemo(
    () =>
      fields.map((field) => ({
        id: field.id,
        label: field.label || field.id,
        type: (
          field.type === 'input_number'
            ? 'number'
            : field.type === 'input_select' || field.type === 'input_multiselect'
              ? 'select'
              : 'text'
        ) as 'number' | 'select' | 'text',
        options: field.options?.map((option) => option.value),
      })),
    [fields],
  )

  const updateField = (index: number, updater: (field: PapyrusFormField) => PapyrusFormField) => {
    setFields((current) => current.map((field, currentIndex) => (currentIndex === index ? updater(field) : field)))
  }

  const removeField = (index: number) => {
    setFields((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const addField = () => {
    setFields((current) => [...current, createField()])
  }

  const save = () => {
    onSave({
      ...schemaExtras,
      version,
      fields: fields.map((field) => ({
        id: field.id,
        type: field.type,
        label: field.label,
        section: field.section || undefined,
        required: Boolean(field.required),
        placeholder: field.placeholder || undefined,
        options: field.options && field.options.length > 0 ? field.options : undefined,
        columns: field.columns && field.columns.length > 0 ? field.columns : undefined,
        condition: field.condition || undefined,
      })),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {t('papyrus.builder.fields_configured', { count: fields.length })}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="gl-button-sm gl-button-default" onClick={addField} disabled={disabled}>
            <Plus size={12} />
            <span>{t('papyrus.builder.add_field')}</span>
          </button>
          <button type="button" className="gl-button-sm gl-button-confirm" onClick={save} disabled={disabled || isSaving}>
            <span>{isSaving ? t('papyrus.builder.saving') : t('papyrus.builder.save_schema')}</span>
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('papyrus.builder.no_fields')}
        </div>
      ) : null}

      {fields.map((field, index) => {
        const usesOptions = field.type === 'input_select' || field.type === 'input_multiselect'
        const usesColumns = field.type === 'input_table'
        return (
          <div key={field.id} className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Champ {index + 1}
              </div>
              <button type="button" className="gl-button-sm gl-button-danger" onClick={() => removeField(index)} disabled={disabled}>
                <Trash2 size={12} />
                <span>Supprimer</span>
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <input
                value={field.label}
                onChange={(event) => updateField(index, (current) => ({ ...current, label: event.target.value }))}
                className={panelInputClass}
                placeholder={t('common.label')}
                disabled={disabled}
              />
              <input
                value={field.id}
                onChange={(event) => updateField(index, (current) => ({ ...current, id: event.target.value }))}
                className={cn(panelInputClass, 'font-mono text-xs')}
                placeholder="Identifiant technique"
                disabled={disabled}
              />
              <select
                value={field.type}
                onChange={(event) => updateField(index, (current) => {
                  const nextType = event.target.value as PapyrusFieldType
                  return {
                    ...current,
                    type: nextType,
                    options: nextType === 'input_select' || nextType === 'input_multiselect'
                      ? current.options && current.options.length > 0
                        ? current.options
                        : [{ label: 'Option 1', value: 'option_1' }]
                      : undefined,
                    columns: nextType === 'input_table'
                      ? current.columns && current.columns.length > 0
                        ? current.columns
                        : [{ key: 'column_1', label: 'Colonne 1', type: 'text' }]
                      : undefined,
                  }
                })}
                className={panelInputClass}
                disabled={disabled}
              >
                {FIELD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                value={field.placeholder ?? ''}
                onChange={(event) => updateField(index, (current) => ({ ...current, placeholder: event.target.value }))}
                className={panelInputClass}
                placeholder="Placeholder"
                disabled={disabled}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={Boolean(field.required)}
                onChange={(event) => updateField(index, (current) => ({ ...current, required: event.target.checked }))}
                disabled={disabled}
              />
              <span>Champ obligatoire</span>
            </label>

            {usesOptions ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Options</div>
                {(field.options ?? []).map((option, optionIndex) => (
                  <div key={`${field.id}_option_${optionIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <input
                      value={option.label}
                      onChange={(event) => updateField(index, (current) => ({
                        ...current,
                        options: (current.options ?? []).map((item, currentOptionIndex) => (
                          currentOptionIndex === optionIndex ? { ...item, label: event.target.value } : item
                        )),
                      }))}
                      className={panelInputClass}
                      placeholder={t('common.label')}
                      disabled={disabled}
                    />
                    <input
                      value={option.value}
                      onChange={(event) => updateField(index, (current) => ({
                        ...current,
                        options: (current.options ?? []).map((item, currentOptionIndex) => (
                          currentOptionIndex === optionIndex ? { ...item, value: event.target.value } : item
                        )),
                      }))}
                      className={cn(panelInputClass, 'font-mono text-xs')}
                      placeholder="Valeur"
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      className="gl-button-sm gl-button-danger"
                      onClick={() => updateField(index, (current) => ({
                        ...current,
                        options: (current.options ?? []).filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex),
                      }))}
                      disabled={disabled}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="gl-button-sm gl-button-default"
                  onClick={() => updateField(index, (current) => ({
                    ...current,
                    options: [...(current.options ?? []), { label: `Option ${(current.options?.length ?? 0) + 1}`, value: `option_${(current.options?.length ?? 0) + 1}` }],
                  }))}
                  disabled={disabled}
                >
                  <Plus size={12} />
                  <span>{t('papyrus.ajouter_une_option')}</span>
                </button>
              </div>
            ) : null}

            {usesColumns ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{t('papyrus.colonnes_du_tableau')}</div>
                {(field.columns ?? []).map((column, columnIndex) => (
                  <div key={`${field.id}_column_${columnIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]">
                    <input
                      value={column.label}
                      onChange={(event) => updateField(index, (current) => ({
                        ...current,
                        columns: (current.columns ?? []).map((item, currentColumnIndex) => (
                          currentColumnIndex === columnIndex ? { ...item, label: event.target.value } : item
                        )),
                      }))}
                      className={panelInputClass}
                      placeholder={t('common.label')}
                      disabled={disabled}
                    />
                    <input
                      value={column.key}
                      onChange={(event) => updateField(index, (current) => ({
                        ...current,
                        columns: (current.columns ?? []).map((item, currentColumnIndex) => (
                          currentColumnIndex === columnIndex ? { ...item, key: event.target.value } : item
                        )),
                      }))}
                      className={cn(panelInputClass, 'font-mono text-xs')}
                      placeholder={t('settings.pdf_templates_editor.schema_editor.key')}
                      disabled={disabled}
                    />
                    <select
                      value={column.type ?? 'text'}
                      onChange={(event) => updateField(index, (current) => ({
                        ...current,
                        columns: (current.columns ?? []).map((item, currentColumnIndex) => (
                          currentColumnIndex === columnIndex ? { ...item, type: event.target.value } : item
                        )),
                      }))}
                      className={panelInputClass}
                      disabled={disabled}
                    >
                      <option value="text">Texte</option>
                      <option value="number">Nombre</option>
                      <option value="date">Date</option>
                      <option value="select">Liste</option>
                    </select>
                    <button
                      type="button"
                      className="gl-button-sm gl-button-danger"
                      onClick={() => updateField(index, (current) => ({
                        ...current,
                        columns: (current.columns ?? []).filter((_, currentColumnIndex) => currentColumnIndex !== columnIndex),
                      }))}
                      disabled={disabled}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="gl-button-sm gl-button-default"
                  onClick={() => updateField(index, (current) => ({
                    ...current,
                    columns: [...(current.columns ?? []), { key: `column_${(current.columns?.length ?? 0) + 1}`, label: `Colonne ${(current.columns?.length ?? 0) + 1}`, type: 'text' }],
                  }))}
                  disabled={disabled}
                >
                  <Plus size={12} />
                  <span>{t('papyrus.ajouter_une_colonne')}</span>
                </button>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Condition d'affichage</div>
              <ConditionBuilder
                value={field.condition ?? null}
                onChange={(value) => updateField(index, (current) => ({ ...current, condition: value }))}
                disabled={disabled}
                fields={conditionFields.filter((candidate) => candidate.id !== field.id)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PapyrusFormBuilder
