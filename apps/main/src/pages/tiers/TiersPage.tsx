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
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Building2, Plus, Loader2, Trash2, MapPin, Paperclip, MessageSquare,
  Phone, Mail, Users, Star, Globe, Clock,
  FileText, ShieldBan, ShieldCheck, Link2, X,
  LayoutDashboard, FolderKanban, Shield, User, Activity, CircleDollarSign, AlertTriangle,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef, ImportExportConfig, DataTableBatchAction } from '@/components/ui/DataTable/types'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { cn } from '@/lib/utils'
import { PageNavBar, TabBar } from '@/components/ui/Tabs'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { normalizeNames } from '@/lib/normalize'
import { validateTierForm, type FormErrors } from '@/lib/formValidation'
import { useDebounce } from '@/hooks/useDebounce'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
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
  TagSelector,
  panelInputClass,
  SectionColumns,
  DetailFieldGrid,
  PanelContentLayout,
  type ActionItem,
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
import { JobPositionPicker } from '@/components/shared/JobPositionPicker'
import { SocialNetworkManager } from '@/components/shared/SocialNetworkManager'
import { OpeningHoursManager } from '@/components/shared/OpeningHoursManager'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  useTiers, useCreateTier, useUpdateTier, useArchiveTier,
  useTier, useTierContacts, useAllTierContacts,
  useTierBlocks, useBlockTier, useUnblockTier,
  useTierExternalRefs, useCreateTierExternalRef, useDeleteTierExternalRef,
} from '@/hooks/useTiers'
import { useAddresses, useNotes, useAttachments, usePhones, useContactEmails, useSocialNetworks, useOpeningHours } from '@/hooks/useSettings'
import { useLegalIdentifiers } from '@/hooks/useUserSubModels'
import { useProjects } from '@/hooks/useProjets'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useStagingRef } from '@/hooks/useStagingRef'
import { RichTextField } from '@/components/shared/RichTextField'
import { ExternalRefManager } from '@/components/shared/ExternalRefManager'
import type { Tier, TierCreate, TierContact, TierContactCreate, TierContactWithTier } from '@/types/api'
import api from '@/lib/api'

import { useOpenDetailFromPath } from '@/hooks/useOpenDetailFromPath'
import { ContactListSection, ContactDetailPanel, useContactColumns } from './TierContacts'
// -- Constants ----------------------------------------------------------------

const EMPTY_CONTACT_FORM: TierContactCreate = {
  civility: null,
  first_name: '',
  last_name: '',
  position: null,
  department: null,
  job_position_id: null,
  is_primary: false,
}

function getTextFilterValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    const raw = (value as { value?: unknown }).value
    return typeof raw === 'string' ? raw.trim() || undefined : undefined
  }
  return undefined
}

function TierLogoMark({ tier }: { tier: Tier }) {
  const [logoUrlFailed, setLogoUrlFailed] = useState(false)
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  const [attachmentFailed, setAttachmentFailed] = useState(false)
  const shouldUseAttachment = !!tier.logo_attachment_id && (!tier.logo_url || logoUrlFailed)

  useEffect(() => {
    setLogoUrlFailed(false)
  }, [tier.logo_url])

  useEffect(() => {
    let revokeUrl: string | null = null
    let cancelled = false

    setAttachmentUrl(null)
    setAttachmentFailed(false)

    if (!shouldUseAttachment || !tier.logo_attachment_id) {
      return undefined
    }

    api.get(`/api/v1/attachments/${tier.logo_attachment_id}/download`, { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return
        const objectUrl = URL.createObjectURL(data)
        revokeUrl = objectUrl
        setAttachmentUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setAttachmentFailed(true)
      })

    return () => {
      cancelled = true
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
    }
  }, [shouldUseAttachment, tier.logo_attachment_id])

  const src = tier.logo_url && !logoUrlFailed ? tier.logo_url : attachmentUrl
  if (src && !attachmentFailed) {
    return (
      <span className="flex h-7 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm">
        <img
          src={src}
          alt=""
          className="max-h-6 max-w-full object-contain"
          loading="lazy"
          onError={() => {
            if (tier.logo_url && !logoUrlFailed) setLogoUrlFailed(true)
            else setAttachmentFailed(true)
          }}
        />
      </span>
    )
  }

  return (
    <div className={cn(
      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground',
      tier.active ? 'border-primary/15 bg-primary/5' : 'border-border/60 bg-muted/40',
    )}>
      <Building2 size={13} />
    </div>
  )
}

function TierCountryDisplay({ code, labels, withLabel = false }: { code: string | null | undefined; labels: Record<string, string>; withLabel?: boolean }) {
  if (!code) return <span className="text-muted-foreground/60">--</span>
  const label = labels[code] || code
  return (
    <CountryFlag
      code={code}
      label={withLabel ? label : undefined}
      size={withLabel ? 15 : 16}
      className={cn(
        withLabel ? 'text-sm text-foreground' : 'justify-center',
        !withLabel && 'min-w-5',
      )}
    />
  )
}

// -- Create Tier Panel --------------------------------------------------------

function CreateTierPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createTier = useCreateTier()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { stagingRef, stagingOwnerType } = useStagingRef('tier')
  const tierTypeOptions = useDictionaryOptions('tier_type')
  // Initial contacts staged in local state — sent as `contacts[]` in the
  // create payload. TierContact is FK-linked, so the backend creates
  // the rows in the same transaction. `is_primary` is enforced as
  // at-most-one server-side; we just surface a single toggle in UI.
  const [initialContacts, setInitialContacts] = useState<TierContactCreate[]>([])
  const [contactDraft, setContactDraft] = useState<TierContactCreate>({ ...EMPTY_CONTACT_FORM })
  const legalFormOptions = useDictionaryOptions('legal_form')
  const currencyOptions = useDictionaryOptions('currency')
  const languageOptions = useDictionaryOptions('language')
  const countryOptions = useDictionaryOptions('country')
  // formErrors is set on submit-failure for future field-level UI surfaces.
  // Currently only the first error is surfaced via the toast in handleSubmit.
  const [, setFormErrors] = useState<FormErrors>({})
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
    // Client-side validation gate — surface errors immediately so the
    // user doesn't wait for a server roundtrip to discover a typo.
    // The server still validates everything via Pydantic; this is
    // just for UX latency.
    const errors = validateTierForm(form)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      const firstError = Object.values(errors)[0]
      toast({
        title: 'Formulaire incomplet',
        description: firstError,
        variant: 'error',
      })
      return
    }
    setFormErrors({})
    await createTier.mutateAsync(
      normalizeNames({
        ...form,
        staging_ref: stagingRef,
        contacts: initialContacts,
      } as TierCreate & { staging_ref?: string; contacts?: TierContactCreate[] }),
    )
    closeDynamicPanel()
  }

  const addContactDraft = () => {
    const first = (contactDraft.first_name ?? '').trim()
    const last = (contactDraft.last_name ?? '').trim()
    if (!first || !last) {
      toast({ title: t('tiers.contact_form.errors.name_required') as string, variant: 'warning' })
      return
    }
    // Enforce at-most-one primary on the client so the UI reflects what
    // the backend will do anyway (first-one-wins).
    const next: TierContactCreate = { ...contactDraft, first_name: first, last_name: last }
    if (next.is_primary) {
      setInitialContacts((prev) => [
        ...prev.map((c) => ({ ...c, is_primary: false })),
        next,
      ])
    } else {
      setInitialContacts((prev) => [...prev, next])
    }
    setContactDraft({ ...EMPTY_CONTACT_FORM })
  }
  const removeContact = (idx: number) =>
    setInitialContacts((prev) => prev.filter((_, i) => i !== idx))

  const actionItems = useMemo<ActionItem[]>(() => [
    {
      id: 'cancel',
      label: t('common.cancel'),
      icon: X,
      priority: 40,
      onClick: closeDynamicPanel,
    },
    {
      id: 'create',
      label: t('common.create'),
      icon: Plus,
      variant: 'primary',
      priority: 100,
      loading: createTier.isPending,
      disabled: createTier.isPending,
      onClick: () => (document.getElementById('create-tier-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [t, closeDynamicPanel, createTier.isPending])

  return (
    <DynamicPanelShell
      title={t('tiers.create')}
      subtitle={t('tiers.title')}
      icon={<Building2 size={14} className="text-primary" />}
      actionItems={actionItems}
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

          {/* 2-column layout driven by the panel width, not the viewport. */}
          <div className="@container grid gap-4 @[920px]:grid-cols-2">
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
                <RichTextField
                  value={form.description ?? ''}
                  onChange={(html) => setForm({ ...form, description: html || null })}
                  rows={4}
                  placeholder={t('tiers.ui.placeholders.description') as string}
                  imageOwnerType={stagingOwnerType}
                  imageOwnerId={stagingRef}
                />
              </FormSection>
            </div>
          </div>

          {/* ── Contacts initiaux (FK-linked, non polymorphique) ── */}
          <FormSection
            title={`${t('tiers.tab_contacts', 'Contacts')} (${initialContacts.length})`}
            collapsible
            defaultExpanded={false}
          >
            {initialContacts.length > 0 && (
              <div className="space-y-1 mb-2">
                {initialContacts.map((c, idx) => (
                  <div
                    key={`${c.first_name}-${c.last_name}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <User size={12} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">
                          {c.civility ? `${c.civility} ` : ''}
                          {c.last_name} {c.first_name}
                          {c.is_primary && (
                            <Star size={10} className="inline ml-1 text-amber-500 fill-amber-500" />
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {[c.position, c.email, c.phone].filter(Boolean).join(' • ') || '—'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeContact(idx)}
                      className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                      title={t('common.delete') as string}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 rounded-md border border-border bg-card p-2">
              <FormGrid>
                <DynamicPanelField label={t('common.first_name', 'Prénom')} required>
                  <input
                    type="text"
                    value={contactDraft.first_name}
                    onChange={(e) => setContactDraft({ ...contactDraft, first_name: e.target.value })}
                    className={panelInputClass}
                    placeholder={t('tiers.contact_form.placeholders.first_name', 'Prénom') as string}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.last_name', 'Nom')} required>
                  <input
                    type="text"
                    value={contactDraft.last_name}
                    onChange={(e) => setContactDraft({ ...contactDraft, last_name: e.target.value })}
                    className={panelInputClass}
                    placeholder={t('tiers.contact_form.placeholders.last_name', 'Nom') as string}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.email')}>
                  <input
                    type="email"
                    value={contactDraft.email ?? ''}
                    onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="email@..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.phone')}>
                  <input
                    type="text"
                    value={contactDraft.phone ?? ''}
                    onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="+..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('tiers.ui.contact_position', 'Fonction')}>
                  <input
                    type="text"
                    value={contactDraft.position ?? ''}
                    onChange={(e) => setContactDraft({ ...contactDraft, position: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('tiers.ui.contact_department', 'Département')}>
                  <input
                    type="text"
                    value={contactDraft.department ?? ''}
                    onChange={(e) => setContactDraft({ ...contactDraft, department: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('tiers.ui.job_position_profile', 'Profil du poste')}>
                  <JobPositionPicker
                    value={contactDraft.job_position_id ?? null}
                    onChange={(id) => setContactDraft({ ...contactDraft, job_position_id: id })}
                    placeholder={t('tiers.ui.job_position_profile_placeholder', 'Lier une fiche de poste conformité...') as string}
                  />
                </DynamicPanelField>
              </FormGrid>
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={!!contactDraft.is_primary}
                    onChange={(e) => setContactDraft({ ...contactDraft, is_primary: e.target.checked })}
                  />
                  {t('tiers.contact_form.is_primary', 'Contact principal')}
                </label>
                <button
                  type="button"
                  onClick={addContactDraft}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1"
                >
                  <Plus size={12} /> {t('common.add', 'Ajouter')}
                </button>
              </div>
            </div>
          </FormSection>

          {/* ── Secondary polymorphic data (all staged) ── */}
          {/* Multi-entries for phones / emails / addresses / legal IDs that go
              beyond the single primary captured inline above. Committed to
              the new Tier on submit via commit_staging_children. */}
          <FormSection title={t('tiers.ui.sections.phones', 'Téléphones (additionnels)')} collapsible defaultExpanded={false}>
            <PhoneManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('tiers.ui.sections.emails', 'Emails (additionnels)')} collapsible defaultExpanded={false}>
            <ContactEmailManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('tiers.ui.sections.addresses', 'Adresses (additionnelles)')} collapsible defaultExpanded={false}>
            <AddressManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('tiers.ui.sections.legal_ids', 'Identifiants légaux')} collapsible defaultExpanded={false}>
            <LegalIdentifierManager ownerType={stagingOwnerType} ownerId={stagingRef} country={form.country ?? undefined} compact />
          </FormSection>

          <FormSection title={t('tiers.ui.sections.socials', 'Réseaux sociaux')} collapsible defaultExpanded={false}>
            <SocialNetworkManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('tiers.ui.sections.opening_hours', 'Horaires d\u2019ouverture')} collapsible defaultExpanded={false}>
            <OpeningHoursManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('common.attachments')} collapsible defaultExpanded={false}>
            <AttachmentManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('common.notes')} collapsible defaultExpanded={false}>
            <NoteManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('common.tags')} collapsible defaultExpanded={false}>
            <TagManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('tiers.ui.external_refs', 'Références externes')} collapsible defaultExpanded={false}>
            <ExternalRefManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>
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

const PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  planned: 'Planifié',
  active: 'Actif',
  in_progress: 'En cours',
  on_hold: 'Suspendu',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

const PROJECT_PRIORITY_LABELS: Record<string, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
}

const PROJECT_STATUS_CLASS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border/60',
  planned: 'bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20',
  in_progress: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20',
  on_hold: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20',
  completed: 'bg-primary/10 text-primary border-primary/20',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
}

const PROJECT_PRIORITY_BADGE_CLASS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground border-border/60',
  medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20',
  high: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20',
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatMoney(amount: number | null | undefined, currency = 'XAF'): string {
  if (amount == null) return '—'
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} ${currency}`
  }
}

function TierDetailPanel({ id, initialContactId }: { id: string; initialContactId?: string }) {
  const { t, i18n } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const archiveTier = useArchiveTier()
  const { data: tier } = useTier(id)
  const updateTier = useUpdateTier()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('tier.tier.update')
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

  // Tab navigation for TierDetailPanel — MUST be before early returns
  const [detailTab, setDetailTab] = useState<'fiche' | 'contacts' | 'conformite' | 'projets' | 'documents'>('fiche')

  const handleInlineSave = useCallback((field: keyof TierCreate, value: string | number | boolean | null) => {
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
  const projectList = useMemo(() => relatedProjects?.items ?? [], [relatedProjects?.items])
  const projectSummary = useMemo(() => {
    let budget = 0
    let progressTotal = 0
    let active = 0
    let completed = 0
    let sensitive = 0

    for (const project of projectList) {
      budget += project.budget ?? 0
      progressTotal += project.progress ?? 0
      if (['active', 'in_progress'].includes(project.status)) active += 1
      if (project.status === 'completed') completed += 1
      if (['high', 'critical'].includes(project.priority)) sensitive += 1
    }

    return {
      active,
      completed,
      sensitive,
      budget,
      averageProgress: projectList.length ? Math.round(progressTotal / projectList.length) : 0,
      currency: projectList.find((project) => project.currency)?.currency ?? tier?.currency ?? 'XAF',
    }
  }, [projectList, tier?.currency])

  const confirm = useConfirm()

  const tierActionItems = useMemo<ActionItem[]>(() => [
    {
      id: 'delete',
      label: t('common.delete'),
      icon: Trash2,
      variant: 'danger',
      priority: 70,
      confirm: {
        title: t('common.confirm_delete'),
        message: '',
        confirmLabel: t('common.confirm_delete'),
        variant: 'danger',
      },
      onClick: () => { archiveTier.mutate(id); closeDynamicPanel() },
    },
  ], [t, archiveTier, id, closeDynamicPanel])

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
  // Title swap (Pajamas++ design pattern): name as primary title,
  // code+type+country as subtitle metadata. Matches the design canvas
  // where 'Perenco S.A.' is the large title and 'PRC-001 · Affréteur ·
  // Gabon' is the subline.
  const tierSubtitle = [
    tier.code,
    tier.type ? (tierTypeOptions.find(o => o.value === tier.type)?.label || tier.type) : null,
    tier.country ? (countryLabels[tier.country] || tier.country) : null,
  ].filter(Boolean).join(' · ')

  return (
    <DynamicPanelShell
      title={tier.name}
      subtitle={tierSubtitle}
      icon={<Building2 size={14} className="text-primary" />}
      actionItems={tierActionItems}
      onActionConfirm={confirm}
    >
      <TabBar
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as typeof detailTab)}
        items={[
          { id: 'fiche', label: t('tiers.ui.tab_fiche'), icon: Building2 },
          { id: 'contacts', label: t('tiers.contacts'), icon: Users, badge: contactList.length || undefined },
          { id: 'conformite', label: t('nav.conformite'), icon: Shield },
          { id: 'projets', label: t('nav.projets'), icon: FolderKanban, badge: relatedProjects?.items?.length || undefined },
          { id: 'documents', label: t('common.documents'), icon: Paperclip, badge: attachments?.length || undefined },
        ]}
      />

      {detailTab === 'fiche' && (
      <PanelContentLayout>
        {/* KPI strip — Pajamas++ design pattern (top-of-detail metrics).
            Sources counts from already-fetched queries; hooks into the
            .kpi-pp class loaded by Phase 2C (cards-pp.css). */}
        <div className="@container grid grid-cols-2 gap-2 mb-3 @[560px]:grid-cols-4">
          <div className="kpi-pp">
            <span className="kpi-pp__label">{t('tiers.ui.active_projects')}</span>
            <span className="kpi-pp__value">{projectSummary.active}</span>
            <span className="kpi-pp__caption">{t('tiers.ui.with_this_tier')}</span>
          </div>
          <div className="kpi-pp">
            <span className="kpi-pp__label">{t('tiers.contacts')}</span>
            <span className="kpi-pp__value">{contactList.length}</span>
            <span className="kpi-pp__caption">{t('tiers.ui.active_employees')}</span>
          </div>
          <div className="kpi-pp">
            <span className="kpi-pp__label">{t('tiers.ui.identifiers')}</span>
            <span className="kpi-pp__value">{identifiers?.length ?? 0}</span>
            <span className="kpi-pp__caption">{t('tiers.ui.legal_id_examples')}</span>
          </div>
          <div className="kpi-pp">
            <span className="kpi-pp__label">{t('common.documents')}</span>
            <span className="kpi-pp__value">{attachments?.length ?? 0}</span>
            <span className="kpi-pp__caption">{t('tiers.ui.attached_files')}</span>
          </div>
        </div>

        {/* 2-col layout (Pajamas++ design pattern):
            - Main wide column (1fr) → Identité + Coordonnées (heavy content)
            - Sidebar 320px → Infos légales + Tags (compact reference data)
            Stacks vertically on < lg. */}
        <SectionColumns sidebar="right-320">
          {/* ── Main column: Fiche entreprise + Coordonnees ── */}
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
                <InlineEditableSelect
                  label={t('tiers.ui.country')}
                  value={tier.country || ''}
                  displayValue={tier.country ? <TierCountryDisplay code={tier.country} labels={countryLabels} withLabel /> : ''}
                  options={countryOptions}
                  onSave={(v) => handleInlineSave('country', v)}
                />
                <ReadOnlyRow
                  label={t('common.status')}
                  value={
                    <span className={cn('chip', tier.active && 'chip-success')}>
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

            <FormSection title={t('common.description')} collapsible defaultExpanded={false} storageKey="tier-detail-sections">
              <InlineEditableRow
                label={t('common.description')}
                value={tier.description || ''}
                onSave={(v) => handleInlineSave('description', v)}
              />
            </FormSection>

            <FormSection title={t('tiers.ui.sections.contact')} collapsible defaultExpanded storageKey="tier-detail-sections">
              {tier.website && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Globe size={11} className="shrink-0" />
                  <a href={tier.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary truncate">{tier.website}</a>
                </div>
              )}
              {/* Website is kept as a direct field because it's a single
                  value with no polymorphic equivalent. Phone / email / fax
                  are managed exclusively by PhoneManager / ContactEmailManager
                  below — the old direct fields were causing duplication. */}
              <DetailFieldGrid>
                <InlineEditableRow label={t('tiers.ui.website')} value={tier.website || ''} onSave={(v) => handleInlineSave('website', v)} />
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

          {/* ── Sidebar 320px: Infos légales + Tags ──
              Pajamas++ design pattern: narrow right rail with reference
              data (legal IDs, tags) that stays visible while the user
              scrolls through the heavier main content. */}
          <div className="@container space-y-5">
            <FormSection title={t('tiers.ui.sections.tags', 'Tags')} collapsible defaultExpanded storageKey="tier-detail-sections">
              <TagManager ownerType="tier" ownerId={tier.id} compact />
            </FormSection>

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

            <FormSection title="Centre d'habilitation" collapsible defaultExpanded={tier.is_authorization_center} storageKey="tier-detail-sections">
              <DetailFieldGrid>
                <InlineEditableSelect
                  label="Centre habilité"
                  value={tier.is_authorization_center ? 'true' : 'false'}
                  displayValue={tier.is_authorization_center ? 'Oui' : 'Non'}
                  options={[
                    { value: 'true', label: 'Oui' },
                    { value: 'false', label: 'Non' },
                  ]}
                  onSave={(v) => handleInlineSave('is_authorization_center', v === 'true')}
                />
                <InlineEditableRow
                  label="Code centre"
                  value={tier.authorization_center_code || ''}
                  onSave={(v) => handleInlineSave('authorization_center_code', v)}
                />
                <InlineEditableRow
                  label="URL de vérification certificat"
                  value={tier.certificate_verification_url || ''}
                  onSave={(v) => handleInlineSave('certificate_verification_url', v)}
                />
              </DetailFieldGrid>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Ces tiers peuvent ensuite être sélectionnés comme émetteurs autorisés dans les référentiels conformité.
              </p>
            </FormSection>
          </div>
        </SectionColumns>
      </PanelContentLayout>
      )}

      {detailTab === 'contacts' && (
      <PanelContentLayout>
        <FormSection title={`${t('tiers.tab_contacts')} (${contactList.length})`} collapsible defaultExpanded storageKey="tier-detail-sections">
          <ContactListSection
            tierId={tier.id}
            contacts={contactList}
            isLoading={contactsLoading}
            onSelectContact={setSelectedContactId}
            canEdit={canEdit}
          />
        </FormSection>

        {/* Blocage */}
        <FormSection
          title={
            <span className="flex items-center gap-2">
              {t('tiers.ui.blocking_section')}
              {tier.is_blocked && (
                <span className="chip chip-danger text-[10px]">
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
                  className="btn btn-secondary btn-sm"
                >
                  <ShieldCheck size={12} />{t('tiers.ui.unblock')}
                </button>
              ) : (
                <button
                  onClick={() => setShowBlockForm(!showBlockForm)}
                  className="btn btn-danger btn-sm"
                >
                  <ShieldBan size={12} />{t('tiers.ui.block')}
                </button>
              )}
            </div>
          )}

          {showBlockForm && (
            <div className="@container border border-border rounded-md p-3 mb-3 space-y-2 bg-muted/30">
              <div className="grid grid-cols-1 gap-2 @[520px]:grid-cols-2">
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
                  className="btn btn-primary btn-sm"
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
                      <span className="chip text-[9px]">{b.block_type}</span>
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
                <div className="@container border border-border rounded-md p-3 space-y-2 bg-muted/30">
                  <div className="grid grid-cols-1 gap-2 @[520px]:grid-cols-2">
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
                      className="btn btn-primary btn-sm"
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
                    <span className="chip text-[10px] shrink-0">{ref.system}</span>
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
      </PanelContentLayout>
      )}

      {detailTab === 'conformite' && (
      <PanelContentLayout>
        <FormSection title={t('nav.conformite')} collapsible defaultExpanded storageKey="tier-detail-conformite">
          <ReferentielManager ownerType="tier" ownerId={tier.id} compact />
        </FormSection>
      </PanelContentLayout>
      )}

      {detailTab === 'projets' && (
      <PanelContentLayout>
        <FormSection title={`${t('tiers.ui.related_projects')} (${relatedProjects?.total ?? 0})`} collapsible defaultExpanded storageKey="tier-detail-projets">
          {projectList.length > 0 ? (
            <div className="@container space-y-2">
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground @[520px]:grid-cols-3 @[760px]:grid-cols-5">
                {[
                  { label: t('tiers.ui.projects'), value: relatedProjects?.total ?? projectList.length, icon: FolderKanban },
                  { label: t('tiers.ui.active'), value: projectSummary.active, icon: Activity },
                  { label: t('tiers.ui.completed'), value: projectSummary.completed, icon: ShieldCheck },
                  { label: t('tiers.ui.sensitive'), value: projectSummary.sensitive, icon: AlertTriangle },
                  { label: t('tiers.ui.budget'), value: formatMoney(projectSummary.budget, projectSummary.currency), icon: CircleDollarSign },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex h-7 min-w-0 items-center gap-1.5 rounded border border-border/60 bg-background px-1.5">
                    <Icon size={10} className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate uppercase">{label}</span>
                    <span className="shrink-0 truncate font-semibold tabular-nums text-foreground">{value}</span>
                  </div>
                ))}
              </div>
              <div className="@container min-w-0 overflow-hidden rounded-md border border-border/60 bg-background">
                <div className="hidden grid-cols-[minmax(0,1.3fr)_130px_150px_110px] gap-3 border-b border-border/50 bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground @[720px]:grid">
                  <div>{t('tiers.ui.project')}</div>
                  <div>{t('tiers.ui.planning')}</div>
                  <div>{t('tiers.ui.budget_team')}</div>
                  <div className="text-right">{t('common.progress')}</div>
                </div>
                <div className="divide-y divide-border/50">
                  {projectList.map((project) => (
                    <div
                      key={project.id}
                      className="grid gap-3 px-3 py-3 transition-colors hover:bg-accent/30 @[720px]:grid-cols-[minmax(0,1.3fr)_130px_150px_110px] @[720px]:items-center"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <CrossModuleLink
                            module="projets"
                            id={project.id}
                            label={`${project.code} - ${project.name}`}
                            mode="navigate"
                            className="min-w-0 text-xs font-medium"
                          />
                          <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', PROJECT_STATUS_CLASS[project.status] ?? PROJECT_STATUS_CLASS.draft)}>
                            {t(`projets.status.${project.status}`, PROJECT_STATUS_LABELS[project.status] ?? project.status)}
                          </span>
                          <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', PROJECT_PRIORITY_BADGE_CLASS[project.priority] ?? PROJECT_PRIORITY_BADGE_CLASS.low)}>
                            {t('common.priority')} {t(`projets.priority.${project.priority}`, PROJECT_PRIORITY_LABELS[project.priority] ?? project.priority)}
                          </span>
                        </div>
                        {project.description && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {project.project_type && <span>{t('common.type')}: {project.project_type}</span>}
                          {project.manager_name && <span>{t('tiers.ui.manager')}: {project.manager_name}</span>}
                          {project.parent_name && <span>{t('tiers.ui.parent')}: {project.parent_name}</span>}
                          {project.asset_name && <span>{t('tiers.ui.asset')}: {project.asset_name}</span>}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} />
                          <span className="tabular-nums">{formatShortDate(project.start_date)}</span>
                        </div>
                        <div className="pl-[18px] text-[11px] tabular-nums">{formatShortDate(project.end_date)}</div>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <CircleDollarSign size={12} />
                          <span className="truncate font-medium text-foreground">{formatMoney(project.budget, project.currency)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users size={12} />
                          <span>{t('tiers.ui.project_people_tasks', { members: project.member_count ?? 0, tasks: project.task_count ?? 0 })}</span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="@[720px]:hidden">{t('common.progress')}</span>
                          <span className="font-semibold tabular-nums text-foreground">{project.progress ?? 0}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(0, Math.min(100, project.progress ?? 0))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {(relatedProjects?.total ?? 0) > projectList.length && (
                <p className="text-xs text-muted-foreground">
                  {t('tiers.ui.related_projects_more', { shown: projectList.length, total: relatedProjects?.total })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">{t('tiers.ui.no_related_projects')}</p>
          )}
        </FormSection>
      </PanelContentLayout>
      )}

      {detailTab === 'documents' && (
      <PanelContentLayout>
        <FormSection title={t('tiers.ui.sections.notes_documents')} collapsible defaultExpanded storageKey="tier-detail-sections">
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
      </PanelContentLayout>
      )}
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


// -- Main Page ----------------------------------------------------------------

type TiersTab = 'dashboard' | 'entreprises' | 'contacts'

const TABS: { id: TiersTab; label: string; icon: typeof Building2 }[] = [
  { id: 'dashboard', label: 'common.tab_dashboard', icon: LayoutDashboard },
  { id: 'entreprises', label: 'tiers.tab_companies', icon: Building2 },
  { id: 'contacts', label: 'tiers.tab_contacts', icon: Users },
]

// ── Contacts columns (for the global contacts DataTable) ──

const VALID_TIERS_TABS = new Set<TiersTab>(['dashboard', 'entreprises', 'contacts'])

export function TiersPage() {
  useOpenDetailFromPath({ matchers: [{ prefix: '/tiers/', module: 'tiers' }] })
  const { t } = useTranslation()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as TiersTab | null
  // Bug #144 (QA round 38 UI tests) : default tab change de 'dashboard'
  // a 'entreprises' pour exposer immediatement la liste + bouton create.
  // Avant fix : utilisateur arrive sur /tiers et voit uniquement les KPI
  // du dashboard, sans aucun moyen visible de creer un nouveau tier.
  const [activeTab, setActiveTabRaw] = useState<TiersTab>(
    tabFromUrl && VALID_TIERS_TABS.has(tabFromUrl) ? tabFromUrl : 'entreprises',
  )
  const setActiveTab = useCallback((tab: TiersTab) => {
    setActiveTabRaw(tab)
    setSearchParams(tab === 'dashboard' ? {} : { tab }, { replace: true })
  }, [setSearchParams])
  const tierTypeOptions = useDictionaryOptions('tier_type')
  const tierTypeLabels = useDictionaryLabels('tier_type')
  const countryOptions = useDictionaryOptions('country')
  const countryLabels = useDictionaryLabels('country')
  const legalFormOptions = useDictionaryOptions('legal_form')
  const legalFormLabels = useDictionaryLabels('legal_form')

  // ── Shared state ──
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useFilterPersistence<Record<string, unknown>>('tiers.filters', {})
  const { hasPermission } = usePermission()

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  const confirm = useConfirm()
  const archiveSelectedTier = useArchiveTier()
  // Reset page when tab/search/filters change
  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, activeTab])

  useEffect(() => {
    setActiveFilters((prev) => {
      if (typeof prev.status !== 'string') return prev
      const { status, ...rest } = prev
      if (prev.active !== undefined) return rest
      return {
        ...rest,
        active: status === 'active' ? 'true' : status === 'inactive' ? 'false' : status,
      }
    })
  }, [setActiveFilters])

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
  const activeFilterValue = typeof activeFilters.active === 'string'
    ? activeFilters.active
    : typeof activeFilters.status === 'string'
      ? activeFilters.status
      : undefined
  const activeFilter = activeFilterValue === 'true' || activeFilterValue === 'active'
    ? true
    : activeFilterValue === 'false' || activeFilterValue === 'inactive'
      ? false
      : undefined
  const countryFilter = typeof activeFilters.country === 'string' ? activeFilters.country : undefined
  const legalFormFilter = typeof activeFilters.legal_form === 'string' ? activeFilters.legal_form : undefined
  const industryFilter = getTextFilterValue(activeFilters.industry)
  const registrationNumberFilter = getTextFilterValue(activeFilters.registration_number)
  const cityFilter = getTextFilterValue(activeFilters.city)
  const blockedFilter = activeFilters.is_blocked === 'true' ? true : activeFilters.is_blocked === 'false' ? false : undefined
  const { data: tiersData, isLoading: tiersLoading } = useTiers({
    page: activeTab === 'entreprises' ? page : 1,
    page_size: activeTab === 'entreprises' ? pageSize : 1,
    search: activeTab === 'entreprises' ? (debouncedSearch || undefined) : undefined,
    type: activeTab === 'entreprises' ? typeFilter : undefined,
    active: activeTab === 'entreprises' ? activeFilter : undefined,
    country: activeTab === 'entreprises' ? countryFilter : undefined,
    legal_form: activeTab === 'entreprises' ? legalFormFilter : undefined,
    industry: activeTab === 'entreprises' ? industryFilter : undefined,
    registration_number: activeTab === 'entreprises' ? registrationNumberFilter : undefined,
    city: activeTab === 'entreprises' ? cityFilter : undefined,
    is_blocked: activeTab === 'entreprises' ? blockedFilter : undefined,
  })

  // ── Contacts tab data ──
  const contactTierId = typeof activeFilters.tier_id === 'string' ? activeFilters.tier_id : undefined
  const contactTier = getTextFilterValue(activeFilters.tier)
  const contactDepartment = getTextFilterValue(activeFilters.department)
  const contactPosition = getTextFilterValue(activeFilters.position)
  const contactJobPosition = getTextFilterValue(activeFilters.job_position)
  const contactEmail = getTextFilterValue(activeFilters.email)
  const contactPhone = getTextFilterValue(activeFilters.phone)
  const contactIsPrimary = activeFilters.is_primary === 'true' ? true : activeFilters.is_primary === 'false' ? false : undefined
  const contactLinkedUser = activeFilters.linked_user === 'true' ? true : activeFilters.linked_user === 'false' ? false : undefined
  const { data: contactsData, isLoading: contactsLoading } = useAllTierContacts({
    page: activeTab === 'contacts' ? page : 1,
    page_size: activeTab === 'contacts' ? pageSize : 1,
    search: activeTab === 'contacts' ? (debouncedSearch || undefined) : undefined,
    tier_id: activeTab === 'contacts' ? contactTierId : undefined,
    tier: activeTab === 'contacts' ? contactTier : undefined,
    department: activeTab === 'contacts' ? contactDepartment : undefined,
    position: activeTab === 'contacts' ? contactPosition : undefined,
    job_position: activeTab === 'contacts' ? contactJobPosition : undefined,
    email: activeTab === 'contacts' ? contactEmail : undefined,
    phone: activeTab === 'contacts' ? contactPhone : undefined,
    is_primary: activeTab === 'contacts' ? contactIsPrimary : undefined,
    linked_user: activeTab === 'contacts' ? contactLinkedUser : undefined,
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
      type: 'select',
      operators: ['is'],
      options: tierTypeOptions,
    },
    {
      id: 'active',
      label: t('common.status'),
      type: 'select',
      operators: ['is'],
      options: [
        { value: 'true', label: t('common.active') },
        { value: 'false', label: t('common.archived') },
      ],
    },
    {
      id: 'country',
      label: t('common.country', 'Pays'),
      type: 'select',
      operators: ['is'],
      options: countryOptions,
    },
    {
      id: 'legal_form',
      label: t('tiers.ui.legal_form'),
      type: 'select',
      operators: ['is'],
      options: legalFormOptions,
    },
    {
      id: 'industry',
      label: t('tiers.ui.industry'),
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'registration_number',
      label: 'SIRET',
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'city',
      label: t('common.city', 'Ville'),
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'is_blocked',
      label: t('tiers.ui.blocked'),
      type: 'select',
      operators: ['is'],
      options: [
        { value: 'true', label: t('common.yes') },
        { value: 'false', label: t('common.no') },
      ],
    },
  ], [t, tierTypeOptions, countryOptions, legalFormOptions])

  // ── Contacts filters ──
  const contactFilters = useMemo<DataTableFilterDef[]>(() => [
    {
      id: 'tier',
      label: t('tiers.tab_companies'),
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'department',
      label: t('tiers.ui.department'),
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'position',
      label: t('tiers.ui.function_free_text'),
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'job_position',
      label: t('tiers.ui.job_position_profile'),
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'email',
      label: t('common.email'),
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'phone',
      label: t('common.phone'),
      type: 'text',
      operators: ['contains'],
    },
    {
      id: 'is_primary',
      label: t('tiers.ui.primary_contact'),
      type: 'select',
      operators: ['is'],
      options: [
        { value: 'true', label: t('common.yes') },
        { value: 'false', label: t('common.no') },
      ],
    },
    {
      id: 'linked_user',
      label: t('tiers.ui.linked_user'),
      type: 'select',
      operators: ['is'],
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
  // Order matches the Pajamas++ design canvas:
  //   CODE · NOM · TYPE · PAYS · SIRET · INDUSTRIE · STATUT · CRÉÉ LE
  // (TAGS would sit between SIRET and STATUT but requires a polymorphic
  // bulk fetch — added in a follow-up commit.)
  const tierColumns = useMemo<ColumnDef<Tier, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.code'),
      size: 110,
      cell: ({ row }) => (
        <span className="inline-flex h-5 items-center rounded border border-border/60 bg-muted/40 px-1.5 font-mono text-[10px] font-medium text-foreground">
          {row.original.code}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <TierLogoMark tier={row.original} />
          <div className="min-w-0">
            <span className="block truncate text-xs font-semibold text-foreground">{row.original.name}</span>
            {(row.original.alias || row.original.trade_name) && (
              <span className="block truncate text-[10px] text-muted-foreground">
                {row.original.alias || row.original.trade_name}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('common.type'),
      size: 110,
      cell: ({ row }) => row.original.type ? (
        <span className="inline-flex h-5 items-center rounded border border-border/60 bg-muted/40 px-1.5 text-[10px] font-medium text-muted-foreground">
          {tierTypeLabels[row.original.type] ?? row.original.type}
        </span>
      ) : <span className="text-muted-foreground">--</span>,
    },
    {
      accessorKey: 'country',
      header: t('common.country', 'Pays'),
      size: 70,
      cell: ({ row }) => row.original.country ? (
        <span
          className="inline-flex h-5 min-w-6 items-center justify-center"
          title={countryLabels[row.original.country] || row.original.country}
        >
          <TierCountryDisplay code={row.original.country} labels={countryLabels} />
        </span>
      ) : <span className="text-muted-foreground">--</span>,
    },
    {
      accessorKey: 'registration_number',
      header: 'SIRET',
      size: 130,
      cell: ({ row }) => row.original.registration_number ? (
        <span className="font-mono text-[10px] text-muted-foreground">{row.original.registration_number}</span>
      ) : <span className="text-muted-foreground">--</span>,
    },
    {
      accessorKey: 'industry',
      header: t('tiers.ui.industry'),
      size: 120,
      cell: ({ row }) => (
        <span className="block truncate text-xs text-muted-foreground">{row.original.industry || '--'}</span>
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
            className="inline-flex h-5 items-center gap-1 rounded border border-primary/20 bg-primary/5 px-1.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
            title={t('tiers.ui.view_company_employees', { name: row.original.name })}
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
        <span className="block truncate text-xs text-muted-foreground">
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
          <span className={cn('chip', row.original.active && 'chip-success')}>
            {row.original.active ? t('common.active') : t('common.archived')}
          </span>
          {row.original.is_blocked && (
            <span className="chip chip-danger text-[9px]">
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
  ], [t, tierTypeLabels, countryLabels, legalFormLabels])

  const contactColumns = useContactColumns()

  const tiersPagination: DataTablePagination | undefined = tiersData ? {
    page: tiersData.page, pageSize, total: tiersData.total, pages: tiersData.pages,
  } : undefined

  const contactsPagination: DataTablePagination | undefined = contactsData ? {
    page: contactsData.page, pageSize, total: contactsData.total, pages: contactsData.pages,
  } : undefined

  // Import/Export config
  const canExport = hasPermission('tier.export') || hasPermission('tier.tier.read')
  const canImport = hasPermission('tier.import') || hasPermission('tier.tier.create')

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

  const tierBatchActions = useMemo<DataTableBatchAction<Tier>[]>(() => {
    if (!hasPermission('tier.tier.delete')) return []
    return [
      {
        id: 'archive',
        label: t('tiers.ui.archive_selected'),
        icon: Trash2,
        variant: 'danger',
        confirm: false,
        onAction: async (rows) => {
          const ok = await confirm({
            title: t('tiers.ui.archive_selected_confirm_title'),
            message: t('tiers.ui.archive_selected_confirm_message', { count: rows.length }),
            confirmLabel: t('common.archive'),
            variant: 'danger',
          })
          if (!ok) return
          try {
            await Promise.all(rows.map((row) => archiveSelectedTier.mutateAsync(row.id)))
            toast({
              title: t('tiers.ui.archive_selected_success_title'),
              description: t('tiers.ui.archive_selected_success_description', { count: rows.length }),
              variant: 'success',
            })
          } catch (err) {
            toast({
              title: t('common.error'),
              description: err instanceof Error ? err.message : String(err),
              variant: 'error',
            })
          }
        },
      },
    ]
  }, [archiveSelectedTier, confirm, hasPermission, t, toast])

  const getTierRowTooltip = useCallback((tier: Tier): string => {
    const parts = [
      `${tier.name} (${tier.code})`,
      `${t('common.type')}: ${tier.type ? tierTypeLabels[tier.type] ?? tier.type : '--'}`,
      `${t('common.country')}: ${tier.country ? countryLabels[tier.country] ?? tier.country : '--'}`,
      `${t('common.city')}: ${tier.city || '--'}`,
      `${t('tiers.ui.industry')}: ${tier.industry || '--'}`,
      `SIRET: ${tier.registration_number || '--'}`,
      `${t('tiers.tab_contacts')}: ${tier.contact_count ?? 0}`,
      `${t('common.status')}: ${tier.active ? t('common.active') : t('common.archived')}${tier.is_blocked ? ` - ${t('tiers.ui.blocked')}` : ''}`,
    ]
    return parts.join('\n')
  }, [t, tierTypeLabels, countryLabels])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'tiers'

  return (
    <div className="tiers-pp flex h-full">
      {/* -- Static Panel (list) -- hidden when dynamic panel is in full mode -- */}
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader
          icon={Building2}
          title={t('tiers.title')}
          titleSuffix={
            activeTab === 'entreprises' ? tiersData?.total ?? null
            : activeTab === 'contacts' ? contactsData?.total ?? null
            : null
          }
          subtitle={t('tiers.subtitle')}
        >
          {/* Bug #144 : afficher le bouton create sur tous les tabs sauf
              dashboard (qui a son propre toolbar). L'utilisateur peut creer
              un tier depuis 'Entreprises' OU 'Contacts' (l'API choisit le
              bon type en fonction du tab actif via openDynamicPanel). */}
          {activeTab !== 'dashboard' && (
            <ToolbarButton icon={Plus} label={t('tiers.create')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'tiers' })} />
          )}
        </PanelHeader>

        {/* Tab bar — rightSlot hosts the dashboard "Modifier" button via portal */}
        <PageNavBar
          items={TABS.map((tab) => ({
            ...tab,
            label: t(tab.label),
            badge: tab.id === 'contacts' ? contactsData?.total : undefined,
          }))}
          activeId={activeTab}
          onTabChange={handleTabChange}
          rightSlot={activeTab === 'dashboard' ? <div id="dash-toolbar-tiers" /> : null}
        />

        <PanelContent scroll={activeTab === 'dashboard'}>
          {activeTab === 'dashboard' ? (
            <div className="p-4"><ModuleDashboard module="tiers" toolbarPortalId="dash-toolbar-tiers" /></div>
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
              searchPlaceholder={t('tiers.ui.company_search_placeholder')}
              filters={tierFilters}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              selectable
              batchActions={tierBatchActions}
              getRowTooltip={getTierRowTooltip}
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
              searchPlaceholder={t('tiers.ui.contact_search_placeholder')}
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
        <TierDetailPanel
          key={`${dynamicPanel.id}-${dynamicPanel.meta?.contact_id ?? 'company'}`}
          id={dynamicPanel.id}
          initialContactId={typeof dynamicPanel.meta?.contact_id === 'string' ? dynamicPanel.meta.contact_id as string : undefined}
        />
      )}
    </div>
  )
}

// -- Module-level renderer registration --
registerPanelRenderer('tiers', (view) => {
  if (view.type === 'create') return <CreateTierPanel />
  if (view.type === 'detail' && 'id' in view) {
    const initialContactId = 'meta' in view && typeof view.meta?.contact_id === 'string'
      ? view.meta.contact_id as string
      : undefined
    return <TierDetailPanel id={view.id} initialContactId={initialContactId} />
  }
  return null
})
