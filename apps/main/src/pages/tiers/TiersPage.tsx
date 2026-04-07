/**
 * Tiers (Companies) page -- Professional ERP module.
 *
 * Architecture:
 *  - DataTable with enriched columns (code, name, type, industry, contacts, status)
 *  - TierDetailPanel: company card + polymorphic coords + identifiers + contacts master-list
 *  - ContactDetailPanel: employee drill-down with own polymorphic tabs
 *
 * Key design decisions:
 *  - Contacts (employees) are NOT at the same level as phones/emails/addresses
 *  - Each contact is a first-class entity with its own phones, emails, addresses, notes, files
 *  - Company-level polymorphic data (phones, emails, addresses) is separate from contact-level
 *  - NO direct phone/email fields -- all managed via polymorphic Phone/ContactEmail system
 *  - Multiple legal identifiers per company (SIRET, RCCM, NIU, TVA, NIF, etc.)
 *  - ALL fields available at creation (no "add later" message)
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Building2, Plus, Loader2, Trash2, MapPin, Paperclip, MessageSquare,
  Phone, Mail, Users, ArrowLeft, Star, Pencil, Globe, Clock,
  ChevronDown, FileText, Search, ShieldBan, ShieldCheck, Link2, X,
  LayoutDashboard,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef, ImportExportConfig } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/ui/Tabs'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { normalizeNames } from '@/lib/normalize'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { usePermission } from '@/hooks/usePermission'
import { useDictionaryOptions, useDictionaryLabels } from '@/hooks/useDictionary'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
  InlineEditableSelect,
  InlineEditableTags,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  panelInputClass,
  SectionColumns,
  DetailFieldGrid,
  PanelContentLayout,
} from '@/components/layout/DynamicPanel'
import { AddressManager } from '@/components/shared/AddressManager'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { PhoneManager } from '@/components/shared/PhoneManager'
import { ContactEmailManager } from '@/components/shared/ContactEmailManager'
import { LegalIdentifierManager } from '@/components/shared/LegalIdentifierManager'
import { ReferentielManager } from '@/components/shared/ReferentielManager'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { SocialNetworkManager } from '@/components/shared/SocialNetworkManager'
import { OpeningHoursManager } from '@/components/shared/OpeningHoursManager'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useTiers, useCreateTier, useUpdateTier, useArchiveTier,
  useTierContacts, useCreateTierContact, useUpdateTierContact,
  useDeleteTierContact, useAllTierContacts, usePromoteTierContactToUser,
  useTierBlocks, useBlockTier, useUnblockTier,
  useTierExternalRefs, useCreateTierExternalRef, useDeleteTierExternalRef,
} from '@/hooks/useTiers'
import { useAddresses, useNotes, useAttachments, usePhones, useContactEmails, useSocialNetworks, useOpeningHours } from '@/hooks/useSettings'
import { useLegalIdentifiers } from '@/hooks/useUserSubModels'
import { useProjects } from '@/hooks/useProjets'
import { useToast } from '@/components/ui/Toast'
import type { Tier, TierCreate, TierContact, TierContactCreate, TierContactUpdate, TierContactWithTier } from '@/types/api'

// -- Constants ----------------------------------------------------------------

const EMPTY_CONTACT_FORM: TierContactCreate = {
  civility: null,
  first_name: '',
  last_name: '',
  position: null,
  department: null,
  is_primary: false,
}

// -- Create Tier Panel --------------------------------------------------------

function CreateTierPanel() {
  const { t } = useTranslation()
  const createTier = useCreateTier()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const tierTypeOptions = useDictionaryOptions('tier_type')
  const legalFormOptions = useDictionaryOptions('legal_form')
  const currencyOptions = useDictionaryOptions('currency')
  const languageOptions = useDictionaryOptions('language')
  const countryOptions = useDictionaryOptions('country')
  const [form, setForm] = useState<TierCreate>({
    name: '',
    type: 'client',
    alias: null,
    trade_name: null,
    website: null,
    phone: null,
    fax: null,
    email: null,
    legal_form: null,
    registration_number: null,
    tax_id: null,
    vat_number: null,
    capital: null,
    currency: 'XAF',
    fiscal_year_start: 1,
    industry: null,
    founded_date: null,
    payment_terms: null,
    description: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    zip_code: null,
    country: null,
    timezone: 'Africa/Kinshasa',
    language: 'fr',
    notes: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createTier.mutateAsync(normalizeNames(form))
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('tiers.create')}
      subtitle={t('tiers.title')}
      icon={<Building2 size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createTier.isPending}
            onClick={() => (document.getElementById('create-tier-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createTier.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-tier-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          {/* Type — full width */}
          <FormSection title={t('common.type')}>
            <TagSelector
              options={tierTypeOptions}
              value={form.type || 'client'}
              onChange={(v) => setForm({ ...form, type: v })}
            />
          </FormSection>

          {/* 2-column layout on wide screens */}
          <SectionColumns>
            {/* Column 1: Identification + Coordonnees */}
            <div className="@container space-y-5">
              <FormSection title={t('tiers.ui.sections.identity')}>
                <FormGrid>
                  <DynamicPanelField label={t('common.code')}>
                    <span className="text-sm font-mono text-muted-foreground italic">{t('tiers.ui.auto_generated')}</span>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.name')} required>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.company_name')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.trade_name')}>
                    <input type="text" value={form.trade_name ?? ''} onChange={(e) => setForm({ ...form, trade_name: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.trade_name')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.alias')}>
                    <input type="text" value={form.alias ?? ''} onChange={(e) => setForm({ ...form, alias: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.alias')} />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>

              <FormSection title={t('tiers.ui.sections.contact')}>
                <FormGrid>
                  <DynamicPanelField label={t('tiers.ui.website')}>
                    <input type="url" value={form.website ?? ''} onChange={(e) => setForm({ ...form, website: e.target.value || null })} className={panelInputClass} placeholder="https://..." />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.email')}>
                    <input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.email')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.phone')}>
                    <input type="text" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.phone')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.fax')}>
                    <input type="text" value={form.fax ?? ''} onChange={(e) => setForm({ ...form, fax: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.fax')} />
                  </DynamicPanelField>
                </FormGrid>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {t('tiers.ui.contact_hint')}
                </p>
              </FormSection>

              <FormSection title={t('tiers.ui.sections.address')}>
                <FormGrid>
                  <DynamicPanelField label={t('tiers.ui.address_line1')}>
                    <input type="text" value={form.address_line1 ?? ''} onChange={(e) => setForm({ ...form, address_line1: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.address_line1')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.address_line2')}>
                    <input type="text" value={form.address_line2 ?? ''} onChange={(e) => setForm({ ...form, address_line2: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.address_line2')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.city')}>
                    <input type="text" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.state')}>
                    <input type="text" value={form.state ?? ''} onChange={(e) => setForm({ ...form, state: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.zip_code')}>
                    <input type="text" value={form.zip_code ?? ''} onChange={(e) => setForm({ ...form, zip_code: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.country')}>
                    {countryOptions.length > 0 ? (
                      <TagSelector options={countryOptions} value={form.country || ''} onChange={(v) => setForm({ ...form, country: v || null })} />
                    ) : (
                      <input type="text" value={form.country ?? ''} onChange={(e) => setForm({ ...form, country: e.target.value || null })} className={panelInputClass} />
                    )}
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>

            {/* Column 2: Informations legales + Description */}
            <div className="@container space-y-5">
              <FormSection title={t('tiers.ui.sections.legal')}>
                <FormGrid>
                  <DynamicPanelField label={t('tiers.ui.legal_form')}>
                    <select
                      value={form.legal_form ?? ''}
                      onChange={(e) => setForm({ ...form, legal_form: e.target.value || null })}
                      className={panelInputClass}
                    >
                      <option value="">--</option>
                      {legalFormOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.capital')}>
                    <input type="number" step="any" value={form.capital ?? ''} onChange={(e) => setForm({ ...form, capital: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.currency')}>
                    <select
                      value={form.currency ?? 'XAF'}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className={panelInputClass}
                    >
                      {currencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.industry')}>
                    <input type="text" value={form.industry ?? ''} onChange={(e) => setForm({ ...form, industry: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.industry')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.payment_terms')}>
                    <input type="text" value={form.payment_terms ?? ''} onChange={(e) => setForm({ ...form, payment_terms: e.target.value || null })} className={panelInputClass} placeholder={t('tiers.ui.placeholders.payment_terms')} />
                  </DynamicPanelField>
                </FormGrid>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {t('tiers.ui.legal_hint')}
                </p>
              </FormSection>

              <FormSection title={t('tiers.ui.sections.configuration')}>
                <FormGrid>
                  <DynamicPanelField label={t('tiers.ui.language')}>
                    {languageOptions.length > 0 ? (
                      <TagSelector options={languageOptions} value={form.language || 'fr'} onChange={(v) => setForm({ ...form, language: v || 'fr' })} />
                    ) : (
                      <input type="text" value={form.language ?? 'fr'} onChange={(e) => setForm({ ...form, language: e.target.value || 'fr' })} className={panelInputClass} />
                    )}
                  </DynamicPanelField>
                  <DynamicPanelField label={t('tiers.ui.timezone')}>
                    <input type="text" value={form.timezone ?? 'Africa/Kinshasa'} onChange={(e) => setForm({ ...form, timezone: e.target.value || 'Africa/Kinshasa' })} className={panelInputClass} placeholder="Africa/Kinshasa" />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>

              <FormSection title={t('common.description')} collapsible defaultExpanded={false}>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder={t('tiers.ui.placeholders.description')}
                  rows={3}
                />
              </FormSection>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Tier Detail Panel --------------------------------------------------------

const MONTH_LABELS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function formatCapital(amount: number, currency: string = 'XAF'): string {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return new Intl.NumberFormat('fr-FR').format(amount) + (currency ? ` ${currency}` : '')
  }
}

function TierDetailPanel({ id, initialContactId }: { id: string; initialContactId?: string }) {
  const { t, i18n } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const archiveTier = useArchiveTier()
  const { data } = useTiers({ page: 1, page_size: 100 })
  const tier = data?.items.find((t) => t.id === id)
  const updateTier = useUpdateTier()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('tier.update')
  const tierTypeOptions = useDictionaryOptions('tier_type')
  const legalFormOptions = useDictionaryOptions('legal_form')
  const countryOptions = useDictionaryOptions('country')
  const countryLabels = useDictionaryLabels('country')
  const languageLabels = useDictionaryLabels('language', {
    fr: 'Français', en: 'English', es: 'Español', pt: 'Português',
    de: 'Deutsch', it: 'Italiano', ar: 'العربية', zh: '中文',
  })
  const languageOptions = useMemo(
    () => Object.entries(languageLabels).map(([value, label]) => ({ value, label })),
    [languageLabels],
  )
  const monthLabel = (n: number) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2000, Math.max(0, n - 1), 1))
    } catch {
      return MONTH_LABELS_FR[Math.max(0, Math.min(11, n - 1))]
    }
  }
  const fiscalYearOptions = useMemo(() => (
    Array.from({ length: 12 }, (_, idx) => {
      const value = String(idx + 1)
      return { value, label: monthLabel(idx + 1) }
    })
  ), [i18n.language])

  // Drill-down state: null = company view, string = contact detail view.
  // Pre-selected from meta.contact_id when opening the panel directly from
  // the global contacts DataTable.
  const [selectedContactId, setSelectedContactId] = useState<string | null>(initialContactId ?? null)

  const handleInlineSave = useCallback((field: keyof TierCreate, value: string | number | null) => {
    updateTier.mutate({ id, payload: normalizeNames({ [field]: value } as Partial<TierCreate>) })
  }, [id, updateTier])

  // Fetch counts for company-level data
  const { data: phones } = usePhones('tier', tier?.id)
  const { data: contactEmails } = useContactEmails('tier', tier?.id)
  const { data: addresses } = useAddresses('tier', tier?.id)
  const { data: notes } = useNotes('tier', tier?.id)
  const { data: attachments } = useAttachments('tier', tier?.id)
  const { data: socialNetworks } = useSocialNetworks('tier', tier?.id)
  const { data: openingHours } = useOpeningHours('tier', tier?.id)
  const { data: identifiers } = useLegalIdentifiers('tier', tier?.id)

  // Contacts (employees)
  const { data: contacts, isLoading: contactsLoading } = useTierContacts(tier?.id)
  const contactList: TierContact[] = contacts ?? []

  // Blocks
  const { data: blocks } = useTierBlocks(tier?.id)
  const blockTier = useBlockTier()
  const unblockTier = useUnblockTier()
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [blockType, setBlockType] = useState('purchasing')

  // External References
  const { data: externalRefs } = useTierExternalRefs(tier?.id)
  const createExternalRef = useCreateTierExternalRef()
  const deleteExternalRef = useDeleteTierExternalRef()
  const [showRefForm, setShowRefForm] = useState(false)
  const [refSystem, setRefSystem] = useState('SAP')
  const [refCode, setRefCode] = useState('')

  // Related projects (where this tier is contractor/client)
  const { data: relatedProjects } = useProjects({ tier_id: tier?.id, page_size: 10 })

  if (!tier) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Building2 size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  // -- Contact Detail (drill-down) --
  if (selectedContactId) {
    return (
      <ContactDetailPanel
        tierId={tier.id}
        tierName={tier.name}
        contactId={selectedContactId}
        onBack={() => setSelectedContactId(null)}
      />
    )
  }

  // -- Company View --
  return (
    <DynamicPanelShell
      title={tier.code}
      subtitle={tier.name}
      icon={<Building2 size={14} className="text-primary" />}
      actions={
        <DangerConfirmButton
          icon={<Trash2 size={12} />}
          onConfirm={() => { archiveTier.mutate(id); closeDynamicPanel() }}
          confirmLabel={t('common.confirm_delete')}
        >
          {t('common.delete')}
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        {/* Tags — full width */}
        <TagManager ownerType="tier" ownerId={tier.id} compact />

        {/* 2-column layout on wide screens */}
        <SectionColumns>
          {/* ── Left column: Fiche entreprise + Coordonnees ── */}
          <div className="@container space-y-5">
            <FormSection title={t('tiers.ui.sections.identity')} collapsible defaultExpanded storageKey="tier-detail-sections">
              <DetailFieldGrid>
                <InlineEditableRow label={t('common.name')} value={tier.name} onSave={(v) => handleInlineSave('name', v)} />
                <ReadOnlyRow label={t('common.code')} value={<span className="text-sm font-mono font-medium text-foreground">{tier.code || '—'}</span>} />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <InlineEditableRow label={t('tiers.ui.trade_name')} value={tier.trade_name || ''} onSave={(v) => handleInlineSave('trade_name', v)} />
                <InlineEditableRow label={t('tiers.ui.alias')} value={tier.alias || ''} onSave={(v) => handleInlineSave('alias', v)} />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <InlineEditableTags
                  label={t('common.type')}
                  value={tier.type || ''}
                  options={tierTypeOptions}
                  onSave={(v) => handleInlineSave('type', v)}
                />
                <InlineEditableSelect label={t('tiers.ui.country')} value={tier.country || ''} displayValue={tier.country ? (countryLabels[tier.country] || tier.country) : ''} options={countryOptions} onSave={(v) => handleInlineSave('country', v)} />
                <ReadOnlyRow
                  label={t('common.status')}
                  value={
                    <span className={cn('gl-badge', tier.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                      {tier.active ? t('common.active') : t('common.archived')}
                    </span>
                  }
                />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <InlineEditableSelect label={t('tiers.ui.language')} value={tier.language || 'fr'} displayValue={languageLabels[tier.language || 'fr'] || tier.language || 'Français'} options={languageOptions} onSave={(v) => handleInlineSave('language', v)} />
                <InlineEditableRow label={t('tiers.ui.timezone')} value={tier.timezone || 'Africa/Kinshasa'} onSave={(v) => handleInlineSave('timezone', v)} />
                <InlineEditableSelect label={t('tiers.ui.fiscal_year_start')} value={String(tier.fiscal_year_start || 1)} displayValue={monthLabel(tier.fiscal_year_start || 1)} options={fiscalYearOptions} onSave={(v) => handleInlineSave('fiscal_year_start', Number(v) || 1)} />
              </DetailFieldGrid>
            </FormSection>

            <FormSection title={t('tiers.ui.sections.contact')} collapsible defaultExpanded storageKey="tier-detail-sections">
              {tier.website && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Globe size={11} className="shrink-0" />
                  <a href={tier.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary truncate">{tier.website}</a>
                </div>
              )}
              <DetailFieldGrid>
                <InlineEditableRow label={t('tiers.ui.website')} value={tier.website || ''} onSave={(v) => handleInlineSave('website', v)} />
                <InlineEditableRow label={t('common.email')} value={tier.email || ''} onSave={(v) => handleInlineSave('email', v)} />
                <InlineEditableRow label={t('common.phone')} value={tier.phone || ''} onSave={(v) => handleInlineSave('phone', v)} />
                <InlineEditableRow label={t('tiers.ui.fax')} value={tier.fax || ''} onSave={(v) => handleInlineSave('fax', v)} />
              </DetailFieldGrid>
              <div className="border-t border-border/40 pt-3 mt-3">
                <DetailFieldGrid>
                  <InlineEditableRow label={t('tiers.ui.address_line1')} value={tier.address_line1 || ''} onSave={(v) => handleInlineSave('address_line1', v)} />
                  <InlineEditableRow label={t('tiers.ui.address_line2')} value={tier.address_line2 || ''} onSave={(v) => handleInlineSave('address_line2', v)} />
                  <InlineEditableRow label={t('tiers.ui.city')} value={tier.city || ''} onSave={(v) => handleInlineSave('city', v)} />
                  <InlineEditableRow label={t('tiers.ui.state')} value={tier.state || ''} onSave={(v) => handleInlineSave('state', v)} />
                  <InlineEditableRow label={t('tiers.ui.zip_code')} value={tier.zip_code || ''} onSave={(v) => handleInlineSave('zip_code', v)} />
                </DetailFieldGrid>
              </div>

              <div className="space-y-3 border-t border-border/40 pt-3 mt-2">
                <SubSectionLabel icon={Phone} label={t('shared.phones.title')} count={phones?.length ?? 0} />
                <PhoneManager ownerType="tier" ownerId={tier.id} compact />

                <SubSectionLabel icon={Mail} label={t('shared.emails.title')} count={contactEmails?.length ?? 0} />
                <ContactEmailManager ownerType="tier" ownerId={tier.id} compact />

                <SubSectionLabel icon={MapPin} label={t('shared.addresses.title')} count={addresses?.length ?? 0} />
                <AddressManager ownerType="tier" ownerId={tier.id} compact />
              </div>
            </FormSection>
          </div>

          {/* ── Right column: Infos legales + Contacts ── */}
          <div className="@container space-y-5">
            <FormSection title={`${t('tiers.ui.sections.legal')} (${identifiers?.length ?? 0})`} collapsible defaultExpanded storageKey="tier-detail-sections">
              <DetailFieldGrid>
                <InlineEditableTags
                  label={t('tiers.ui.legal_form')}
                  value={tier.legal_form || ''}
                  options={legalFormOptions}
                  onSave={(v) => handleInlineSave('legal_form', v)}
                />
                <InlineEditableRow label={t('tiers.ui.registration_number')} value={tier.registration_number || ''} onSave={(v) => handleInlineSave('registration_number', v)} />
                <InlineEditableRow label={t('tiers.ui.tax_id')} value={tier.tax_id || ''} onSave={(v) => handleInlineSave('tax_id', v)} />
                <InlineEditableRow label={t('tiers.ui.vat_number')} value={tier.vat_number || ''} onSave={(v) => handleInlineSave('vat_number', v)} />
                <InlineEditableRow
                  label={t('tiers.ui.capital')}
                  value={tier.capital ? String(tier.capital) : ''}
                  displayValue={tier.capital ? formatCapital(tier.capital, tier.currency) : ''}
                  onSave={(v) => handleInlineSave('capital', v)}
                />
                <ReadOnlyRow label={t('tiers.ui.currency')} value={<span className="text-sm">{tier.currency || 'XAF'}</span>} />
                <InlineEditableRow label={t('tiers.ui.industry')} value={tier.industry || ''} onSave={(v) => handleInlineSave('industry', v)} />
                <InlineEditableRow label={t('tiers.ui.payment_terms')} value={tier.payment_terms || ''} onSave={(v) => handleInlineSave('payment_terms', v)} />
                <InlineEditableRow label={t('tiers.ui.founded_date')} value={tier.founded_date || ''} onSave={(v) => handleInlineSave('founded_date', v)} />
                <InlineEditableRow label={t('tiers.ui.logo_url')} value={tier.logo_url || ''} onSave={(v) => handleInlineSave('logo_url', v)} />
              </DetailFieldGrid>

              <div className="border-t border-border/40 pt-3 mt-3">
                <SubSectionLabel icon={FileText} label={t('shared.identifiers.title')} count={identifiers?.length ?? 0} />
                <LegalIdentifierManager ownerType="tier" ownerId={tier.id} compact />
              </div>
            </FormSection>

            <FormSection title={`${t('tiers.tab_contacts')} (${contactList.length})`} collapsible defaultExpanded storageKey="tier-detail-sections">
              <ContactListSection
                tierId={tier.id}
                contacts={contactList}
                isLoading={contactsLoading}
                onSelectContact={setSelectedContactId}
                canEdit={canEdit}
              />
            </FormSection>
          </div>
        </SectionColumns>

        {/* Blocage */}
        <FormSection
          title={
            <span className="flex items-center gap-2">
              {t('tiers.ui.blocking_section')}
              {tier.is_blocked && (
                <span className="gl-badge gl-badge-danger text-[10px]">
                  <ShieldBan size={10} className="mr-0.5" />{t('tiers.ui.blocked')}
                </span>
              )}
            </span>
          }
          id="tier-blocking-section"
          collapsible
          defaultExpanded={tier.is_blocked}
          storageKey="tier-detail-blocage"
        >
          {/* Block/Unblock actions */}
          {canEdit && (
            <div className="flex items-center gap-2 mb-3">
              {tier.is_blocked ? (
                <button
                  onClick={() => setShowBlockForm(!showBlockForm)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 transition-colors"
                >
                  <ShieldCheck size={12} />{t('tiers.ui.unblock')}
                </button>
              ) : (
                <button
                  onClick={() => setShowBlockForm(!showBlockForm)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 transition-colors"
                >
                  <ShieldBan size={12} />{t('tiers.ui.block')}
                </button>
              )}
            </div>
          )}

          {showBlockForm && (
            <div className="border border-border rounded-md p-3 mb-3 space-y-2 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">{t('tiers.ui.block_type')}</label>
                  <select value={blockType} onChange={(e) => setBlockType(e.target.value)} className={panelInputClass}>
                    <option value="purchasing">{t('tiers.ui.block_purchasing')}</option>
                    <option value="payment">{t('tiers.ui.block_payment')}</option>
                    <option value="all">{t('tiers.ui.block_full')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">{t('tiers.ui.block_reason')}</label>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className={`${panelInputClass} min-h-[50px] resize-y`}
                  placeholder={t('tiers.ui.block_reason_placeholder')}
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowBlockForm(false); setBlockReason('') }} className="text-xs text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
                <button
                  disabled={!blockReason.trim()}
                  onClick={() => {
                    const action = tier.is_blocked ? unblockTier : blockTier
                    action.mutate(
                      { tierId: tier.id, payload: { reason: blockReason, block_type: blockType } },
                      { onSuccess: () => { setShowBlockForm(false); setBlockReason('') } }
                    )
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {tier.is_blocked ? t('tiers.ui.unblock') : t('tiers.ui.block')}
                </button>
              </div>
            </div>
          )}

          {/* Block history */}
          {blocks && blocks.length > 0 && (
            <div className="space-y-1.5">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-start gap-2 px-2 py-1.5 rounded text-xs border border-border/40 bg-background">
                  {b.action === 'block' ? (
                    <ShieldBan size={12} className="text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <ShieldCheck size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-medium', b.action === 'block' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
                        {b.action === 'block' ? t('tiers.ui.blocked') : t('tiers.ui.unblocked')}
                      </span>
                      <span className="gl-badge gl-badge-neutral text-[9px]">{b.block_type}</span>
                    </div>
                    <p className="text-muted-foreground truncate">{b.reason}</p>
                    <p className="text-[10px] text-muted-foreground/60">
                      {b.performer_name} — {new Date(b.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(!blocks || blocks.length === 0) && !tier.is_blocked && (
            <p className="text-xs text-muted-foreground/60 italic">{t('tiers.ui.no_block_history')}</p>
          )}
        </FormSection>

        {/* Identifiants externes */}
        <FormSection title={`${t('tiers.ui.external_refs')} (${externalRefs?.length ?? 0})`} collapsible defaultExpanded={false} storageKey="tier-detail-ext-refs">
          {canEdit && (
            <div className="mb-2">
              {!showRefForm ? (
                <button
                  onClick={() => setShowRefForm(true)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                >
                  <Plus size={11} /> {t('tiers.ui.add_external_ref')}
                </button>
              ) : (
                <div className="border border-border rounded-md p-3 space-y-2 bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">{t('tiers.ui.system')}</label>
                      <select value={refSystem} onChange={(e) => setRefSystem(e.target.value)} className={panelInputClass}>
                        <option value="SAP">SAP</option>
                        <option value="Gouti">Gouti</option>
                        <option value="Intranet">Intranet</option>
                        <option value="Legacy">Legacy</option>
                        <option value="Other">{t('common.other')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">{t('common.code')} *</label>
                      <input
                        type="text"
                        value={refCode}
                        onChange={(e) => setRefCode(e.target.value)}
                        className={panelInputClass}
                        placeholder="Ex: 12345"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setShowRefForm(false); setRefCode('') }} className="text-xs text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
                    <button
                      disabled={!refCode.trim() || createExternalRef.isPending}
                      onClick={() => {
                        createExternalRef.mutate(
                          { tierId: tier.id, payload: { system: refSystem, code: refCode } },
                          { onSuccess: () => { setShowRefForm(false); setRefCode('') } }
                        )
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {createExternalRef.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      {t('common.add')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {externalRefs && externalRefs.length > 0 ? (
            <div className="space-y-1">
              {externalRefs.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors group">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link2 size={11} className="text-muted-foreground shrink-0" />
                    <span className="gl-badge gl-badge-neutral text-[10px] shrink-0">{ref.system}</span>
                    <span className="text-sm font-mono text-foreground truncate">{ref.code}</span>
                    {ref.label && <span className="text-[10px] text-muted-foreground truncate">({ref.label})</span>}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => deleteExternalRef.mutate({ tierId: tier.id, refId: ref.id })}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      title={t('common.delete')}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">{t('tiers.ui.no_external_refs')}</p>
          )}
        </FormSection>

        {/* Conformite */}
        <FormSection title={t('nav.conformite')} collapsible defaultExpanded={false} storageKey="tier-detail-conformite">
          <ReferentielManager ownerType="tier" ownerId={tier.id} compact />
        </FormSection>

        {/* Projets liés */}
        {relatedProjects && relatedProjects.items.length > 0 && (
          <FormSection title={`${t('tiers.ui.related_projects')} (${relatedProjects.total})`} collapsible defaultExpanded={false} storageKey="tier-detail-projets">
            <div className="space-y-1.5">
              {relatedProjects.items.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors">
                  <CrossModuleLink module="projets" id={p.id} label={`${p.code} — ${p.name}`} mode="navigate" />
                  <span className={cn('gl-badge text-[10px]', p.status === 'active' ? 'gl-badge-success' : 'gl-badge-neutral')}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </FormSection>
        )}

        {/* Full-width sections below the columns */}
        <FormSection title={t('tiers.ui.sections.notes_documents')} collapsible defaultExpanded={false} storageKey="tier-detail-sections">
          <DetailFieldGrid>
            <div>
              <SubSectionLabel icon={MessageSquare} label={t('common.notes')} count={notes?.length ?? 0} />
              <NoteManager ownerType="tier" ownerId={tier.id} compact />
            </div>
            <div>
              <SubSectionLabel icon={Paperclip} label={t('common.files')} count={attachments?.length ?? 0} />
              <AttachmentManager ownerType="tier" ownerId={tier.id} compact />
            </div>
          </DetailFieldGrid>
        </FormSection>

        <FormSection title={t('tiers.ui.sections.configuration')} collapsible defaultExpanded={false} storageKey="tier-detail-configuration">
          <DetailFieldGrid>
            <div>
              <SubSectionLabel icon={Globe} label={t('tiers.ui.social_networks')} count={socialNetworks?.length ?? 0} />
              <SocialNetworkManager ownerType="tier" ownerId={tier.id} compact />
            </div>
            <div>
              <SubSectionLabel icon={Clock} label={t('tiers.ui.opening_hours')} count={openingHours?.length ?? 0} />
              <OpeningHoursManager ownerType="tier" ownerId={tier.id} compact />
            </div>
          </DetailFieldGrid>
        </FormSection>

        <FormSection title={t('common.description')} collapsible defaultExpanded={false} storageKey="tier-detail-sections">
          <InlineEditableRow
            label={t('common.description')}
            value={tier.description || ''}
            onSave={(v) => handleInlineSave('description', v)}
          />
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Sub-section label --------------------------------------------------------

function SubSectionLabel({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 pt-2 pb-1">
      <Icon size={11} className="text-muted-foreground" />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {count > 0 && (
        <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-px font-semibold">{count}</span>
      )}
    </div>
  )
}

// -- Contact List Section (inside TierDetailPanel) ----------------------------

const CONTACTS_PAGE_SIZE = 15

function ContactListSection({
  tierId,
  contacts,
  isLoading,
  onSelectContact,
  canEdit,
}: {
  tierId: string
  contacts: TierContact[]
  isLoading: boolean
  onSelectContact: (id: string) => void
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createContact = useCreateTierContact()
  const civilityOptions = useDictionaryOptions('civility')
  const civilityLabels = useDictionaryLabels('civility')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<TierContactCreate>(EMPTY_CONTACT_FORM)
  const [contactSearch, setContactSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(CONTACTS_PAGE_SIZE)

  // Filter contacts by search (name, position, department)
  const filtered = useMemo(() => {
    if (!contactSearch.trim()) return contacts
    const q = contactSearch.toLowerCase()
    return contacts.filter((c) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.position && c.position.toLowerCase().includes(q)) ||
      (c.department && c.department.toLowerCase().includes(q))
    )
  }, [contacts, contactSearch])

  // Paginate: show only visibleCount items
  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  // Reset visible count when search changes
  useEffect(() => { setVisibleCount(CONTACTS_PAGE_SIZE) }, [contactSearch])

  const handleCreate = useCallback(async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return
    try {
      await createContact.mutateAsync({ tierId, payload: normalizeNames(form) })
      setForm(EMPTY_CONTACT_FORM)
      setShowForm(false)
      toast({ title: t('tiers.ui.contact_created'), variant: 'success' })
    } catch {
      toast({ title: t('common.error_create'), variant: 'error' })
    }
  }, [tierId, form, createContact, toast, t])

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-2">
      {/* Toolbar: search + add button */}
      <div className="flex items-center gap-2">
        {contacts.length > 5 && (
          <div className="flex-1 relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder={t('tiers.ui.search_contact')}
              className={cn(panelInputClass, 'pl-7 h-7 text-[11px]')}
            />
          </div>
        )}
        {canEdit && (
          <button
            onClick={() => { setShowForm(!showForm); setForm(EMPTY_CONTACT_FORM) }}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium shrink-0"
          >
            <Plus size={12} />
            {t('common.add')}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-border rounded-md p-3 space-y-2 bg-accent/20">
          <FormGrid>
            <DynamicPanelField label={t('tiers.ui.civility')}>
              <select value={form.civility ?? ''} onChange={(e) => setForm({ ...form, civility: e.target.value || null })} className={panelInputClass}>
                <option value="">--</option>
                {civilityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('tiers.ui.first_name')} required>
              <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('tiers.ui.last_name')} required>
              <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('tiers.ui.position')}>
              <input type="text" value={form.position ?? ''} onChange={(e) => setForm({ ...form, position: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('tiers.ui.department')}>
              <input type="text" value={form.department ?? ''} onChange={(e) => setForm({ ...form, department: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} className="rounded border-border" />
            {t('tiers.ui.primary_contact')}
          </label>
          <p className="text-[9px] text-muted-foreground">
            {t('tiers.ui.contact_detail_hint')}
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={handleCreate}
              disabled={!form.first_name.trim() || !form.last_name.trim() || createContact.isPending}
              className="px-2 py-1 rounded text-[11px] font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {createContact.isPending ? <Loader2 size={11} className="animate-spin" /> : t('common.create')}
            </button>
            <button onClick={() => setShowForm(false)} className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {contacts.length === 0 && !showForm && (
        <EmptyState
          icon={Users}
          title={t('tiers.ui.no_contacts')}
          description={t('tiers.ui.no_contacts_description')}
          variant="search"
          size="compact"
          action={canEdit ? { label: t('tiers.ui.add_contact'), onClick: () => setShowForm(true) } : undefined}
        />
      )}

      {/* Filtered count (when searching) */}
      {contactSearch && contacts.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {filtered.length} / {contacts.length} contact{contacts.length > 1 ? 's' : ''}
        </p>
      )}

      {/* No results after search */}
      {contactSearch && filtered.length === 0 && contacts.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-3">{t('tiers.ui.no_contact_results', { search: contactSearch })}</p>
      )}

      {/* Contact cards -- paginated */}
      {visible.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden divide-y divide-border/60">
          {visible.map((contact) => (
            <button
              key={contact.id}
              onClick={() => onSelectContact(contact.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-accent/40 transition-colors',
                contact.is_primary && 'bg-primary/[0.03]',
              )}
            >
              {contact.photo_url ? (
                <img
                  src={contact.photo_url}
                  alt={`${contact.first_name} ${contact.last_name}`}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0',
                  contact.is_primary ? 'bg-primary/15 text-primary' : 'bg-accent text-muted-foreground',
                )}>
                  {contact.first_name[0]}{contact.last_name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {contact.civility && <span className="text-[10px] text-muted-foreground">{civilityLabels[contact.civility] || contact.civility}</span>}
                  <span className="text-xs font-medium text-foreground truncate">
                    {contact.first_name} {contact.last_name}
                  </span>
                  {contact.is_primary && <Star size={10} className="text-primary fill-primary shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {contact.position && <span className="text-[10px] text-muted-foreground truncate">{contact.position}</span>}
                  {contact.department && <span className="text-[10px] text-muted-foreground/60 truncate">/ {contact.department}</span>}
                </div>
              </div>
              <ChevronDown size={12} className="text-muted-foreground/40 -rotate-90 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((v) => v + CONTACTS_PAGE_SIZE)}
          className="w-full text-center text-[11px] text-primary hover:text-primary/80 font-medium py-1.5"
        >
          {t('tiers.ui.show_more_contacts', { count: filtered.length - visibleCount })}
        </button>
      )}
    </div>
  )
}

// -- Contact Detail Panel (drill-down from TierDetailPanel) -------------------

function ContactDetailPanel({
  tierId,
  tierName,
  contactId,
  onBack,
}: {
  tierId: string
  tierName: string
  contactId: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('tier.update')
  const canPromote = hasPermission('user.create')
  const civilityOptions = useDictionaryOptions('civility')
  const civilityLabels = useDictionaryLabels('civility')
  const { data: contacts } = useTierContacts(tierId)
  const contact = contacts?.find((c) => c.id === contactId)

  // Fetch polymorphic counts for badge display
  const { data: contactPhones } = usePhones('tier_contact', contact?.id)
  const { data: contactCEmails } = useContactEmails('tier_contact', contact?.id)
  const { data: contactAddresses } = useAddresses('tier_contact', contact?.id)
  const { data: contactNotes } = useNotes('tier_contact', contact?.id)
  const { data: contactAttachments } = useAttachments('tier_contact', contact?.id)

  const updateContact = useUpdateTierContact()
  const deleteContact = useDeleteTierContact()
  const promoteContact = usePromoteTierContactToUser()
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<TierContactUpdate>({})

  const startEdit = useCallback(() => {
    if (!contact) return
    setEditForm({
      civility: contact.civility,
      first_name: contact.first_name,
      last_name: contact.last_name,
      position: contact.position,
      department: contact.department,
      is_primary: contact.is_primary,
    })
    setEditMode(true)
  }, [contact])

  const handleSave = useCallback(async () => {
    try {
      await updateContact.mutateAsync({ tierId, contactId, payload: normalizeNames(editForm) })
      setEditMode(false)
      toast({ title: t('tiers.ui.contact_updated'), variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [tierId, contactId, editForm, updateContact, toast, t])

  const handleDelete = useCallback(async () => {
    try {
      await deleteContact.mutateAsync({ tierId, contactId })
      onBack()
      toast({ title: t('tiers.ui.contact_deleted'), variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [tierId, contactId, deleteContact, onBack, toast, t])

  const handleSetPrimary = useCallback(async () => {
    try {
      await updateContact.mutateAsync({ tierId, contactId, payload: { is_primary: true } })
      toast({ title: t('tiers.ui.primary_contact_set'), variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [tierId, contactId, updateContact, toast, t])

  const handlePromote = useCallback(async () => {
    try {
      await promoteContact.mutateAsync({
        tierId,
        contactId,
        payload: { language: 'fr', send_invitation: true },
      })
      toast({ title: t('tiers.ui.contact_promoted'), variant: 'success' })
    } catch {
      toast({ title: t('tiers.ui.contact_promote_error'), variant: 'error' })
    }
  }, [tierId, contactId, promoteContact, toast, t])

  if (!contact) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  const civilityLabel = contact.civility ? (civilityLabels[contact.civility] || contact.civility) : ''
  const fullName = `${civilityLabel ? civilityLabel + ' ' : ''}${contact.first_name} ${contact.last_name}`

  return (
    <DynamicPanelShell
      title={fullName}
      subtitle={contact.position || tierName}
      icon={<Users size={14} className="text-primary" />}
      actions={
        <>
          {canEdit && (
            <>
              {!editMode && (
                <PanelActionButton onClick={startEdit} icon={<Pencil size={11} />}>
                  {t('common.edit')}
                </PanelActionButton>
              )}
              <DangerConfirmButton
                icon={<Trash2 size={12} />}
                onConfirm={handleDelete}
                confirmLabel={t('common.confirm_delete')}
              >
                {t('common.delete')}
              </DangerConfirmButton>
            </>
          )}
        </>
      }
    >
      <PanelContentLayout>
        {/* Back button + breadcrumb */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium -mt-1"
        >
          <ArrowLeft size={12} />
          <Building2 size={11} />
          {tierName}
        </button>

        {/* Primary badge */}
        {contact.is_primary && (
          <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
            <Star size={11} className="fill-primary" />
            {t('tiers.ui.primary_contact')}
          </div>
        )}

        {/* 2-column layout on wide screens */}
        <SectionColumns>
          {/* ── Left column: Fiche employe + Actions ── */}
          <div className="@container space-y-5">
            <FormSection title={t('tiers.ui.sections.contact_identity')} collapsible defaultExpanded storageKey="contact-detail-sections">
              {editMode ? (
                <div className="space-y-2">
                  <FormGrid>
                    <DynamicPanelField label={t('tiers.ui.civility')}>
                      <select value={editForm.civility ?? ''} onChange={(e) => setEditForm({ ...editForm, civility: e.target.value || null })} className={panelInputClass}>
                        <option value="">--</option>
                        {civilityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </DynamicPanelField>
                    <DynamicPanelField label={t('tiers.ui.first_name')} required>
                      <input type="text" value={editForm.first_name ?? ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('tiers.ui.last_name')} required>
                      <input type="text" value={editForm.last_name ?? ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('tiers.ui.position')}>
                      <input type="text" value={editForm.position ?? ''} onChange={(e) => setEditForm({ ...editForm, position: e.target.value || null })} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('tiers.ui.department')}>
                      <input type="text" value={editForm.department ?? ''} onChange={(e) => setEditForm({ ...editForm, department: e.target.value || null })} className={panelInputClass} />
                    </DynamicPanelField>
                  </FormGrid>
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={handleSave}
                      disabled={!editForm.first_name?.trim() || !editForm.last_name?.trim() || updateContact.isPending}
                      className="px-2.5 py-1 rounded text-[11px] font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {updateContact.isPending ? <Loader2 size={11} className="animate-spin" /> : t('common.save')}
                    </button>
                    <button onClick={() => setEditMode(false)} className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent">
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <DetailFieldGrid>
                  <ReadOnlyRow label={t('tiers.ui.civility')} value={civilityLabel || '--'} />
                  <ReadOnlyRow label={t('tiers.ui.first_name')} value={contact.first_name} />
                  <ReadOnlyRow label={t('tiers.ui.last_name')} value={contact.last_name} />
                  <ReadOnlyRow label={t('tiers.ui.position')} value={contact.position || '--'} />
                  <ReadOnlyRow label={t('tiers.ui.department')} value={contact.department || '--'} />
                </DetailFieldGrid>
              )}
            </FormSection>

            <FormSection title={t('tiers.ui.sections.access')} collapsible defaultExpanded storageKey="contact-detail-sections">
              <DetailFieldGrid>
                <ReadOnlyRow
                  label={t('tiers.ui.linked_user')}
                  value={contact.linked_user_id
                    ? <CrossModuleLink module="users" id={contact.linked_user_id} label={contact.linked_user_email || t('tiers.ui.external_user')} showIcon={false} className="text-xs" />
                    : t('tiers.ui.no_linked_user')}
                />
                <ReadOnlyRow label={t('common.email')} value={contact.email || '--'} />
              </DetailFieldGrid>
              {canPromote && !contact.linked_user_id && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {contact.email ? t('tiers.ui.promote_hint') : t('tiers.ui.promote_missing_email')}
                  </p>
                  <button
                    onClick={handlePromote}
                    disabled={!contact.email || promoteContact.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {promoteContact.isPending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                    {t('tiers.ui.promote_to_external_user')}
                  </button>
                </div>
              )}
            </FormSection>

            {/* Actions */}
            {canEdit && !editMode && (
              <div className="flex items-center gap-2 flex-wrap">
                {!contact.is_primary && (
                  <button
                    onClick={handleSetPrimary}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                  >
                    <Star size={10} /> {t('tiers.ui.set_primary_contact')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Right column: Coordonnees ── */}
          <div className="@container space-y-5">
            <FormSection title={t('tiers.ui.sections.contact_details')} collapsible defaultExpanded storageKey="contact-detail-sections">
              <SubSectionLabel icon={Phone} label={t('shared.phones.title')} count={contactPhones?.length ?? 0} />
              <PhoneManager ownerType="tier_contact" ownerId={contact.id} compact />

              <SubSectionLabel icon={Mail} label={t('shared.emails.title')} count={contactCEmails?.length ?? 0} />
              <ContactEmailManager ownerType="tier_contact" ownerId={contact.id} compact />

              <SubSectionLabel icon={MapPin} label={t('shared.addresses.title')} count={contactAddresses?.length ?? 0} />
              <AddressManager ownerType="tier_contact" ownerId={contact.id} compact />
            </FormSection>
          </div>
        </SectionColumns>

        {/* Référentiels & Conformité — HSE compliance per employee */}
        <FormSection title={t('tiers.ui.sections.compliance')} collapsible defaultExpanded={false} storageKey="contact-detail-conformite">
          <ReferentielManager ownerType="tier_contact" ownerId={contact.id} compact />
        </FormSection>

        {/* Full-width: Notes & Documents */}
        <FormSection title={t('tiers.ui.sections.notes_documents')} collapsible defaultExpanded={false} storageKey="contact-detail-sections">
          <DetailFieldGrid>
            <div>
              <SubSectionLabel icon={MessageSquare} label={t('common.notes')} count={contactNotes?.length ?? 0} />
              <NoteManager ownerType="tier_contact" ownerId={contact.id} compact />
            </div>
            <div>
              <SubSectionLabel icon={Paperclip} label={t('common.files')} count={contactAttachments?.length ?? 0} />
              <AttachmentManager ownerType="tier_contact" ownerId={contact.id} compact />
            </div>
          </DetailFieldGrid>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Main Page ----------------------------------------------------------------

type TiersTab = 'dashboard' | 'entreprises' | 'contacts'

const TABS: { id: TiersTab; label: string; icon: typeof Building2 }[] = [
  { id: 'dashboard', label: 'tiers.tab_dashboard', icon: LayoutDashboard },
  { id: 'entreprises', label: 'tiers.tab_companies', icon: Building2 },
  { id: 'contacts', label: 'tiers.tab_contacts', icon: Users },
]

// ── Contacts columns (for the global contacts DataTable) ──
function useContactColumns() {
  const { t } = useTranslation()
  const civilityLabels = useDictionaryLabels('civility')
  return useMemo<ColumnDef<TierContactWithTier, unknown>[]>(() => [
    {
      accessorKey: 'last_name',
      header: t('tiers.ui.last_name'),
      cell: ({ row }) => {
        const civ = row.original.civility
        const civLabel = civ ? (civilityLabels[civ] || civ) : ''
        const photo = row.original.photo_url
        return (
          <div className="flex items-center gap-2">
            {photo ? (
              <img
                src={photo}
                alt={`${row.original.first_name} ${row.original.last_name}`}
                className="w-7 h-7 rounded-full object-cover shrink-0"
                loading="lazy"
              />
            ) : (
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                row.original.is_primary ? 'bg-primary/15 text-primary' : 'bg-accent text-muted-foreground',
              )}>
                {row.original.first_name[0]}{row.original.last_name[0]}
              </div>
            )}
            <div className="min-w-0">
              <span className="text-foreground font-medium text-sm">
                {civLabel ? `${civLabel} ` : ''}{row.original.first_name} {row.original.last_name}
              </span>
              {row.original.is_primary && <Star size={9} className="inline ml-1 text-primary fill-primary" />}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'tier_name',
      header: t('tiers.tab_companies'),
      size: 160,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <CrossModuleLink module="tiers" id={row.original.tier_id} label={row.original.tier_name || row.original.tier_code} showIcon={false} className="text-xs" />
          <span className="text-[10px] text-muted-foreground">{row.original.tier_code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'position',
      header: t('tiers.ui.position'),
      size: 140,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.position || '--'}</span>,
    },
    {
      accessorKey: 'department',
      header: t('tiers.ui.department'),
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.department || '--'}</span>,
    },
    {
      accessorKey: 'is_primary',
      header: t('tiers.ui.primary_contact'),
      size: 80,
      cell: ({ row }) => row.original.is_primary
        ? <span className="gl-badge gl-badge-info">{t('common.yes')}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
    {
      accessorKey: 'created_at',
      header: t('common.created_at'),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {new Date(row.original.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ], [t, civilityLabels])
}

export function TiersPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TiersTab>('dashboard')
  const tierTypeOptions = useDictionaryOptions('tier_type')
  const tierTypeLabels = useDictionaryLabels('tier_type')
  const legalFormLabels = useDictionaryLabels('legal_form')

  // ── Shared state ──
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const { hasPermission } = usePermission()

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  // Reset page when tab/search/filters change
  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, activeTab])

  // Reset search/filters when switching tabs. When jumping to the
  // contacts tab while a tier detail panel is open, pre-apply the
  // tier_id filter so only that company's employees are listed.
  const handleTabChange = useCallback((tab: TiersTab) => {
    setActiveTab(tab)
    setSearch('')
    if (tab === 'contacts' && dynamicPanel?.module === 'tiers' && dynamicPanel.type === 'detail') {
      setActiveFilters({ tier_id: dynamicPanel.id })
    } else {
      setActiveFilters({})
    }
    setPage(1)
  }, [dynamicPanel])

  // ── Entreprises tab data ──
  const typeFilter = typeof activeFilters.type === 'string' ? activeFilters.type : undefined
  const { data: tiersData, isLoading: tiersLoading } = useTiers({
    page: activeTab === 'entreprises' ? page : 1,
    page_size: activeTab === 'entreprises' ? pageSize : 1,
    search: activeTab === 'entreprises' ? (debouncedSearch || undefined) : undefined,
    type: activeTab === 'entreprises' ? typeFilter : undefined,
  })

  // ── Contacts tab data ──
  const contactTierId = typeof activeFilters.tier_id === 'string' ? activeFilters.tier_id : undefined
  const contactDepartment = typeof activeFilters.department === 'string' ? activeFilters.department : undefined
  const contactIsPrimary = activeFilters.is_primary === 'true' ? true : activeFilters.is_primary === 'false' ? false : undefined
  const { data: contactsData, isLoading: contactsLoading } = useAllTierContacts({
    page: activeTab === 'contacts' ? page : 1,
    page_size: activeTab === 'contacts' ? pageSize : 1,
    search: activeTab === 'contacts' ? (debouncedSearch || undefined) : undefined,
    tier_id: contactTierId,
    department: contactDepartment,
    is_primary: contactIsPrimary,
  })

  // Nav items for dynamic panel
  useEffect(() => {
    if (activeTab === 'entreprises' && tiersData?.items) {
      setNavItems(tiersData.items.map((i) => i.id))
    } else if (activeTab === 'contacts' && contactsData?.items) {
      setNavItems(contactsData.items.map((i) => i.id))
    }
    return () => setNavItems([])
  }, [activeTab, tiersData?.items, contactsData?.items, setNavItems])

  // ── Entreprises filters ──
  const tierFilters = useMemo<DataTableFilterDef[]>(() => [
    {
      id: 'type',
      label: t('common.type'),
      type: 'multi-select',
      operators: ['is', 'is_not'],
      options: tierTypeOptions,
    },
    {
      id: 'status',
      label: t('common.status'),
      type: 'select',
      options: [
        { value: 'active', label: t('common.active') },
        { value: 'inactive', label: t('common.archived') },
      ],
    },
  ], [t, tierTypeOptions])

  // ── Contacts filters ──
  const contactFilters = useMemo<DataTableFilterDef[]>(() => [
    {
      id: 'is_primary',
      label: t('tiers.ui.primary_contact'),
      type: 'select',
      options: [
        { value: 'true', label: t('common.yes') },
        { value: 'false', label: t('common.no') },
      ],
    },
  ], [t])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  // ── Entreprises columns ──
  const tierColumns = useMemo<ColumnDef<Tier, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.code'),
      size: 100,
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-foreground font-medium">{row.original.name}</span>
          {row.original.alias && (
            <span className="text-[10px] text-muted-foreground italic">{row.original.alias}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('common.type'),
      size: 110,
      cell: ({ row }) => row.original.type ? (
        <span className="gl-badge gl-badge-neutral">
          {tierTypeLabels[row.original.type] ?? row.original.type}
        </span>
      ) : <span className="text-muted-foreground">--</span>,
    },
    {
      accessorKey: 'industry',
      header: t('tiers.ui.industry'),
      size: 120,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{row.original.industry || '--'}</span>
      ),
    },
    {
      accessorKey: 'contact_count',
      header: t('tiers.tab_contacts'),
      size: 80,
      cell: ({ row }) => {
        const count = row.original.contact_count
        return count > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setActiveTab('contacts')
              setActiveFilters({ tier_id: row.original.id })
              setSearch('')
              setPage(1)
            }}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 hover:underline"
            title={`Voir les employes de ${row.original.name}`}
          >
            <Users size={11} />
            {count}
          </button>
        ) : <span className="text-muted-foreground/40">0</span>
      },
    },
    {
      accessorKey: 'legal_form',
      header: t('tiers.ui.legal_form'),
      size: 110,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {row.original.legal_form ? legalFormLabels[row.original.legal_form] ?? row.original.legal_form : '--'}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: t('common.status'),
      size: 110,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className={cn('gl-badge', row.original.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
            {row.original.active ? t('common.active') : t('common.archived')}
          </span>
          {row.original.is_blocked && (
            <span className="gl-badge gl-badge-danger text-[9px]">
              <ShieldBan size={9} className="mr-0.5" />{t('tiers.ui.blocked')}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: t('common.created_at'),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ], [t, tierTypeLabels, legalFormLabels])

  const contactColumns = useContactColumns()

  const tiersPagination: DataTablePagination | undefined = tiersData ? {
    page: tiersData.page, pageSize, total: tiersData.total, pages: tiersData.pages,
  } : undefined

  const contactsPagination: DataTablePagination | undefined = contactsData ? {
    page: contactsData.page, pageSize, total: contactsData.total, pages: contactsData.pages,
  } : undefined

  // Import/Export config
  const canExport = hasPermission('tier.export') || hasPermission('tier.read')
  const canImport = hasPermission('tier.import') || hasPermission('tier.create')

  const importExportConfig = useMemo<ImportExportConfig | undefined>(() => {
    if (!canExport && !canImport) return undefined
    return {
      exportFormats: canExport ? ['csv', 'xlsx', 'pdf'] : undefined,
      advancedExport: true,
      importCsv: canImport,
      importWizardTarget: canImport ? (activeTab === 'contacts' ? 'contact' : 'tier') as import('@/types/api').ImportTargetObject : undefined,
      filenamePrefix: activeTab === 'contacts' ? 'contacts' : 'tiers',
      exportHeaders: (activeTab === 'contacts' ? {
        first_name: t('tiers.ui.first_name'), last_name: t('tiers.ui.last_name'), tier_name: t('tiers.tab_companies'),
        position: t('tiers.ui.position'), department: t('tiers.ui.department'), is_primary: t('tiers.ui.primary_contact'),
      } : {
        code: t('common.code'), name: t('common.name'), alias: t('tiers.ui.alias'), type: t('common.type'),
        website: t('tiers.ui.website'), industry: t('tiers.ui.industry'), legal_form: t('tiers.ui.legal_form'),
        currency: t('tiers.ui.currency'), active: t('common.active'), created_at: t('common.created_at'),
      }) as Record<string, string>,
    }
  }, [canExport, canImport, activeTab, t])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'tiers'

  return (
    <div className="flex h-full">
      {/* -- Static Panel (list) -- hidden when dynamic panel is in full mode -- */}
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={Building2} title={t('tiers.title')} subtitle={t('tiers.subtitle')}>
          {activeTab === 'entreprises' && (
            <ToolbarButton icon={Plus} label={t('tiers.create')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'tiers' })} />
          )}
        </PanelHeader>

        {/* Tab bar */}
        <TabBar
          items={TABS.map((tab) => ({
            ...tab,
            label: t(tab.label),
            badge: tab.id === 'contacts' ? contactsData?.total : undefined,
          }))}
          activeId={activeTab}
          onTabChange={handleTabChange}
        />

        <PanelContent>
          {activeTab === 'dashboard' ? (
            <div className="p-4"><ModuleDashboard module="tiers" /></div>
          ) : activeTab === 'entreprises' ? (
            <DataTable<Tier>
              columns={tierColumns}
              data={tiersData?.items ?? []}
              isLoading={tiersLoading}
              pagination={tiersPagination}
              onPaginationChange={(p, size) => {
                if (size !== pageSize) { setPageSize(size); setPage(1) }
                else setPage(p)
              }}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher par code ou nom..."
              filters={tierFilters}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'tiers', id: row.id })}
              emptyIcon={Building2}
              emptyTitle={t('common.no_results')}
              columnResizing
              columnPinning
              columnVisibility
              defaultPinnedColumns={{ left: ['code'] }}
              defaultHiddenColumns={['created_at', 'legal_form']}
              importExport={importExportConfig}
              storageKey="tiers"
            />
          ) : (
            <DataTable<TierContactWithTier>
              columns={contactColumns}
              data={contactsData?.items ?? []}
              isLoading={contactsLoading}
              pagination={contactsPagination}
              onPaginationChange={(p, size) => {
                if (size !== pageSize) { setPageSize(size); setPage(1) }
                else setPage(p)
              }}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('tiers.ui.search_contact')}
              filters={contactFilters}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              onRowClick={(row) => openDynamicPanel({
                type: 'detail',
                module: 'tiers',
                id: row.tier_id,
                meta: { contact_id: row.id },
              })}
              emptyIcon={Users}
              emptyTitle={t('tiers.ui.no_contacts')}
              columnResizing
              columnVisibility
              defaultHiddenColumns={['created_at']}
              importExport={importExportConfig}
              storageKey="tiers-contacts"
            />
          )}
        </PanelContent>
      </div>}

      {dynamicPanel?.module === 'tiers' && dynamicPanel.type === 'create' && <CreateTierPanel />}
      {dynamicPanel?.module === 'tiers' && dynamicPanel.type === 'detail' && (
        <TierDetailPanel id={dynamicPanel.id} initialContactId={dynamicPanel.meta?.contact_id} />
      )}
    </div>
  )
}

// -- Module-level renderer registration --
registerPanelRenderer('tiers', (view) => {
  if (view.type === 'create') return <CreateTierPanel />
  if (view.type === 'detail' && 'id' in view) {
    const initialContactId = 'meta' in view ? view.meta?.contact_id : undefined
    return <TierDetailPanel id={view.id} initialContactId={initialContactId} />
  }
  return null
})
