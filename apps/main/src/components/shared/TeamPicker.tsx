/**
 * TeamPicker — server-side typeahead pour sélectionner une équipe.
 *
 * Bastien (mai 2026): "une equipe n'est pas cree via settings, c'est
 * cree soit dans projects, soit dans activités, soit dans paxlog et
 * reutilisable partout ou on en a besoin".
 *
 * Inclut un bouton "+ Nouvelle équipe" en bas du dropdown qui ouvre
 * un TeamCreateInline (créé dans le contexte courant). Le nouveau team
 * est immédiatement utilisable comme sélection.
 */
import { Users2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTeams } from '@/hooks/useTeams'
import type { Team } from '@/services/teamsService'
import { EntityPickerBase } from '@/components/shared/EntityPickerBase'

interface TeamPickerProps {
  value?: string | null
  onChange: (id: string | null, item?: Team) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
  /** Equipes à exclure de la liste (e.g. déjà attachées ailleurs). */
  excludeIds?: string[]
}

const PAGE_SIZE = 100

export function TeamPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  label,
  clearable = true,
  excludeIds,
}: TeamPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useTeams({
    page_size: PAGE_SIZE,
    search: search.trim() || undefined,
  })
  const allItems = data?.items ?? []
  const items = excludeIds && excludeIds.length > 0
    ? allItems.filter((t) => !excludeIds.includes(t.id))
    : allItems
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
      placeholder={placeholder || t('teams.select_team') || 'Sélectionner une équipe...'}
      icon={Users2}
      recentKey="opsflux:team-picker:recent"
      onSearchChange={setSearch}
      truncated={truncated}
      toItem={(team) => ({
        id: team.id,
        label: team.name,
        secondary: team.visibility === 'private' ? '(privée)' : null,
        badge: `${team.member_count} membres`,
        keywords: [team.name, team.description ?? ''],
      })}
    />
  )
}
