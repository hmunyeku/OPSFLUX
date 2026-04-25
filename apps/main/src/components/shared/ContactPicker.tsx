import { Contact } from 'lucide-react'
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
  const scopedQuery = useTierContacts(tierId || undefined)
  const globalQuery = useAllTierContacts({ page: 1, page_size: 200, tier_id: tierId || undefined })
  const items: ContactLike[] = tierId ? (scopedQuery.data ?? []) : (globalQuery.data?.items ?? [])
  const isLoading = tierId ? scopedQuery.isLoading : globalQuery.isLoading

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
      placeholder={placeholder || t('tiers.select_contact', 'Selectionner un contact...')}
      icon={Contact}
      recentKey="opsflux:contact-picker:recent"
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
