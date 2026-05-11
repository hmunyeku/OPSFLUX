import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTiers } from '@/hooks/useTiers'
import type { Tier } from '@/types/api'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface CompanyPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: Tier) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
}

// Taille de page raisonnable pour un dropdown. La majorite des tenants tient
// dedans; au-dela, le user passe par la recherche (server-side search via
// onSearchChange) qui interroge l'API avec ?search=q. Plus de
// silently-truncated comme avant (cf. SUP-0038 followup).
const PAGE_SIZE = 100

export function CompanyPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
}: CompanyPickerProps) {
  const { t } = useTranslation()
  // ── Server-side search state ──────────────────────────────────
  // search est l'input courant du picker. Quand l'utilisateur tape,
  // EntityPickerBase debounce la valeur et appelle onSearchChange, qui
  // declenche un re-fetch via React Query (la query key inclut search).
  const [search, setSearch] = useState('')
  const { data, isLoading } = useTiers({
    page_size: PAGE_SIZE,
    search: search.trim() || undefined,
  })
  const items = data?.items ?? []
  const total = data?.total ?? items.length
  const truncated = !search.trim() && total > PAGE_SIZE

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
      placeholder={placeholder || t('tiers.select_company', 'Sélectionner une entreprise...')}
      icon={Building2}
      recentKey="opsflux:company-picker:recent"
      onSearchChange={setSearch}
      truncated={truncated}
      toItem={(item) => ({
        id: item.id,
        label: item.name,
        secondary: item.code,
        badge: item.type || null,
        keywords: [item.code, item.name, item.alias ?? '', item.trade_name ?? '', item.email ?? ''],
      })}
    />
  )
}
