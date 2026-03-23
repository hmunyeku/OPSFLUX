/**
 * ConditionBuilder — visual JSON condition composer.
 *
 * Allows non-programmers to build structured conditions for compliance rules.
 * Two modes:
 *   - Visual (default): select field → operator → value, with AND/OR logic
 *   - Advanced: raw JSON textarea for power users
 *
 * Output format: { logic: "and"|"or", conditions: [{ field, operator, value }] }
 * Empty conditions → null.
 */
import { useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, Code, LayoutList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { panelInputClass } from '@/components/layout/DynamicPanel'

// ── Types ─────────────────────────────────────────────────────

export interface ConditionField {
  id: string
  label: string
  type: 'text' | 'number' | 'select' | 'boolean'
  options?: string[]
}

interface Condition {
  field: string
  operator: string
  value: string | number | boolean
}

interface ConditionGroup {
  logic: 'and' | 'or'
  conditions: Condition[]
}

interface ConditionBuilderProps {
  value: Record<string, unknown> | null
  onChange: (value: Record<string, unknown> | null) => void
  disabled?: boolean
  fields?: ConditionField[]
}

// ── Default fields ────────────────────────────────────────────

const DEFAULT_FIELDS: ConditionField[] = [
  { id: 'min_experience_years', label: 'Expérience minimum (années)', type: 'number' },
  { id: 'department', label: 'Département', type: 'text' },
  { id: 'certification_level', label: 'Niveau certification', type: 'select', options: ['A', 'B', 'C', 'D'] },
  { id: 'has_medical_clearance', label: 'Aptitude médicale', type: 'boolean' },
  { id: 'site_classification', label: 'Classification site', type: 'text' },
  { id: 'contract_type', label: 'Type de contrat', type: 'select', options: ['CDI', 'CDD', 'Intérim'] },
  { id: 'zone', label: 'Zone de travail', type: 'text' },
  { id: 'risk_level', label: 'Niveau de risque', type: 'select', options: ['faible', 'moyen', 'élevé', 'critique'] },
  { id: 'nationality', label: 'Nationalité', type: 'text' },
  { id: 'age_min', label: 'Âge minimum', type: 'number' },
]

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  number: [
    { value: 'equals', label: '=' },
    { value: 'not_equals', label: '≠' },
    { value: 'greater_than', label: '>' },
    { value: 'less_than', label: '<' },
    { value: 'greater_or_equal', label: '≥' },
    { value: 'less_or_equal', label: '≤' },
  ],
  text: [
    { value: 'equals', label: 'Égal à' },
    { value: 'not_equals', label: 'Différent de' },
    { value: 'contains', label: 'Contient' },
  ],
  select: [
    { value: 'equals', label: 'Égal à' },
    { value: 'not_equals', label: 'Différent de' },
  ],
  boolean: [
    { value: 'equals', label: 'Égal à' },
  ],
}

// ── Helpers ────────────────────────────────────────────────────

function isConditionGroup(v: unknown): v is ConditionGroup {
  if (!v || typeof v !== 'object') return false
  const obj = v as Record<string, unknown>
  return ('logic' in obj) && ('conditions' in obj) && Array.isArray(obj.conditions)
}

function parseValue(value: Record<string, unknown> | null): { group: ConditionGroup; isLegacy: boolean } {
  if (!value) return { group: { logic: 'and', conditions: [] }, isLegacy: false }
  if (isConditionGroup(value)) return { group: value as ConditionGroup, isLegacy: false }
  // Legacy: simple key-value object like { min_experience_years: 2 }
  return { group: { logic: 'and', conditions: [] }, isLegacy: true }
}

// ── Component ─────────────────────────────────────────────────

export function ConditionBuilder({ value, onChange, disabled, fields }: ConditionBuilderProps) {
  const allFields = fields ?? DEFAULT_FIELDS
  const { group: initialGroup, isLegacy } = useMemo(() => parseValue(value), [])
  const [mode, setMode] = useState<'visual' | 'json'>(isLegacy ? 'json' : 'visual')
  const [group, setGroup] = useState<ConditionGroup>(initialGroup)
  const [jsonText, setJsonText] = useState(value ? JSON.stringify(value, null, 2) : '')
  const [jsonError, setJsonError] = useState(false)

  const emitChange = useCallback((g: ConditionGroup) => {
    setGroup(g)
    if (g.conditions.length === 0) {
      onChange(null)
    } else {
      onChange(g as unknown as Record<string, unknown>)
    }
  }, [onChange])

  const addCondition = useCallback(() => {
    const newCond: Condition = { field: allFields[0]?.id ?? '', operator: 'equals', value: '' }
    emitChange({ ...group, conditions: [...group.conditions, newCond] })
  }, [group, allFields, emitChange])

  const updateCondition = useCallback((index: number, partial: Partial<Condition>) => {
    const updated = [...group.conditions]
    updated[index] = { ...updated[index], ...partial }
    // When field changes, reset operator to first valid and value to empty
    if (partial.field) {
      const fieldDef = allFields.find(f => f.id === partial.field)
      const ops = OPERATORS_BY_TYPE[fieldDef?.type ?? 'text']
      updated[index].operator = ops?.[0]?.value ?? 'equals'
      updated[index].value = fieldDef?.type === 'boolean' ? true : ''
    }
    emitChange({ ...group, conditions: updated })
  }, [group, allFields, emitChange])

  const removeCondition = useCallback((index: number) => {
    emitChange({ ...group, conditions: group.conditions.filter((_, i) => i !== index) })
  }, [group, emitChange])

  const toggleLogic = useCallback(() => {
    emitChange({ ...group, logic: group.logic === 'and' ? 'or' : 'and' })
  }, [group, emitChange])

  const handleJsonChange = useCallback((text: string) => {
    setJsonText(text)
    if (!text.trim()) {
      setJsonError(false)
      onChange(null)
      return
    }
    try {
      const parsed = JSON.parse(text)
      setJsonError(false)
      onChange(parsed)
      // If it's a valid condition group, sync visual mode state
      if (isConditionGroup(parsed)) setGroup(parsed as ConditionGroup)
    } catch {
      setJsonError(true)
    }
  }, [onChange])

  const switchToVisual = useCallback(() => {
    // Try to parse current JSON into visual mode
    if (jsonText.trim()) {
      try {
        const parsed = JSON.parse(jsonText)
        if (isConditionGroup(parsed)) {
          setGroup(parsed as ConditionGroup)
        }
      } catch { /* ignore */ }
    }
    setMode('visual')
  }, [jsonText])

  const switchToJson = useCallback(() => {
    setJsonText(group.conditions.length > 0 ? JSON.stringify(group, null, 2) : (value ? JSON.stringify(value, null, 2) : ''))
    setMode('json')
  }, [group, value])

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-accent rounded-lg p-0.5">
          <button
            type="button"
            onClick={switchToVisual}
            className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors', mode === 'visual' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <LayoutList size={12} /> Visuel
          </button>
          <button
            type="button"
            onClick={switchToJson}
            className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors', mode === 'json' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <Code size={12} /> Avancé
          </button>
        </div>
        {mode === 'visual' && group.conditions.length > 1 && (
          <button
            type="button"
            onClick={toggleLogic}
            className={cn(
              'text-[10px] font-bold uppercase px-2 py-0.5 rounded transition-colors',
              group.logic === 'or' ? 'bg-primary/15 text-primary' : 'bg-accent text-muted-foreground hover:text-foreground',
            )}
            title="Basculer entre ET / OU"
          >
            {group.logic === 'and' ? 'ET (toutes)' : 'OU (au moins une)'}
          </button>
        )}
      </div>

      {isLegacy && mode === 'visual' && (
        <div className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded border border-amber-200 dark:border-amber-800/40">
          Format ancien détecté. Utilisez le mode avancé pour modifier le JSON existant, ou ajoutez des conditions en mode visuel.
        </div>
      )}

      {mode === 'visual' ? (
        <div className="space-y-2">
          {group.conditions.map((cond, i) => {
            const fieldDef = allFields.find(f => f.id === cond.field)
            const operators = OPERATORS_BY_TYPE[fieldDef?.type ?? 'text'] ?? OPERATORS_BY_TYPE.text

            return (
              <div key={i}>
                {i > 0 && (
                  <div className="flex justify-center py-0.5">
                    <span className="text-[9px] font-bold uppercase text-primary/60">
                      {group.logic === 'and' ? 'ET' : 'OU'}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 bg-muted/30 rounded-lg p-1.5 border border-border/50">
                  {/* Field */}
                  <select
                    value={cond.field}
                    onChange={(e) => updateCondition(i, { field: e.target.value })}
                    disabled={disabled}
                    className={cn(panelInputClass, 'h-7 text-xs flex-1 min-w-0')}
                  >
                    {allFields.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={cond.operator}
                    onChange={(e) => updateCondition(i, { operator: e.target.value })}
                    disabled={disabled}
                    className={cn(panelInputClass, 'h-7 text-xs w-20 sm:w-24 shrink-0')}
                  >
                    {operators.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>

                  {/* Value */}
                  {fieldDef?.type === 'boolean' ? (
                    <select
                      value={String(cond.value)}
                      onChange={(e) => updateCondition(i, { value: e.target.value === 'true' })}
                      disabled={disabled}
                      className={cn(panelInputClass, 'h-7 text-xs w-16 shrink-0')}
                    >
                      <option value="true">Oui</option>
                      <option value="false">Non</option>
                    </select>
                  ) : fieldDef?.type === 'select' ? (
                    <select
                      value={String(cond.value)}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      disabled={disabled}
                      className={cn(panelInputClass, 'h-7 text-xs flex-1 min-w-0')}
                    >
                      <option value="">—</option>
                      {fieldDef.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : fieldDef?.type === 'number' ? (
                    <input
                      type="number"
                      value={cond.value === '' ? '' : Number(cond.value)}
                      onChange={(e) => updateCondition(i, { value: e.target.value ? Number(e.target.value) : '' })}
                      disabled={disabled}
                      className={cn(panelInputClass, 'h-7 text-xs w-20 shrink-0')}
                      placeholder="0"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(cond.value)}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      disabled={disabled}
                      className={cn(panelInputClass, 'h-7 text-xs flex-1 min-w-0')}
                      placeholder="Valeur..."
                    />
                  )}

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeCondition(i)}
                    disabled={disabled}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}

          {/* Add condition */}
          <button
            type="button"
            onClick={addCondition}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors py-1"
          >
            <Plus size={12} /> Ajouter une condition
          </button>

          {group.conditions.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Aucune condition. La règle s'applique sans restriction.</p>
          )}
        </div>
      ) : (
        /* JSON mode */
        <div className="space-y-1">
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            disabled={disabled}
            className={cn(panelInputClass, 'min-h-[80px] resize-y font-mono text-xs', jsonError && 'ring-1 ring-destructive/50')}
            placeholder='{"logic":"and","conditions":[{"field":"min_experience_years","operator":"greater_or_equal","value":2}]}'
            rows={4}
          />
          {jsonError && <p className="text-[10px] text-destructive">JSON invalide</p>}
        </div>
      )}
    </div>
  )
}
