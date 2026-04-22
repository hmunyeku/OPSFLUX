import { useTranslation } from 'react-i18next'
import { useCreateAds, usePaxCandidates } from '@/hooks/usePaxlog'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useMemo, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { DynamicPanelShell, PanelActionButton, PanelContentLayout, FormGrid, DynamicPanelField, TagSelector, panelInputClass } from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
import { ClipboardList, Loader2, Plus, Search, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { ImputationManager } from '@/components/shared/ImputationManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { UserPicker } from '@/components/shared/UserPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useStagingRef } from '@/hooks/useStagingRef'
import type { PaxCandidate } from '@/services/paxlogService'
import { AllowedCompaniesPicker } from '../shared'
import type { AllowedCompanySelection } from '../shared'

/** One PAX pre-selected for the ADS being created. Mirrors backend
 *  `AdsPaxEntry` shape. Local state only — sent as `pax_entries` on submit. */
interface StagedPax {
  user_id: string | null
  contact_id: string | null
  display_name: string
  subtitle: string
  pax_type: 'internal' | 'external'
}

export function CreateAdsPanel() {
  return (
    <SmartFormProvider panelId="create-ads" defaultMode="simple">
      <AdsInner />
    </SmartFormProvider>
  )
}

function AdsInner() {
  const { t } = useTranslation()
  const ctx = useSmartForm()
  const createAds = useCreateAds()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const currentUser = useAuthStore((s) => s.user)
  const [companySearch, setCompanySearch] = useState('')
  const visitCategoryOptions = useDictionaryOptions('visit_category')
  const transportModeOptions = useDictionaryOptions('transport_mode')
  const [allowedCompanies, setAllowedCompanies] = useState<AllowedCompanySelection[]>([])
  // Staging — justificatifs (visa, invitation letter, company approval...)
  // attached directly in the Create panel. Backend re-targets on submit.
  const { stagingRef, stagingOwnerType } = useStagingRef('ads')

  // Local-state PAX selection — sent as `pax_entries` in the AdsCreate
  // payload. AdsPax rows are FK-bound (not polymorphic), so they don't
  // need the staging infra — they're created in one pass by the backend.
  const [stagedPax, setStagedPax] = useState<StagedPax[]>([])
  const [paxSearch, setPaxSearch] = useState('')
  const debouncedPaxSearch = useDebounce(paxSearch, 250)
  const { data: paxCandidates } = usePaxCandidates(debouncedPaxSearch)
  const paxKey = (c: { user_id?: string | null; contact_id?: string | null }) =>
    (c.user_id ? `u:${c.user_id}` : '') + '|' + (c.contact_id ? `c:${c.contact_id}` : '')
  const stagedPaxKeys = useMemo(() => new Set(stagedPax.map(paxKey)), [stagedPax])
  const addPax = (c: PaxCandidate) => {
    const entry: StagedPax = {
      user_id: c.source === 'user' ? c.user_id ?? null : null,
      contact_id: c.source === 'contact' ? c.contact_id ?? null : null,
      display_name: `${c.last_name} ${c.first_name}`.trim(),
      subtitle: c.source === 'user' ? (c.email ?? '') : (c.position ?? ''),
      pax_type: (c.pax_type || c.type || 'external') as 'internal' | 'external',
    }
    if (stagedPaxKeys.has(paxKey(entry))) return
    setStagedPax((prev) => [...prev, entry])
    setPaxSearch('')
  }
  const removePax = (idx: number) =>
    setStagedPax((prev) => prev.filter((_, i) => i !== idx))

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

  // Minimal pre-flight — used to enable/disable the Create button.
  // The 4 gates match the backend's required fields; displayed as a
  // compact progress counter at the top of the form rather than 4
  // separate cards + 5 summary tiles which felt heavy and duplicated
  // the form below.
  const adsChecks = [
    !!form.site_entry_asset_id,
    !!form.visit_category,
    !!form.start_date && !!form.end_date,
    form.visit_purpose.trim().length > 0,
  ]
  const adsReady = adsChecks.every(Boolean)
  const adsProgress = adsChecks.filter(Boolean).length

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
      staging_ref: stagingRef,
      pax_entries: stagedPax.map((p) => ({
        user_id: p.user_id,
        contact_id: p.contact_id,
      })),
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
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
        <SmartFormSection id="request" title={t('paxlog.create_ads.sections.request')} level="essential" help={{ description: t('paxlog.create_ads.help.request_description'), tips: [ t('paxlog.create_ads.help.request_tip_requester') ] }}>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t('paxlog.create_ads.intro')}
            </p>
            <span
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                adsReady
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
              )}
            >
              {adsProgress}/4
            </span>
          </div>
        </SmartFormSection>

        <SmartFormSection id="type_destination" title={t('paxlog.create_ads.sections.type_destination')} level="essential" help={{ description: t('paxlog.create_ads.help.type_destination_description'), items: [ { label: 'individual', text: t('paxlog.create_ads.help.type_individual') }, { label: 'team', text: t('paxlog.create_ads.help.type_team') } ] }}>
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
        </SmartFormSection>

        <SmartFormSection id="visit_details" title={t('paxlog.create_ads.sections.visit_details')} level="essential" help={{ description: t('paxlog.create_ads.help.visit_details_description'), tips: [ t('paxlog.create_ads.help.visit_tip_purpose'), t('paxlog.create_ads.help.visit_tip_dates'), t('paxlog.create_ads.help.visit_tip_category') ] }}>
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
        </SmartFormSection>

        <SmartFormSection id="allowed_companies" title={t('paxlog.create_ads.sections.allowed_companies')} level="advanced" skippable help={{ description: t('paxlog.create_ads.help.allowed_companies_description') }}>
          <AllowedCompaniesPicker
            value={allowedCompanies}
            onChange={setAllowedCompanies}
            searchValue={companySearch}
            onSearchChange={setCompanySearch}
          />
        </SmartFormSection>

        {/* ── Passagers : sélection directe à la création ── */}
        <SmartFormSection id="passengers" title={t('paxlog.create_ads.sections.passengers', 'Passagers') + ` (${stagedPax.length})`} level="essential" help={{ description: t('paxlog.create_ads.help.passengers_description'), tips: [ t('paxlog.create_ads.help.passengers_tip_search'), t('paxlog.create_ads.help.passengers_tip_external') ] }}>
          {/* Sélection déjà effectuée */}
          {stagedPax.length > 0 && (
            <div className="space-y-1 mb-2">
              {stagedPax.map((p, idx) => (
                <div
                  key={paxKey(p) + '-' + idx}
                  className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Users size={12} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{p.display_name}</p>
                      {p.subtitle && (
                        <p className="text-[10px] text-muted-foreground truncate">{p.subtitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        'gl-badge text-[9px]',
                        p.pax_type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral',
                      )}
                    >
                      {p.pax_type === 'internal'
                        ? t('paxlog.ads_detail.passenger_type.internal')
                        : t('paxlog.ads_detail.passenger_type.external')}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePax(idx)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      title={t('common.delete') as string}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recherche + sélection */}
          <div className="space-y-2 rounded-md border border-border bg-card p-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className={cn(panelInputClass, 'pl-7')}
                placeholder={t('paxlog.ads_detail.search_pax_placeholder') as string}
                value={paxSearch}
                onChange={(e) => setPaxSearch(e.target.value)}
              />
            </div>
            {paxCandidates && paxCandidates.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                {paxCandidates.map((c) => {
                  const key = paxKey({
                    user_id: c.source === 'user' ? c.user_id ?? null : null,
                    contact_id: c.source === 'contact' ? c.contact_id ?? null : null,
                  })
                  const alreadyAdded = stagedPaxKeys.has(key)
                  return (
                    <button
                      type="button"
                      key={`${c.source}-${c.id}`}
                      disabled={alreadyAdded}
                      className={cn(
                        'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors',
                        alreadyAdded
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-accent/60 cursor-pointer',
                      )}
                      onClick={() => addPax(c)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {c.last_name} {c.first_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.source === 'user'
                            ? t('paxlog.ads_detail.pax_candidate.user', {
                                email: c.email ? ` • ${c.email}` : '',
                              })
                            : t('paxlog.ads_detail.pax_candidate.contact', {
                                position: c.position ? ` • ${c.position}` : '',
                              })}
                        </p>
                      </div>
                      <Plus size={12} className={alreadyAdded ? 'opacity-0' : 'text-primary'} />
                    </button>
                  )
                })}
              </div>
            )}
            {debouncedPaxSearch.length >= 1 && paxCandidates && paxCandidates.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2 italic">
                {t('paxlog.ads_detail.empty.pax_search', { search: debouncedPaxSearch })}
              </p>
            )}
            {debouncedPaxSearch.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">
                {t('paxlog.create_ads.search_pax_hint', 'Commencez à taper pour rechercher un PAX (utilisateur interne ou contact).')}
              </p>
            )}
          </div>
        </SmartFormSection>

        <SmartFormSection id="attachments" title={t('common.attachments')} level="advanced" skippable collapsible defaultExpanded={false} help={{ description: t('paxlog.create_ads.help.attachments_description') }}>
          <AttachmentManager
            ownerType={stagingOwnerType}
            ownerId={stagingRef}
            compact
          />
        </SmartFormSection>

        <SmartFormSection id="notes" title={t('common.notes')} level="advanced" skippable collapsible defaultExpanded={false} help={{ description: t('paxlog.create_ads.help.notes_description') }}>
          <NoteManager
            ownerType={stagingOwnerType}
            ownerId={stagingRef}
            compact
          />
        </SmartFormSection>

        <SmartFormSection id="imputations" title={t('paxlog.create_ads.sections.imputations', 'Imputations')} level="advanced" skippable collapsible defaultExpanded={false} help={{ description: t('paxlog.create_ads.help.imputations_description') }}>
          <ImputationManager
            ownerType={stagingOwnerType}
            ownerId={stagingRef}
            editable
          />
        </SmartFormSection>

        <p className="text-xs text-muted-foreground italic">
          {t('paxlog.create_ads.footer_hint')}
        </p>
        {ctx?.mode === 'wizard' && (
          <SmartFormWizardNav
            onSubmit={() => (document.getElementById('create-ads-form') as HTMLFormElement)?.requestSubmit()}
            onCancel={closeDynamicPanel}
            submitDisabled={createAds.isPending}
            submitLabel={t('common.create')}
          />
        )}
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── AdS Detail Panel ──────────────────────────────────────────

