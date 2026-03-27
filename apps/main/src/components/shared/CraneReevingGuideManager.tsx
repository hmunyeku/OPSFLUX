import { List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useCraneReevingGuide, useCreateCraneReevingGuide, useUpdateCraneReevingGuide, useDeleteCraneReevingGuide } from '@/hooks/useAssetRegistry'
import type { CraneReevingGuideEntry, CraneReevingGuideCreate } from '@/types/assetRegistry'

export function CraneReevingGuideManager({ equipmentId, compact }: { equipmentId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { data: items, isLoading } = useCraneReevingGuide(equipmentId)
  const create = useCreateCraneReevingGuide()
  const update = useUpdateCraneReevingGuide()
  const del = useDeleteCraneReevingGuide()

  const FIELDS: FieldDef<CraneReevingGuideCreate>[] = [
    { key: 'reeving_parts', label: t('assets.sub.reeving_parts'), required: true, placeholder: '4' },
    { key: 'load_min_tonnes', label: t('assets.sub.load_min'), required: true, placeholder: '0' },
    { key: 'load_max_tonnes', label: t('assets.sub.load_max'), required: true, placeholder: '10' },
    { key: 'boom_config_ref', label: t('assets.sub.boom_config_ref'), placeholder: 'MAIN-30m' },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'reeving_parts' as const, label: t('assets.sub.reeving_parts') },
    { key: 'load_min_tonnes' as const, label: t('assets.sub.load_min'), format: (v: unknown) => v != null ? `${v} t` : '—' },
    { key: 'load_max_tonnes' as const, label: t('assets.sub.load_max'), format: (v: unknown) => v != null ? `${v} t` : '—' },
  ]

  return (
    <SubModelManager<CraneReevingGuideEntry, CraneReevingGuideCreate>
      items={items as CraneReevingGuideEntry[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel={t('assets.sub.no_reeving_guide')}
      emptyIcon={List}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
