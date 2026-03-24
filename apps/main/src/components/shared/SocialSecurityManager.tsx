import { CreditCard } from 'lucide-react'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useSocialSecurities, useCreateSocialSecurity, useUpdateSocialSecurity, useDeleteSocialSecurity } from '@/hooks/useUserSubModels'
import { useDictionaryColumnOptions } from '@/hooks/useDictionary'
import { CountryFlag } from '@/components/ui/CountryFlag'
import type { SocialSecurityRead, SocialSecurityCreate } from '@/types/api'

export function SocialSecurityManager({ userId, compact, hideAddButton, onAddRef }: { userId: string; compact?: boolean; hideAddButton?: boolean; onAddRef?: (fn: () => void) => void }) {
  const { data: items, isLoading } = useSocialSecurities(userId)
  const create = useCreateSocialSecurity()
  const update = useUpdateSocialSecurity()
  const del = useDeleteSocialSecurity()
  const countryOptions = useDictionaryColumnOptions('nationality', 'country')

  const FIELDS: FieldDef<SocialSecurityCreate>[] = [
    countryOptions.length > 0
      ? { key: 'country', label: 'Pays', required: true, type: 'combobox' as const, options: countryOptions }
      : { key: 'country', label: 'Pays', required: true, placeholder: 'CM, FR...' },
    { key: 'number', label: 'N° Sécu. Sociale', required: true, placeholder: '1 85 01 75 123 456 78' },
  ]

  const countryLabels: Record<string, string> = {}
  for (const o of countryOptions) countryLabels[o.value] = o.label

  const DISPLAY_COLUMNS = [
    {
      key: 'country' as const,
      label: 'Pays',
      render: (v: unknown) => {
        const code = v as string
        return <CountryFlag code={code} label={countryLabels[code] ?? code} size={14} />
      },
    },
    { key: 'number' as const, label: 'Numéro' },
  ]

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
      hideAddButton={hideAddButton}
      onAddRef={onAddRef}
    />
  )
}
