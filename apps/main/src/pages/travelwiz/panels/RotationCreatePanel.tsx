/**
 * Create Rotation panel — migrated to SmartForm (Simple / Advanced / Wizard).
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Route } from 'lucide-react'
import {
  DynamicPanelShell, PanelContentLayout, FormGrid, DynamicPanelField,
  panelInputClass, type ActionItem,
} from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { useStagingRef } from '@/hooks/useStagingRef'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useCreateRotation, useVectors } from '@/hooks/useTravelWiz'
import type { RotationCreate } from '@/types/api'
import { CronScheduleBuilder } from './CronScheduleBuilder'

function InnerForm() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createRotation = useCreateRotation()
  const { stagingRef, stagingOwnerType } = useStagingRef('rotation')
  const { data: vectorsData } = useVectors({ page: 1, page_size: 100 })
  const { toast } = useToast()
  const { t } = useTranslation()
  const ctx = useSmartForm()

  const [form, setForm] = useState<RotationCreate>({
    name: '',
    vector_id: '',
    departure_base_id: '',
    schedule_cron: null,
    schedule_description: null,
  })
  const vectors = vectorsData?.items ?? []

  const submit = async () => {
    try {
      await createRotation.mutateAsync({
        ...form,
        staging_ref: stagingRef,
      } as RotationCreate & { staging_ref?: string })
      toast({ title: t('travelwiz.toast.rotation_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('travelwiz.toast.rotation_creation_error'), variant: 'error' })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit()
  }

  const actions = useMemo<ActionItem[]>(
    () => [
      { id: 'cancel', label: t('common.cancel'), variant: 'default', priority: 40, onClick: closeDynamicPanel },
      {
        id: 'submit',
        label: t('common.create'),
        variant: 'primary',
        priority: 100,
        loading: createRotation.isPending,
        disabled: createRotation.isPending,
        onClick: () =>
          (document.getElementById('create-rotation-form') as HTMLFormElement)?.requestSubmit(),
      },
    ],
    [closeDynamicPanel, createRotation.isPending, t],
  )

  // Hide bottom bar in wizard mode (wizard nav handles submit)
  const shellActions = ctx?.mode === 'wizard' ? [] : actions

  return (
    <DynamicPanelShell
      title={t('travelwiz.rotation.create_title')}
      subtitle={t('travelwiz.rotation.create_subtitle')}
      icon={<Route size={14} className="text-primary" />}
      actionItems={shellActions}
    >
      <form id="create-rotation-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SmartFormToolbar />
          <SmartFormSimpleHint />
          <SmartFormInlineHelpDrawer />

          <SmartFormSection
            id="identification"
            title={t('common.identification')}
            level="essential"
            help={{
              description: t('travelwiz.rotation.help_identification'),
              tips: [
                t('travelwiz.rotation.help_identification_tip_name'),
                t('travelwiz.rotation.help_identification_tip_vector'),
                t('travelwiz.rotation.help_identification_tip_base'),
              ],
            }}
          >
            <FormGrid>
              <DynamicPanelField label={t('common.name_field')} required>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={panelInputClass}
                  placeholder={t('travelwiz.rotation.name_placeholder')}
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.vector')} required>
                <select
                  required
                  value={form.vector_id}
                  onChange={(e) => setForm({ ...form, vector_id: e.target.value })}
                  className={panelInputClass}
                >
                  <option value="">{t('travelwiz.rotation.vector_placeholder')}</option>
                  {vectors.map((vector) => (
                    <option key={vector.id} value={vector.id}>
                      {vector.registration} - {vector.name}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.departure_base')} required span="full">
                <AssetPicker
                  value={form.departure_base_id || null}
                  onChange={(assetId) =>
                    setForm({ ...form, departure_base_id: assetId ?? '' })
                  }
                  placeholder={t('travelwiz.rotation.base_placeholder')}
                />
              </DynamicPanelField>
            </FormGrid>
          </SmartFormSection>

          <SmartFormSection
            id="periodicity"
            title={t('common.periodicity')}
            level="essential"
            help={{
              description: t('travelwiz.rotation.help_periodicity'),
              tips: [
                t('travelwiz.rotation.help_periodicity_tip_cron'),
                t('travelwiz.rotation.help_periodicity_tip_voyage'),
              ],
            }}
          >
            <CronScheduleBuilder
              value={form.schedule_cron}
              description={form.schedule_description}
              onChange={(cron, desc) =>
                setForm({ ...form, schedule_cron: cron, schedule_description: desc })
              }
            />
            <p className="text-xs text-muted-foreground mt-2">
              {t('travelwiz.rotation.help_periodicity')}
            </p>
          </SmartFormSection>

          <SmartFormSection
            id="attachments"
            title={t('common.attachments')}
            level="advanced"
            skippable
            collapsible
            defaultExpanded={false}
            help={{
              description: t('travelwiz.rotation.help_attachments'),
            }}
          >
            <AttachmentManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </SmartFormSection>

          <SmartFormSection
            id="notes"
            title={t('common.notes')}
            level="advanced"
            skippable
            collapsible
            defaultExpanded={false}
            help={{
              description: t('travelwiz.rotation.help_notes'),
            }}
          >
            <NoteManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </SmartFormSection>

          {ctx?.mode === 'wizard' && (
            <SmartFormWizardNav
              onSubmit={submit}
              onCancel={closeDynamicPanel}
              submitDisabled={createRotation.isPending}
              submitLabel={t('common.create')}
            />
          )}
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

export function CreateRotationPanel() {
  return (
    <SmartFormProvider panelId="create-rotation" defaultMode="simple">
      <InnerForm />
    </SmartFormProvider>
  )
}
