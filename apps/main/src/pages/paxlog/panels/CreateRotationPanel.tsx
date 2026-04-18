import { useTranslation } from 'react-i18next'
import { useCreateRotationCycle, usePaxProfiles } from '@/hooks/usePaxlog'
import { useUIStore } from '@/stores/uiStore'
import { useState } from 'react'
import { DynamicPanelShell, PanelActionButton, PanelContentLayout, FormSection, DynamicPanelField, FormGrid, panelInputClass } from '@/components/layout/DynamicPanel'
import { RefreshCw, Loader2, User } from 'lucide-react'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { cn } from '@/lib/utils'
import { SearchablePicker } from '../shared'

export function CreateRotationPanel() {
  const { t } = useTranslation()
  const createRotation = useCreateRotationCycle()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const [paxSearch, setPaxSearch] = useState('')
  const { data: paxData, isLoading: paxLoading } = usePaxProfiles({ page: 1, page_size: 20, search: paxSearch || undefined })

  const [form, setForm] = useState({
    user_id: null as string | null,
    contact_id: null as string | null,
    site_asset_id: '',
    days_on: 28,
    days_off: 28,
    start_date: new Date().toISOString().split('T')[0],
    notes: '' as string,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.user_id && !form.contact_id) return
    await createRotation.mutateAsync({
      user_id: form.user_id,
      contact_id: form.contact_id,
      site_asset_id: form.site_asset_id,
      days_on: form.days_on,
      days_off: form.days_off,
      start_date: form.start_date,
      notes: form.notes || undefined,
    })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('paxlog.rotation_panel.create_title')}
      subtitle={t('paxlog.rotation_panel.subtitle')}
      icon={<RefreshCw size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createRotation.isPending || (!form.user_id && !form.contact_id)}
            onClick={() => (document.getElementById('create-rotation-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createRotation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-rotation-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title="PAX">
          <SearchablePicker
            label={t('paxlog.rotation_panel.fields.pax_profile')}
            icon={<User size={12} className="text-muted-foreground" />}
            items={paxData?.items || []}
            isLoading={paxLoading}
            searchValue={paxSearch}
            onSearchChange={setPaxSearch}
            renderItem={(p) => <>{p.last_name} {p.first_name}</>}
            selectedId={form.user_id || form.contact_id}
            onSelect={(p) => {
              const isUser = p.pax_source === 'user' || p.pax_type === 'internal'
              setForm({ ...form, user_id: isUser ? p.id : null, contact_id: isUser ? null : p.id })
            }}
            onClear={() => setForm({ ...form, user_id: null, contact_id: null })}
            placeholder={t('paxlog.rotation_panel.placeholders.search_pax')}
          />
        </FormSection>

        <FormSection title={t('assets.site')}>
          <DynamicPanelField label={t('assets.site')} required>
            <AssetPicker
              value={form.site_asset_id || null}
              onChange={(id) => setForm({ ...form, site_asset_id: id || '' })}
              label={t('assets.site')}
            />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('paxlog.rotation_panel.sections.cycle')}>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.rotation_panel.fields.days_on')} required>
              <input type="number" required min={1} value={form.days_on} onChange={(e) => setForm({ ...form, days_on: parseInt(e.target.value) || 28 })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.rotation_panel.fields.days_off')} required>
              <input type="number" required min={1} value={form.days_off} onChange={(e) => setForm({ ...form, days_off: parseInt(e.target.value) || 28 })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label={t('paxlog.rotation_panel.fields.start_date')} required>
            <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('common.notes')}>
          <DynamicPanelField label={t('common.notes')}>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder={t('paxlog.rotation_panel.placeholders.notes')} />
          </DynamicPanelField>
        </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}


// ═══════════════════════════════════════════════════════════════
// TAB 7: MISSIONS (AVM)
// ═══════════════════════════════════════════════════════════════

