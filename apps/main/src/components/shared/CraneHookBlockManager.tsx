import { Anchor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SubModelManager, type FieldDef } from './SubModelManager'
import { useCraneHookBlocks, useCreateCraneHookBlock, useUpdateCraneHookBlock, useDeleteCraneHookBlock } from '@/hooks/useAssetRegistry'
import type { CraneHookBlock, CraneHookBlockCreate } from '@/types/assetRegistry'

export function CraneHookBlockManager({ equipmentId, compact }: { equipmentId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { data: items, isLoading } = useCraneHookBlocks(equipmentId)
  const create = useCreateCraneHookBlock()
  const update = useUpdateCraneHookBlock()
  const del = useDeleteCraneHookBlock()

  const FIELDS: FieldDef<CraneHookBlockCreate>[] = [
    { key: 'block_reference', label: t('assets.sub.block_reference'), placeholder: 'HB-01' },
    { key: 'block_tag', label: t('assets.sub.block_tag') },
    { key: 'sheave_count', label: t('assets.sub.sheave_count'), placeholder: '4' },
    { key: 'rated_capacity_tonnes', label: t('assets.sub.rated_capacity'), required: true, placeholder: '25.0' },
    { key: 'block_weight_kg', label: t('assets.sub.block_weight'), placeholder: '850' },
    { key: 'hook_weight_kg', label: t('assets.sub.hook_weight'), placeholder: '120' },
    { key: 'is_main_hook', label: t('assets.sub.is_main_hook'), type: 'select' as const, options: [{ value: 'true', label: t('common.yes') }, { value: 'false', label: t('common.no') }] },
    { key: 'is_current_fit', label: t('assets.sub.is_current_fit'), type: 'select' as const, options: [{ value: 'true', label: t('common.yes') }, { value: 'false', label: t('common.no') }] },
  ]

  const DISPLAY_COLUMNS = [
    { key: 'block_reference' as const, label: t('assets.sub.block_reference') },
    { key: 'sheave_count' as const, label: t('assets.sub.sheave_count') },
    { key: 'rated_capacity_tonnes' as const, label: t('assets.sub.rated_capacity'), format: (v: unknown) => v != null ? `${v} t` : '—' },
    { key: 'is_main_hook' as const, label: t('assets.sub.is_main_hook'), format: (v: unknown) => v ? '✓' : '—' },
  ]

  return (
    <SubModelManager<CraneHookBlock, CraneHookBlockCreate>
      items={items as CraneHookBlock[] | undefined}
      isLoading={isLoading}
      fields={FIELDS}
      displayColumns={DISPLAY_COLUMNS}
      emptyLabel={t('assets.sub.no_hook_blocks')}
      emptyIcon={Anchor}
      onCreate={(p) => create.mutate({ eqId: equipmentId, payload: p })}
      onUpdate={(id, p) => update.mutate({ eqId: equipmentId, id, payload: p })}
      onDelete={(id) => del.mutate({ eqId: equipmentId, id })}
      createPending={create.isPending}
      compact={compact}
    />
  )
}
