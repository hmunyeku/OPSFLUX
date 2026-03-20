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
  Phone, Mail, Users, ArrowLeft, Star, Pencil, Globe,
  ChevronDown, FileText, Search,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef, ImportExportConfig } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { usePermission } from '@/hooks/usePermission'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
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
import { TierIdentifierManager } from '@/components/shared/TierIdentifierManager'
import { ComplianceRecordManager } from '@/components/shared/ComplianceRecordManager'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useTiers, useCreateTier, useUpdateTier, useArchiveTier,
  useTierContacts, useCreateTierContact, useUpdateTierContact,
  useDeleteTierContact, useTierIdentifiers, useAllTierContacts,
} from '@/hooks/useTiers'
import { useAddresses, useNotes, useAttachments, usePhones, useContactEmails } from '@/hooks/useSettings'
import { useProjects } from '@/hooks/useProjets'
import { useToast } from '@/components/ui/Toast'
import type { Tier, TierCreate, TierContact, TierContactCreate, TierContactUpdate, TierContactWithTier } from '@/types/api'

// -- Constants ----------------------------------------------------------------

const TIER_TYPE_OPTIONS = [
  { value: 'client', label: 'Client' },
  { value: 'supplier', label: 'Fournisseur' },
  { value: 'subcontractor', label: 'Sous-traitant' },
  { value: 'partner', label: 'Partenaire' },
]

const LEGAL_FORM_OPTIONS = [
  { value: 'SARL', label: 'SARL' },
  { value: 'SA', label: 'SA' },
  { value: 'SAS', label: 'SAS' },
  { value: 'GIE', label: 'GIE' },
  { value: 'SNC', label: 'SNC' },
  { value: 'EI', label: 'Entreprise Individuelle' },
  { value: 'OTHER', label: 'Autre' },
]

const CIVILITY_OPTIONS = [
  { value: 'M.', label: 'M.' },
  { value: 'Mme', label: 'Mme' },
  { value: 'Dr', label: 'Dr' },
  { value: 'Pr', label: 'Pr' },
]

const CURRENCY_OPTIONS = [
  { value: 'XAF', label: 'XAF - Franc CFA CEMAC' },
  { value: 'XOF', label: 'XOF - Franc CFA UEMOA' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'USD', label: 'USD - Dollar US' },
  { value: 'GBP', label: 'GBP - Livre Sterling' },
]

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
  const [form, setForm] = useState<TierCreate>({
    name: '',
    type: 'client',
    alias: null,
    website: null,
    legal_form: null,
    capital: null,
    currency: 'XAF',
    industry: null,
    payment_terms: null,
    description: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createTier.mutateAsync(form)
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
              options={TIER_TYPE_OPTIONS}
              value={form.type || 'client'}
              onChange={(v) => setForm({ ...form, type: v })}
            />
          </FormSection>

          {/* 2-column layout on wide screens */}
          <SectionColumns>
            {/* Column 1: Identification + Coordonnees */}
            <div className="@container space-y-5">
              <FormSection title="Identification">
                <FormGrid>
                  <DynamicPanelField label={t('common.code')}>
                    <span className="text-sm font-mono text-muted-foreground italic">Auto-généré à la création</span>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.name')} required>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Nom de l'entreprise" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom commercial">
                    <input type="text" value={form.alias ?? ''} onChange={(e) => setForm({ ...form, alias: e.target.value || null })} className={panelInputClass} placeholder="DBA / Trade name" />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>

              <FormSection title="Coordonnees">
                <FormGrid>
                  <DynamicPanelField label="Site web">
                    <input type="url" value={form.website ?? ''} onChange={(e) => setForm({ ...form, website: e.target.value || null })} className={panelInputClass} placeholder="https://..." />
                  </DynamicPanelField>
                </FormGrid>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Telephones, emails et adresses seront geres dans la fiche apres creation.
                </p>
              </FormSection>
            </div>

            {/* Column 2: Informations legales + Description */}
            <div className="@container space-y-5">
              <FormSection title="Informations legales">
                <FormGrid>
                  <DynamicPanelField label="Forme juridique">
                    <select
                      value={form.legal_form ?? ''}
                      onChange={(e) => setForm({ ...form, legal_form: e.target.value || null })}
                      className={panelInputClass}
                    >
                      <option value="">--</option>
                      {LEGAL_FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Capital social">
                    <input type="number" step="any" value={form.capital ?? ''} onChange={(e) => setForm({ ...form, capital: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Devise">
                    <select
                      value={form.currency ?? 'XAF'}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className={panelInputClass}
                    >
                      {CURRENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Secteur d'activite">
                    <input type="text" value={form.industry ?? ''} onChange={(e) => setForm({ ...form, industry: e.target.value || null })} className={panelInputClass} placeholder="Petrole & Gaz" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Conditions de paiement">
                    <input type="text" value={form.payment_terms ?? ''} onChange={(e) => setForm({ ...form, payment_terms: e.target.value || null })} className={panelInputClass} placeholder="30 jours net" />
                  </DynamicPanelField>
                </FormGrid>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Les identifiants legaux (SIRET, RCCM, NIU, TVA, NIF...) seront geres dans la fiche.
                </p>
              </FormSection>

              <FormSection title="Description" collapsible defaultExpanded={false}>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description libre..."
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

function TierDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const archiveTier = useArchiveTier()
  const { data } = useTiers({ page: 1, page_size: 100 })
  const tier = data?.items.find((t) => t.id === id)
  const updateTier = useUpdateTier()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('tier.update')

  // Drill-down state: null = company view, string = contact detail view
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const handleInlineSave = useCallback((field: string, value: string) => {
    updateTier.mutate({ id, payload: { [field]: value } })
  }, [id, updateTier])

  // Fetch counts for company-level data
  const { data: phones } = usePhones('tier', tier?.id)
  const { data: contactEmails } = useContactEmails('tier', tier?.id)
  const { data: addresses } = useAddresses('tier', tier?.id)
  const { data: notes } = useNotes('tier', tier?.id)
  const { data: attachments } = useAttachments('tier', tier?.id)
  const { data: identifiers } = useTierIdentifiers(tier?.id)

  // Contacts (employees)
  const { data: contacts, isLoading: contactsLoading } = useTierContacts(tier?.id)
  const contactList: TierContact[] = contacts ?? []

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
          confirmLabel="Supprimer ?"
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
            <FormSection title="Fiche entreprise" collapsible defaultExpanded storageKey="tier-detail-sections">
              <DetailFieldGrid>
                <InlineEditableRow label={t('common.name')} value={tier.name} onSave={(v) => handleInlineSave('name', v)} />
                <ReadOnlyRow label={t('common.code')} value={<span className="text-sm font-mono font-medium text-foreground">{tier.code || '—'}</span>} />
              </DetailFieldGrid>
              {tier.alias !== null && (
                <InlineEditableRow label="Nom commercial" value={tier.alias || ''} onSave={(v) => handleInlineSave('alias', v)} />
              )}
              {!tier.alias && canEdit && (
                <button onClick={() => handleInlineSave('alias', ' ')} className="text-[10px] text-primary hover:underline">+ Ajouter nom commercial</button>
              )}
              <DetailFieldGrid>
                <InlineEditableTags
                  label={t('common.type')}
                  value={tier.type || ''}
                  options={TIER_TYPE_OPTIONS}
                  onSave={(v) => handleInlineSave('type', v)}
                />
                <ReadOnlyRow
                  label={t('common.status')}
                  value={
                    <span className={cn('gl-badge', tier.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                      {tier.active ? t('common.active') : t('common.archived')}
                    </span>
                  }
                />
              </DetailFieldGrid>
            </FormSection>

            <FormSection title="Coordonnees entreprise" collapsible defaultExpanded storageKey="tier-detail-sections">
              {tier.website && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Globe size={11} className="shrink-0" />
                  <a href={tier.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary truncate">{tier.website}</a>
                </div>
              )}
              <InlineEditableRow label="Site web" value={tier.website || ''} onSave={(v) => handleInlineSave('website', v)} />

              <div className="space-y-3 border-t border-border/40 pt-3 mt-2">
                <SubSectionLabel icon={Phone} label="Telephones" count={phones?.length ?? 0} />
                <PhoneManager ownerType="tier" ownerId={tier.id} compact />

                <SubSectionLabel icon={Mail} label="Emails" count={contactEmails?.length ?? 0} />
                <ContactEmailManager ownerType="tier" ownerId={tier.id} compact />

                <SubSectionLabel icon={MapPin} label="Adresses" count={addresses?.length ?? 0} />
                <AddressManager ownerType="tier" ownerId={tier.id} compact />
              </div>
            </FormSection>
          </div>

          {/* ── Right column: Infos legales + Contacts ── */}
          <div className="@container space-y-5">
            <FormSection title={`Informations legales (${identifiers?.length ?? 0})`} collapsible defaultExpanded storageKey="tier-detail-sections">
              <DetailFieldGrid>
                <InlineEditableTags
                  label="Forme juridique"
                  value={tier.legal_form || ''}
                  options={LEGAL_FORM_OPTIONS}
                  onSave={(v) => handleInlineSave('legal_form', v)}
                />
                <InlineEditableRow label="Capital" value={tier.capital ? String(tier.capital) : ''} onSave={(v) => handleInlineSave('capital', v)} />
                <ReadOnlyRow label="Devise" value={<span className="text-sm">{tier.currency || 'XAF'}</span>} />
                <InlineEditableRow label="Secteur" value={tier.industry || ''} onSave={(v) => handleInlineSave('industry', v)} />
                <InlineEditableRow label="Paiement" value={tier.payment_terms || ''} onSave={(v) => handleInlineSave('payment_terms', v)} />
              </DetailFieldGrid>

              <div className="border-t border-border/40 pt-3 mt-3">
                <SubSectionLabel icon={FileText} label="Identifiants legaux" count={identifiers?.length ?? 0} />
                <TierIdentifierManager tierId={tier.id} compact />
              </div>
            </FormSection>

            <FormSection title={`Employes (${contactList.length})`} collapsible defaultExpanded storageKey="tier-detail-sections">
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

        {/* Conformite */}
        <FormSection title="Conformite" collapsible defaultExpanded={false} storageKey="tier-detail-conformite">
          <ComplianceRecordManager ownerType="tier" ownerId={tier.id} compact />
        </FormSection>

        {/* Projets liés */}
        {relatedProjects && relatedProjects.items.length > 0 && (
          <FormSection title={`Projets lies (${relatedProjects.total})`} collapsible defaultExpanded={false} storageKey="tier-detail-projets">
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
        <FormSection title="Notes & Documents" collapsible defaultExpanded={false} storageKey="tier-detail-sections">
          <DetailFieldGrid>
            <div>
              <SubSectionLabel icon={MessageSquare} label="Notes" count={notes?.length ?? 0} />
              <NoteManager ownerType="tier" ownerId={tier.id} compact />
            </div>
            <div>
              <SubSectionLabel icon={Paperclip} label="Fichiers" count={attachments?.length ?? 0} />
              <AttachmentManager ownerType="tier" ownerId={tier.id} compact />
            </div>
          </DetailFieldGrid>
        </FormSection>

        <FormSection title="Description" collapsible defaultExpanded={false} storageKey="tier-detail-sections">
          <InlineEditableRow
            label="Description"
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
  const { toast } = useToast()
  const createContact = useCreateTierContact()
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
      await createContact.mutateAsync({ tierId, payload: form })
      setForm(EMPTY_CONTACT_FORM)
      setShowForm(false)
      toast({ title: 'Employe ajoute', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la creation', variant: 'error' })
    }
  }, [tierId, form, createContact, toast])

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
              placeholder="Rechercher un employe..."
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
            Ajouter
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-border rounded-md p-3 space-y-2 bg-accent/20">
          <FormGrid>
            <DynamicPanelField label="Civilite">
              <select value={form.civility ?? ''} onChange={(e) => setForm({ ...form, civility: e.target.value || null })} className={panelInputClass}>
                <option value="">--</option>
                {CIVILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label="Prenom" required>
              <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Nom" required>
              <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Poste / Fonction">
              <input type="text" value={form.position ?? ''} onChange={(e) => setForm({ ...form, position: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Departement">
              <input type="text" value={form.department ?? ''} onChange={(e) => setForm({ ...form, department: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} className="rounded border-border" />
            Employe principal
          </label>
          <p className="text-[9px] text-muted-foreground">
            Telephones, emails et adresses du contact seront geres dans sa fiche.
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={handleCreate}
              disabled={!form.first_name.trim() || !form.last_name.trim() || createContact.isPending}
              className="px-2 py-1 rounded text-[11px] font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {createContact.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Creer'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {contacts.length === 0 && !showForm && (
        <EmptyState
          icon={Users}
          title="Aucun employe"
          description="Ajoutez les employes de cette entreprise"
          variant="search"
          size="compact"
          action={canEdit ? { label: 'Ajouter un employe', onClick: () => setShowForm(true) } : undefined}
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
        <p className="text-[11px] text-muted-foreground text-center py-3">Aucun resultat pour "{contactSearch}"</p>
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
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0',
                contact.is_primary ? 'bg-primary/15 text-primary' : 'bg-accent text-muted-foreground',
              )}>
                {contact.first_name[0]}{contact.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {contact.civility && <span className="text-[10px] text-muted-foreground">{contact.civility}</span>}
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
          Afficher plus ({filtered.length - visibleCount} restant{filtered.length - visibleCount > 1 ? 's' : ''})
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
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('tier.update')
  const { data: contacts } = useTierContacts(tierId)
  const contact = contacts?.find((c) => c.id === contactId)

  // Fetch polymorphic counts for badge display
  const { data: contactPhones } = usePhones('tier_contact', contact?.id)
  const { data: contactCEmails } = useContactEmails('tier_contact', contact?.id)

  const updateContact = useUpdateTierContact()
  const deleteContact = useDeleteTierContact()
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
      await updateContact.mutateAsync({ tierId, contactId, payload: editForm })
      setEditMode(false)
      toast({ title: 'Employe mis a jour', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [tierId, contactId, editForm, updateContact, toast])

  const handleDelete = useCallback(async () => {
    try {
      await deleteContact.mutateAsync({ tierId, contactId })
      onBack()
      toast({ title: 'Employe supprime', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [tierId, contactId, deleteContact, onBack, toast])

  const handleSetPrimary = useCallback(async () => {
    try {
      await updateContact.mutateAsync({ tierId, contactId, payload: { is_primary: true } })
      toast({ title: 'Employe principal defini', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [tierId, contactId, updateContact, toast])

  if (!contact) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  const fullName = `${contact.civility ? contact.civility + ' ' : ''}${contact.first_name} ${contact.last_name}`

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
                  Modifier
                </PanelActionButton>
              )}
              <DangerConfirmButton
                icon={<Trash2 size={12} />}
                onConfirm={handleDelete}
                confirmLabel="Supprimer ?"
              >
                Supprimer
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
            Employe principal
          </div>
        )}

        {/* 2-column layout on wide screens */}
        <SectionColumns>
          {/* ── Left column: Fiche employe + Actions ── */}
          <div className="@container space-y-5">
            <FormSection title="Fiche employe" collapsible defaultExpanded storageKey="contact-detail-sections">
              {editMode ? (
                <div className="space-y-2">
                  <FormGrid>
                    <DynamicPanelField label="Civilite">
                      <select value={editForm.civility ?? ''} onChange={(e) => setEditForm({ ...editForm, civility: e.target.value || null })} className={panelInputClass}>
                        <option value="">--</option>
                        {CIVILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </DynamicPanelField>
                    <DynamicPanelField label="Prenom" required>
                      <input type="text" value={editForm.first_name ?? ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label="Nom" required>
                      <input type="text" value={editForm.last_name ?? ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label="Poste / Fonction">
                      <input type="text" value={editForm.position ?? ''} onChange={(e) => setEditForm({ ...editForm, position: e.target.value || null })} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label="Departement">
                      <input type="text" value={editForm.department ?? ''} onChange={(e) => setEditForm({ ...editForm, department: e.target.value || null })} className={panelInputClass} />
                    </DynamicPanelField>
                  </FormGrid>
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={handleSave}
                      disabled={!editForm.first_name?.trim() || !editForm.last_name?.trim() || updateContact.isPending}
                      className="px-2.5 py-1 rounded text-[11px] font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {updateContact.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Enregistrer'}
                    </button>
                    <button onClick={() => setEditMode(false)} className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <DetailFieldGrid>
                  <ReadOnlyRow label="Civilite" value={contact.civility || '--'} />
                  <ReadOnlyRow label="Prenom" value={contact.first_name} />
                  <ReadOnlyRow label="Nom" value={contact.last_name} />
                  <ReadOnlyRow label="Poste" value={contact.position || '--'} />
                  <ReadOnlyRow label="Departement" value={contact.department || '--'} />
                </DetailFieldGrid>
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
                    <Star size={10} /> Definir comme employe principal
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Right column: Coordonnees ── */}
          <div className="@container space-y-5">
            <FormSection title="Coordonnees de l'employe" collapsible defaultExpanded storageKey="contact-detail-sections">
              <SubSectionLabel icon={Phone} label="Telephones" count={contactPhones?.length ?? 0} />
              <PhoneManager ownerType="tier_contact" ownerId={contact.id} compact />

              <SubSectionLabel icon={Mail} label="Emails" count={contactCEmails?.length ?? 0} />
              <ContactEmailManager ownerType="tier_contact" ownerId={contact.id} compact />

              <SubSectionLabel icon={MapPin} label="Adresses" count={0} />
              <AddressManager ownerType="tier_contact" ownerId={contact.id} compact />
            </FormSection>
          </div>
        </SectionColumns>

        {/* Conformite — HSE compliance per employee */}
        <FormSection title="Conformite" collapsible defaultExpanded={false} storageKey="contact-detail-conformite">
          <ComplianceRecordManager ownerType="tier_contact" ownerId={contact.id} compact />
        </FormSection>

        {/* Full-width: Notes & Documents */}
        <FormSection title="Notes & Documents" collapsible defaultExpanded={false} storageKey="contact-detail-sections">
          <DetailFieldGrid>
            <div>
              <SubSectionLabel icon={MessageSquare} label="Notes" count={0} />
              <NoteManager ownerType="tier_contact" ownerId={contact.id} compact />
            </div>
            <div>
              <SubSectionLabel icon={Paperclip} label="Fichiers" count={0} />
              <AttachmentManager ownerType="tier_contact" ownerId={contact.id} compact />
            </div>
          </DetailFieldGrid>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Main Page ----------------------------------------------------------------

type TiersTab = 'entreprises' | 'contacts'

const TABS: { id: TiersTab; label: string; icon: typeof Building2 }[] = [
  { id: 'entreprises', label: 'Entreprises', icon: Building2 },
  { id: 'contacts', label: 'Employes', icon: Users },
]

// ── Contacts columns (for the global contacts DataTable) ──
function useContactColumns() {
  const { t } = useTranslation()
  return useMemo<ColumnDef<TierContactWithTier, unknown>[]>(() => [
    {
      accessorKey: 'last_name',
      header: 'Nom',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
            row.original.is_primary ? 'bg-primary/15 text-primary' : 'bg-accent text-muted-foreground',
          )}>
            {row.original.first_name[0]}{row.original.last_name[0]}
          </div>
          <div className="min-w-0">
            <span className="text-foreground font-medium text-sm">
              {row.original.civility ? `${row.original.civility} ` : ''}{row.original.first_name} {row.original.last_name}
            </span>
            {row.original.is_primary && <Star size={9} className="inline ml-1 text-primary fill-primary" />}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'tier_name',
      header: 'Entreprise',
      size: 160,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-foreground text-xs">{row.original.tier_name}</span>
          <span className="text-[10px] text-muted-foreground">{row.original.tier_code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'position',
      header: 'Poste',
      size: 140,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.position || '--'}</span>,
    },
    {
      accessorKey: 'department',
      header: 'Departement',
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.department || '--'}</span>,
    },
    {
      accessorKey: 'is_primary',
      header: 'Principal',
      size: 80,
      cell: ({ row }) => row.original.is_primary
        ? <span className="gl-badge gl-badge-info">Oui</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
    {
      accessorKey: 'created_at',
      header: 'Cree le',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {new Date(row.original.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ], [t])
}

export function TiersPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TiersTab>('entreprises')

  // ── Shared state ──
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
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

  // Reset search/filters when switching tabs
  const handleTabChange = useCallback((tab: TiersTab) => {
    setActiveTab(tab)
    setSearch('')
    setActiveFilters({})
    setPage(1)
  }, [])

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
      options: TIER_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
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
  ], [t])

  // ── Contacts filters ──
  const contactFilters = useMemo<DataTableFilterDef[]>(() => [
    {
      id: 'is_primary',
      label: 'Employe principal',
      type: 'select',
      options: [
        { value: 'true', label: 'Oui' },
        { value: 'false', label: 'Non' },
      ],
    },
  ], [])

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
          {TIER_TYPE_OPTIONS.find(o => o.value === row.original.type)?.label ?? row.original.type}
        </span>
      ) : <span className="text-muted-foreground">--</span>,
    },
    {
      accessorKey: 'industry',
      header: 'Secteur',
      size: 120,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{row.original.industry || '--'}</span>
      ),
    },
    {
      accessorKey: 'contact_count',
      header: 'Employes',
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
      header: 'Forme juridique',
      size: 110,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {row.original.legal_form ? LEGAL_FORM_OPTIONS.find(o => o.value === row.original.legal_form)?.label ?? row.original.legal_form : '--'}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: t('common.status'),
      size: 90,
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
          {row.original.active ? t('common.active') : t('common.archived')}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Cree le',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ], [t])

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
        first_name: 'Prenom', last_name: 'Nom', tier_name: 'Entreprise',
        position: 'Poste', department: 'Departement', is_primary: 'Principal',
      } : {
        code: 'Code', name: 'Nom', alias: 'Nom commercial', type: 'Type',
        website: 'Site web', industry: 'Secteur', legal_form: 'Forme juridique',
        currency: 'Devise', active: 'Actif', created_at: 'Date de creation',
      }) as Record<string, string>,
    }
  }, [canExport, canImport, activeTab])

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
        <div className="flex items-center gap-1 px-4 border-b border-border shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon size={13} />
                {tab.label}
                {tab.id === 'contacts' && contactsData?.total !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold ml-0.5">
                    {contactsData.total}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <PanelContent>
          {activeTab === 'entreprises' ? (
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
              searchPlaceholder="Rechercher par nom, poste, departement..."
              filters={contactFilters}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'tiers', id: row.tier_id })}
              emptyIcon={Users}
              emptyTitle="Aucun employe trouve"
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
      {dynamicPanel?.module === 'tiers' && dynamicPanel.type === 'detail' && <TierDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// -- Module-level renderer registration --
registerPanelRenderer('tiers', (view) => {
  if (view.type === 'create') return <CreateTierPanel />
  if (view.type === 'detail' && 'id' in view) return <TierDetailPanel id={view.id} />
  return null
})
