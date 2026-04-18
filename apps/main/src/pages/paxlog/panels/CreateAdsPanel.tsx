import { useTranslation } from 'react-i18next'
import { useCreateAds } from '@/hooks/usePaxlog'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useProjects } from '@/hooks/useProjets'
import { useState } from 'react'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { DynamicPanelShell, PanelActionButton, PanelContentLayout, FormSection, FormGrid, DynamicPanelField, TagSelector, panelInputClass } from '@/components/layout/DynamicPanel'
import { ClipboardList, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { UserPicker } from '@/components/shared/UserPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { AllowedCompaniesPicker } from '../shared'
import type { AllowedCompanySelection } from '../shared'

export function CreateAdsPanel() {
  const { t } = useTranslation()
  const createAds = useCreateAds()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const currentUser = useAuthStore((s) => s.user)
  const { data: projects } = useProjects({ page: 1, page_size: 100 })
  const [companySearch, setCompanySearch] = useState('')
  const visitCategoryOptions = useDictionaryOptions('visit_category')
  const transportModeOptions = useDictionaryOptions('transport_mode')
  const [allowedCompanies, setAllowedCompanies] = useState<AllowedCompanySelection[]>([])

  const [form, setForm] = useState<{
    type: 'individual' | 'team'
    requester_id: string
    site_entry_asset_id: string
    visit_purpose: string
    visit_category: string
    start_date: string
    end_date: string
    project_id: string
    outbound_transport_mode: string
    return_transport_mode: string
    is_round_trip_no_overnight: boolean
  }>({
    type: 'individual',
    requester_id: currentUser?.id || '',
    site_entry_asset_id: '',
    visit_purpose: '',
    visit_category: '',
    start_date: '',
    end_date: '',
    project_id: '',
    outbound_transport_mode: '',
    return_transport_mode: '',
    is_round_trip_no_overnight: false,
  })

  const adsChecklist = [
    { label: t('paxlog.create_ads.checklist.destination'), done: !!form.site_entry_asset_id },
    { label: t('paxlog.create_ads.checklist.category'), done: !!form.visit_category },
    { label: t('paxlog.create_ads.checklist.period'), done: !!form.start_date && !!form.end_date },
    { label: t('paxlog.create_ads.checklist.purpose'), done: form.visit_purpose.trim().length > 0 },
  ]
  const adsReady = adsChecklist.every((item) => item.done)
  const selectedVisitCategory = visitCategoryOptions.find((option) => option.value === form.visit_category)?.label || t('paxlog.create_ads.summary.undefined')
  const selectedProjectLabel = (projects?.items ?? []).find((project) => project.id === form.project_id)
  const selectedOutboundMode = transportModeOptions.find((option) => option.value === form.outbound_transport_mode)?.label || t('paxlog.create_ads.summary.to_define')
  const selectedReturnMode = transportModeOptions.find((option) => option.value === form.return_transport_mode)?.label || t('paxlog.create_ads.summary.to_define')
  const selectedAllowedCompaniesLabel = allowedCompanies.length > 0
    ? allowedCompanies.map((company) => company.name).join(', ')
    : t('common.none')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      requester_id: form.requester_id || null,
      project_id: form.project_id || null,
      allowed_company_ids: allowedCompanies.map((company) => company.id),
      visit_category: form.visit_category,
      outbound_transport_mode: form.outbound_transport_mode || null,
      return_transport_mode: form.return_transport_mode || null,
    }
    await createAds.mutateAsync(payload)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('paxlog.create_ads.title')}
      subtitle={t('paxlog.create_ads.subtitle')}
      icon={<ClipboardList size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createAds.isPending || !adsReady}
            onClick={() => (document.getElementById('create-ads-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createAds.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-ads-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title={t('paxlog.create_ads.sections.request')}>
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('paxlog.create_ads.intro')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {adsChecklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                    {item.done ? '✓' : '•'}
                  </span>
                  <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.format')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{form.type === 'individual' ? t('paxlog.create_ads.type.individual') : t('paxlog.create_ads.type.team')}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.category')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedVisitCategory}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.project')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground truncate">{selectedProjectLabel ? `${selectedProjectLabel.code} — ${selectedProjectLabel.name}` : t('paxlog.create_ads.summary.bu_entity_imputation')}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.transports')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground truncate">{selectedOutboundMode} / {selectedReturnMode}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.allowed_companies')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground truncate">{selectedAllowedCompaniesLabel}</p>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('paxlog.create_ads.sections.type_destination')}>
          <FormGrid>
            <DynamicPanelField label={t('common.type')}>
              <TagSelector
                options={[{ value: 'individual', label: t('paxlog.create_ads.type.individual') }, { value: 'team', label: t('paxlog.create_ads.type.team') }]}
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v as 'individual' | 'team' })}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.entry_site')} required>
              <AssetPicker
                value={form.site_entry_asset_id || null}
                onChange={(id) => setForm({ ...form, site_entry_asset_id: id || '' })}
              />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('paxlog.create_ads.sections.visit_details')}>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.create_ads.fields.requester')} required>
              <UserPicker
                value={form.requester_id || null}
                onChange={(id) => setForm({ ...form, requester_id: id || '' })}
                placeholder={t('paxlog.create_ads.select_option')}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.visit_category')} required>
              <select value={form.visit_category} onChange={(e) => setForm({ ...form, visit_category: e.target.value })} className={panelInputClass} required>
                <option value="">{t('paxlog.create_ads.select_option')}</option>
                {visitCategoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.project')}>
              <ProjectPicker
                value={form.project_id || null}
                onChange={(id) => setForm({ ...form, project_id: id || '' })}
                placeholder={t('paxlog.create_ads.no_project')}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.dates')} required>
              <DateRangePicker
                startDate={form.start_date || null}
                endDate={form.end_date || null}
                onStartChange={(v) => {
                  // When the round-trip-no-overnight flag is on, the
                  // visit is a single-day affair: end_date must mirror
                  // start_date so the dates picker stays consistent.
                  setForm((f) => ({
                    ...f,
                    start_date: v,
                    end_date: f.is_round_trip_no_overnight ? v : f.end_date,
                  }))
                }}
                onEndChange={(v) => setForm({ ...form, end_date: v })}
                required
              />
              <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_round_trip_no_overnight}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setForm((f) => ({
                      ...f,
                      is_round_trip_no_overnight: checked,
                      // Force end = start when toggling on
                      end_date: checked ? f.start_date : f.end_date,
                    }))
                  }}
                  className="h-3 w-3 rounded border-border accent-primary"
                />
                <span>{t('paxlog.create_ads.fields.round_trip_no_overnight') || 'Aller-retour sans nuitée (visite d\'une journée)'}</span>
              </label>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.outbound_transport')}>
              <select value={form.outbound_transport_mode} onChange={(e) => setForm({ ...form, outbound_transport_mode: e.target.value })} className={panelInputClass}>
                <option value="">{t('paxlog.create_ads.undefined_option')}</option>
                {transportModeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.return_transport')}>
              <select value={form.return_transport_mode} onChange={(e) => setForm({ ...form, return_transport_mode: e.target.value })} className={panelInputClass}>
                <option value="">{t('paxlog.create_ads.undefined_option')}</option>
                {transportModeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label={t('paxlog.visit_purpose')} required>
            <textarea required value={form.visit_purpose} onChange={(e) => setForm({ ...form, visit_purpose: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder={t('paxlog.create_ads.placeholders.visit_purpose')} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('paxlog.create_ads.sections.allowed_companies')}>
          <AllowedCompaniesPicker
            value={allowedCompanies}
            onChange={setAllowedCompanies}
            searchValue={companySearch}
            onSearchChange={setCompanySearch}
          />
        </FormSection>

        <p className="text-xs text-muted-foreground italic">
          {t('paxlog.create_ads.footer_hint')}
        </p>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── AdS Detail Panel ──────────────────────────────────────────

