import { CreditCard } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useSocialSecurities, useCreateSocialSecurity, useUpdateSocialSecurity, useDeleteSocialSecurity } from '@/hooks/useUserSubModels'
import type { SocialSecurityRead, SocialSecurityCreate } from '@/types/api'

const FIELDS: FieldDef<SocialSecurityCreate>[] = [
  { key: 'country', label: 'Pays', required: true, placeholder: 'France' },
  { key: 'number', label: 'N° Sécu. Sociale', required: true, placeholder: '1 85 01 75 123 456 78' },
]

const DISPLAY_COLUMNS = [
  { key: 'country' as const, label: 'Pays' },
  { key: 'number' as const, label: 'Numéro' },
]

export function SocialSecurityManager({ userId, compact }: { userId: string; compact?: boolean }) {
  const { data: items, isLoading } = useSocialSecurities(userId)
  const create = useCreateSocialSecurity()
  const update = useUpdateSocialSecurity()
  const del = useDeleteSocialSecurity()

  return (
    <SubModelManager<SocialSecurityRead, SocialSecurityCreate>
      items={items as SocialSecurityRead[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel="Aucun n° de sécurité sociale"
      emptyIcon={CreditCard}
      onCreate={(p) => create.mutate({ userId, payload: p })}
      onUpdate={(itemId, p) => update.mutate({ userId, itemId, payload: p })}
      onDelete={(itemId) => del.mutate({ userId, itemId })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
