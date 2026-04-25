import { useMemo } from 'react'
import { CheckSquare, Square, Loader2 } from 'lucide-react'
import { useHealthConditions, useAddHealthCondition, useRemoveHealthCondition } from '@/hooks/useUserSubModels'
import { useDictionary } from '@/hooks/useDictionary'

interface HealthConditionsChecklistProps {
  userId: string
}

export function HealthConditionsChecklist({ userId }: HealthConditionsChecklistProps) {
  const { data: conditions, isLoading: condLoading } = useHealthConditions(userId)
  const addCondition = useAddHealthCondition()
  const removeCondition = useRemoveHealthCondition()
  const { data: dictRaw } = useDictionary('health_condition')
  const dictEntries = useMemo(() => (dictRaw ?? []).map(e => ({ code: e.code, label: e.label })), [dictRaw])

  if (condLoading) return <Loader2 size={14} className="animate-spin text-muted-foreground mx-auto my-2" />

  const activeConditions = new Map((conditions ?? []).map(c => [c.condition_code, c.id]))

  const toggle = (code: string) => {
    const existingId = activeConditions.get(code)
    if (existingId) {
      removeCondition.mutate({ userId, conditionId: existingId })
    } else {
      addCondition.mutate({ userId, conditionCode: code })
    }
  }

  if (dictEntries.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Aucune condition définie dans le dictionnaire</p>
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-1">
      {dictEntries.map((entry) => (
        <label key={entry.code} className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-accent/30 rounded px-1 transition-colors">
          <button
            type="button"
            onClick={() => toggle(entry.code)}
            className="shrink-0"
          >
            {activeConditions.has(entry.code) ? (
              <CheckSquare size={14} className="text-primary" />
            ) : (
              <Square size={14} className="text-muted-foreground" />
            )}
          </button>
          <span className="text-xs text-foreground">{entry.label}</span>
        </label>
      ))}
    </div>
  )
}
