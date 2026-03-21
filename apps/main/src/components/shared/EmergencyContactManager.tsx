import { Heart } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useEmergencyContacts, useCreateEmergencyContact, useUpdateEmergencyContact, useDeleteEmergencyContact } from '@/hooks/useUserSubModels'
import { useDictionaryOptions, useDictionary } from '@/hooks/useDictionary'
import type { EmergencyContactRead, EmergencyContactCreate } from '@/types/api'

const FALLBACK_RELATIONSHIP_OPTIONS = [
  { value: 'spouse', label: 'Conjoint(e)' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Enfant' },
  { value: 'sibling', label: 'Frère/Sœur' },
  { value: 'friend', label: 'Ami(e)' },
  { value: 'other', label: 'Autre' },
]

export function EmergencyContactManager({ userId, compact }: { userId: string; compact?: boolean }) {
  const { data: items, isLoading } = useEmergencyContacts(userId)
  const create = useCreateEmergencyContact()
  const update = useUpdateEmergencyContact()
  const del = useDeleteEmergencyContact()
  const relationshipOptions = useDictionaryOptions('relationship')
  const { data: relEntries } = useDictionary('relationship')

  const FIELDS: FieldDef<EmergencyContactCreate>[] = [
    { key: 'name', label: 'Nom', required: true, placeholder: 'Jean Dupont' },
    { key: 'relationship_type', label: 'Lien', required: true, type: 'combobox' as const, options: relationshipOptions.length > 0 ? relationshipOptions : FALLBACK_RELATIONSHIP_OPTIONS },
    { key: 'phone_number', label: 'Téléphone', placeholder: '+33 6 12 34 56 78' },
    { key: 'email', label: 'Email', placeholder: 'email@example.com' },
  ]

  // Build labels from dictionary or fallback
  const labels: Record<string, string> = {}
  if (relEntries?.length) {
    for (const e of relEntries) labels[e.code] = e.label
  } else {
    for (const o of FALLBACK_RELATIONSHIP_OPTIONS) labels[o.value] = o.label
  }

  const DISPLAY_COLUMNS = [
    { key: 'name' as const, label: 'Nom' },
    { key: 'relationship_type' as const, label: 'Lien', format: (v: unknown) => labels[v as string] ?? String(v) },
    { key: 'phone_number' as const, label: 'Téléphone' },
  ]

  return (
    <SubModelManager<EmergencyContactRead, EmergencyContactCreate>
      items={items as EmergencyContactRead[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun contact d'urgence"
      emptyIcon={Heart}
      onCreate={(p) => create.mutate({ userId, payload: p })}
      onUpdate={(itemId, p) => update.mutate({ userId, itemId, payload: p })}
      onDelete={(itemId) => del.mutate({ userId, itemId })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
