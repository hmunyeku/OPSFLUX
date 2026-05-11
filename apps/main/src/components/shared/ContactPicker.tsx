import { Contact } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAllTierContacts, useTierContacts } from '@/hooks/useTiers'
import type { TierContact, TierContactWithTier } from '@/types/api'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

type ContactLike = TierContact | TierContactWithTier

interface ContactPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: ContactLike) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
  tierId?: string | null
}

function isGlobalContact(item: ContactLike): item is TierContactWithTier {
  return 'tier_name' in item
}

// Taille de page pour le mode global (search server-side). En mode scope-tier
// (tierId set), on charge tous les contacts du tier — generalement <100.
const GLOBAL_PAGE_SIZE = 100

export function ContactPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
  tierId,
}: ContactPickerProps) {
  const { t } = useTranslation()
  // Server-side search via debounce (cf. SUP-0038 followup): avant on
  // chargeait jusqu'a 200 contacts en bulk, tronques au-dela. Maintenant
  // le user tape, le picker re-fetch ?search=q.
  const [search, setSearch] = useState('')
  const scopedQuery = useTierContacts(tierId || undefined)
  const globalQuery = useAllTierContacts({
    page: 1,
    page_size: GLOBAL_PAGE_SIZE,
    tier_id: tierId || undefined,
    search: search.trim() || undefined,
  })
  const items: ContactLike[] = tierId ? (scopedQuery.data ?? []) : (globalQuery.data?.items ?? [])
  const isLoading = tierId ? scopedQuery.isLoading : globalQuery.isLoading
  // Banner 'liste tronquee' uniquement en mode global et sans recherche.
  const globalTotal = globalQuery.data?.total ?? 0
  const truncated = !tierId && !search.trim() && globalTotal > GLOBAL_PAGE_SIZE

  return (
    <EntityPickerBase
      value={value}
      onChange={onChange}
      items={items}
      isLoading={isLoading}
      disabled={disabled}
      className={className}
      label={label}
      clearable={clearable}
      placeholder={placeholder || t('tiers.select_contact', 'Sélectionner un contact...')}
      icon={Contact}
      recentKey="opsflux:contact-picker:recent"
      onSearchChange={!tierId ? setSearch : undefined}
      truncated={truncated}
      toItem={(item) => ({
        id: item.id,
        label: `${item.first_name} ${item.last_name}`.trim(),
        secondary: isGlobalContact(item)
          ? `${item.tier_name}${item.position ? ` - ${item.position}` : ''}`
          : item.position || item.department || item.email || null,
        badge: item.department || null,
        keywords: [
          item.first_name,
          item.last_name,
          item.email ?? '',
          item.position ?? '',
          item.department ?? '',
          isGlobalContact(item) ? item.tier_name : '',
          isGlobalContact(item) ? item.tier_code : '',
        ],
      })}
    />
  )
}
