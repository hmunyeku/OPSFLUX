/**
 * Tier-related contact list + contact detail panel.
 *
 * Used inside TierDetailPanel's "Contacts" section. Extracted
 * from TiersPage.tsx to keep the main page reviewable.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, Plus, Trash2, Phone, Mail, MapPin, MessageSquare, Paperclip, Building2, Loader2,
  Users, User, Star, ChevronDown, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import { TabBar } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  FormGrid,
  InlineEditableRow,
  InlineEditableSelect,
  ReadOnlyRow,
  PanelContentLayout,
  SectionColumns,
  DetailFieldGrid,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { ReferentielManager } from '@/components/shared/ReferentielManager'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { AddressManager } from '@/components/shared/AddressManager'
import { PhoneManager } from '@/components/shared/PhoneManager'
import { ContactEmailManager } from '@/components/shared/ContactEmailManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import {
  useTierContacts,
  useCreateTierContact,
  useUpdateTierContact,
  useDeleteTierContact,
  usePromoteTierContactToUser,
} from '@/hooks/useTiers'
import { usePhones, useContactEmails, useAddresses, useNotes, useAttachments } from '@/hooks/useSettings'
import { useDictionaryOptions, useDictionaryLabels } from '@/hooks/useDictionary'
import { usePermission } from '@/hooks/usePermission'
import { normalizeNames } from '@/lib/normalize'
import { validateTierContactForm } from '@/lib/formValidation'
import type { TierContact, TierContactCreate, TierContactUpdate, TierContactWithTier } from '@/types/api'

const EMPTY_CONTACT_FORM: TierContactCreate = {
  civility: null,
  first_name: '',
  last_name: '',
  position: null,
  department: null,
  is_primary: false,
}

// Local copy — same one lives in TiersPage. Duplicated to keep
// this file free of circular imports.
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

export const CONTACTS_PAGE_SIZE = 15

export function ContactListSection({
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
    // Client-side validation gate. Server-side Pydantic still validates;
    // this catches typos before the network roundtrip.
    const errors = validateTierContactForm(form)
    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0]
      toast({
        title: 'Formulaire incomplet',
        description: firstError,
        variant: 'error',
      })
      return
    }
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
              className="gl-button-sm gl-button-confirm"
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

export function ContactDetailPanel({
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
  const saveContactPatch = useCallback(async (patch: TierContactUpdate, successTitle?: string) => {
    try {
      await updateContact.mutateAsync({ tierId, contactId, payload: normalizeNames(patch) })
      toast({ title: successTitle || t('tiers.ui.contact_updated'), variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [tierId, contactId, updateContact, toast, t])

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

  const confirmContact = useConfirm()

  const contactActionItems = useMemo<ActionItem[]>(() => {
    if (!canEdit) return []
    return [
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
        onClick: handleDelete,
      },
    ]
  }, [canEdit, t, handleDelete])

  // Tab navigation for ContactDetailPanel — MUST be before early returns
  const [contactTab, setContactTab] = useState<'fiche' | 'documents'>('fiche')

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
      actionItems={contactActionItems}
      onActionConfirm={confirmContact}
    >
      <TabBar
        activeId={contactTab}
        onTabChange={(id) => setContactTab(id as typeof contactTab)}
        items={[
          { id: 'fiche', label: 'Fiche', icon: User },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
      />

      {contactTab === 'fiche' && (
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
              <DetailFieldGrid>
                <InlineEditableSelect
                  label={t('tiers.ui.civility')}
                  value={contact.civility || ''}
                  displayValue={civilityLabel || '--'}
                  options={[{ value: '', label: '--' }, ...civilityOptions]}
                  onSave={(newValue) => { void saveContactPatch({ civility: newValue || null }) }}
                  disabled={!canEdit}
                />
                <InlineEditableRow
                  label={t('tiers.ui.first_name')}
                  value={contact.first_name}
                  onSave={(newValue) => { if (newValue.trim()) void saveContactPatch({ first_name: newValue }) }}
                  disabled={!canEdit}
                />
                <InlineEditableRow
                  label={t('tiers.ui.last_name')}
                  value={contact.last_name}
                  onSave={(newValue) => { if (newValue.trim()) void saveContactPatch({ last_name: newValue }) }}
                  disabled={!canEdit}
                />
                <InlineEditableRow
                  label={t('tiers.ui.position')}
                  value={contact.position || ''}
                  displayValue={contact.position || '--'}
                  onSave={(newValue) => { void saveContactPatch({ position: newValue.trim() || null }) }}
                  disabled={!canEdit}
                />
                <InlineEditableRow
                  label={t('tiers.ui.department')}
                  value={contact.department || ''}
                  displayValue={contact.department || '--'}
                  onSave={(newValue) => { void saveContactPatch({ department: newValue.trim() || null }) }}
                  disabled={!canEdit}
                />
              </DetailFieldGrid>
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
                    className="gl-button-sm gl-button-confirm"
                  >
                    {promoteContact.isPending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                    {t('tiers.ui.promote_to_external_user')}
                  </button>
                </div>
              )}
            </FormSection>

            {/* Actions */}
            {canEdit && (
              <div className="flex items-center gap-2 flex-wrap">
                {!contact.is_primary && (
                  <button
                    onClick={handleSetPrimary}
                    className="gl-button-sm gl-button-ghost"
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
      </PanelContentLayout>
      )}

      {contactTab === 'documents' && (
      <PanelContentLayout>
        {/* Référentiels & Conformité — HSE compliance per employee */}
        <FormSection title={t('tiers.ui.sections.compliance')} collapsible defaultExpanded storageKey="contact-detail-conformite">
          <ReferentielManager ownerType="tier_contact" ownerId={contact.id} compact />
        </FormSection>

        {/* Full-width: Notes & Documents */}
        <FormSection title={t('tiers.ui.sections.notes_documents')} collapsible defaultExpanded storageKey="contact-detail-sections">
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
      )}
    </DynamicPanelShell>
  )
}

export function useContactColumns() {
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
