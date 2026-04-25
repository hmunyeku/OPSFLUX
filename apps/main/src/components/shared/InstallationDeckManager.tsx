import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useDecks, useCreateDeck, useUpdateDeck, useDeleteDeck } from '@/hooks/useAssetRegistry'
import type { InstallationDeck, InstallationDeckCreate, InstallationDeckUpdate } from '@/types/assetRegistry'

export function InstallationDeckManager({ installationId, compact }: { installationId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { data: items, isLoading } = useDecks(installationId)
  const create = useCreateDeck()
  const update = useUpdateDeck()
  const del = useDeleteDeck()

  const FIELDS: FieldDef<InstallationDeckCreate>[] = [
    { key: 'deck_name', label: t('assets.inst_sub.deck_name'), required: true, placeholder: 'Main Deck' },
    { key: 'deck_code', label: t('assets.inst_sub.deck_code'), placeholder: 'MD' },
    { key: 'deck_order', label: t('assets.inst_sub.deck_order'), required: true, placeholder: '1' },
    { key: 'elevation_m', label: t('assets.inst_sub.elevation_m'), required: true, placeholder: '25.0' },
    { key: 'deck_length_m', label: t('assets.inst_sub.deck_length'), placeholder: '60' },
    { key: 'deck_width_m', label: t('assets.inst_sub.deck_width'), placeholder: '30' },
    { key: 'deck_area_m2', label: t('assets.inst_sub.deck_area'), placeholder: '1800' },
    { key: 'max_deck_load_tm2', label: t('assets.inst_sub.max_deck_load'), placeholder: '2.5' },
    { key: 'deck_function', label: t('assets.inst_sub.deck_function'), placeholder: 'Process' },
    { key: 'notes', label: t('common.notes') },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'deck_name' as const, label: t('assets.inst_sub.deck_name') },
    { key: 'elevation_m' as const, label: t('assets.inst_sub.elevation_m'), format: (v: unknown) => v != null ? `${v} m` : '—' },
    { key: 'deck_area_m2' as const, label: t('assets.inst_sub.deck_area'), format: (v: unknown) => v != null ? `${v} m²` : '—' },
    { key: 'deck_function' as const, label: t('assets.inst_sub.deck_function') },
  ]

  return (
    <SubModelManager<InstallationDeck, InstallationDeckCreate>
      items={items as InstallationDeck[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel={t('assets.inst_sub.no_decks')}
      emptyIcon={Layers}
      onCreate={(p) => create.mutate({ installationId, data: p as InstallationDeckCreate })}
      onUpdate={(id, p) => update.mutate({ installationId, deckId: id, data: p as InstallationDeckUpdate })}
      onDelete={(id) => del.mutate({ installationId, deckId: id })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
