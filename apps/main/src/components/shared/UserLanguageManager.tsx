import { Languages } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useUserLanguages, useCreateUserLanguage, useUpdateUserLanguage, useDeleteUserLanguage } from '@/hooks/useUserSubModels'
import { useDictionaryOptions, useDictionary } from '@/hooks/useDictionary'
import type { UserLanguageRead, UserLanguageCreate } from '@/types/api'

const FALLBACK_PROFICIENCY_OPTIONS = [
  { value: 'native', label: 'Natif' },
  { value: 'fluent', label: 'Courant' },
  { value: 'advanced', label: 'Avancé' },
  { value: 'intermediate', label: 'Intermédiaire' },
  { value: 'beginner', label: 'Débutant' },
]

export function UserLanguageManager({ userId, compact, hideAddButton }: { userId: string; compact?: boolean; hideAddButton?: boolean }) {
  const { data: items, isLoading } = useUserLanguages(userId)
  const create = useCreateUserLanguage()
  const update = useUpdateUserLanguage()
  const del = useDeleteUserLanguage()
  const proficiencyOptions = useDictionaryOptions('proficiency_level')
  const { data: profEntries } = useDictionary('proficiency_level')
  const languageOptions = useDictionaryOptions('language')

  const profOpts = proficiencyOptions.length > 0 ? proficiencyOptions : FALLBACK_PROFICIENCY_OPTIONS

  const FIELDS: FieldDef<UserLanguageCreate>[] = [
    languageOptions.length > 0
      ? { key: 'language_code', label: 'Langue', required: true, type: 'combobox' as const, options: languageOptions }
      : { key: 'language_code', label: 'Langue', required: true, placeholder: 'fr, en, pt...' },
    { key: 'proficiency_level', label: 'Niveau', type: 'select' as const, options: profOpts },
  ]

  const labels: Record<string, string> = {}
  if (profEntries?.length) {
    for (const e of profEntries) labels[e.code] = e.label
  } else {
    for (const o of FALLBACK_PROFICIENCY_OPTIONS) labels[o.value] = o.label
  }

  const langLabels: Record<string, string> = {}
  for (const o of languageOptions) langLabels[o.value] = o.label

  const DISPLAY_COLUMNS = [
    { key: 'language_code' as const, label: 'Langue', format: (v: unknown) => langLabels[v as string] ?? String(v ?? '—') },
    { key: 'proficiency_level' as const, label: 'Niveau', format: (v: unknown) => labels[v as string] ?? String(v ?? '—') },
  ]

  return (
    <SubModelManager<UserLanguageRead, UserLanguageCreate>
      items={items as UserLanguageRead[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucune langue"
      emptyIcon={Languages}
      onCreate={(p) => create.mutate({ userId, payload: p })}
      onUpdate={(itemId, p) => update.mutate({ userId, itemId, payload: p })}
      onDelete={(itemId) => del.mutate({ userId, itemId })}
      createPending={create.isPending}
      compact={compact}
      hideAddButton={hideAddButton}
    />
  )
}
