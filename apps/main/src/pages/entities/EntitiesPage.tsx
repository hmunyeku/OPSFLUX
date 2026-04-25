/**
 * EntitiesPage — standalone admin page for managing entities.
 *
 * Architecture:
 *  - PanelHeader + PanelContent wrapper
 *  - DataTable with columns, search, filters, pagination, import/export, batch actions
 *  - CreateEntityPanel / EntityDetailPanel via DynamicPanel
 *  - SectionColumns 2-col grid, polymorphic managers, dictionary-driven selects
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Globe, Plus, Loader2, Users,
  UserPlus, Check, X,
  Building2, Clock, Archive, MapPin,
  Share2, Phone, Mail,
  MessageSquare, Paperclip, Image,
  Power,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  SectionColumns,
  DetailFieldGrid,
  InlineEditableRow,
  InlineEditableTags,
  InlineEditableCombobox,
  ReadOnlyRow,
  PanelActionButton,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { usePermission } from '@/hooks/usePermission'
import { useDebounce } from '@/hooks/useDebounce'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { usePageSize } from '@/hooks/usePageSize'
import {
  useAllEntities,
  useEntity,
  useCreateEntity,
  useUpdateEntity,
  useEntityUsers,
  useAddEntityUser,
  useRemoveEntityUser,
} from '@/hooks/useEntities'
import { useUsers } from '@/hooks/useUsers'
import {
  usePhones, useContactEmails, useAddresses,
  useNotes, useAttachments,
  useSocialNetworks, useOpeningHours,
} from '@/hooks/useSettings'
import type { EntityRead, EntityCreate as EntityCreatePayload, EntityUser } from '@/services/entityService'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  BadgeCell,
  DateCell,
  type DataTableFilterDef,
  type DataTableBatchAction,
} from '@/components/ui/DataTable'
import { TabBar } from '@/components/ui/Tabs'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { AddressManager } from '@/components/shared/AddressManager'
import { PhoneManager } from '@/components/shared/PhoneManager'
import { ContactEmailManager } from '@/components/shared/ContactEmailManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { SocialNetworkManager } from '@/components/shared/SocialNetworkManager'
import { OpeningHoursManager } from '@/components/shared/OpeningHoursManager'
import { LegalIdentifierManager } from '@/components/shared/LegalIdentifierManager'
import { EntityIcon } from '@/components/shared/EntityIcon'

// ── Constants ──────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: 'Africa/Douala', label: 'Africa/Douala (WAT)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (WAT)' },
  { value: 'Africa/Brazzaville', label: 'Africa/Brazzaville (WAT)' },
  { value: 'Africa/Libreville', label: 'Africa/Libreville (WAT)' },
  { value: 'Africa/Luanda', label: 'Africa/Luanda (WAT)' },
  { value: 'Africa/Kinshasa', label: 'Africa/Kinshasa (WAT)' },
  { value: 'Africa/Tunis', label: 'Africa/Tunis (CET)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'America/New_York', label: 'America/New_York (EST)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST)' },
  { value: 'America/Denver', label: 'America/Denver (MST)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
]

const COUNTRY_OPTIONS = [
  { value: 'CM', label: 'Cameroun' },
  { value: 'CG', label: 'Congo' },
  { value: 'CD', label: 'Congo (RDC)' },
  { value: 'GA', label: 'Gabon' },
  { value: 'GQ', label: 'Guinée Équatoriale' },
  { value: 'TD', label: 'Tchad' },
  { value: 'TN', label: 'Tunisie' },
  { value: 'AO', label: 'Angola' },
  { value: 'GB', label: 'Royaume-Uni' },
  { value: 'FR', label: 'France' },
  { value: 'US', label: 'États-Unis' },
  { value: 'PE', label: 'Pérou' },
  { value: 'CO', label: 'Colombie' },
  { value: 'GT', label: 'Guatemala' },
  { value: 'AU', label: 'Australie' },
  { value: 'NG', label: 'Nigéria' },
  { value: 'SN', label: 'Sénégal' },
]

const CURRENCY_OPTIONS = [
  { value: 'XAF', label: 'XAF — Franc CFA' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — Dollar US' },
  { value: 'GBP', label: 'GBP — Livre Sterling' },
  { value: 'XOF', label: 'XOF — Franc CFA (BCEAO)' },
  { value: 'AOA', label: 'AOA — Kwanza' },
  { value: 'PEN', label: 'PEN — Sol péruvien' },
  { value: 'COP', label: 'COP — Peso colombien' },
  { value: 'GTQ', label: 'GTQ — Quetzal' },
  { value: 'AUD', label: 'AUD — Dollar australien' },
]

const LEGAL_FORM_OPTIONS = [
  { value: 'SA', label: 'SA — Société Anonyme' },
  { value: 'SARL', label: 'SARL — Société à Responsabilité Limitée' },
  { value: 'SAS', label: 'SAS — Société par Actions Simplifiée' },
  { value: 'SNC', label: 'SNC — Société en Nom Collectif' },
  { value: 'GIE', label: 'GIE — Groupement d\'Intérêt Économique' },
  { value: 'BRANCH', label: 'Succursale' },
  { value: 'SUBSIDIARY', label: 'Filiale' },
  { value: 'OTHER', label: 'Autre' },
]

const LANGUAGE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
]

const FISCAL_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2000, i, 1).toLocaleDateString('fr-FR', { month: 'long' }),
}))

// ── Column definitions ─────────────────────────────────────

function useEntityPageColumns() {
  const { t } = useTranslation()
  const entityColumns = useMemo<ColumnDef<EntityRead, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('entities.columns.code'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {getValue() as string}
        </span>
      ),
      size: 120,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: t('entities.columns.name'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <EntityIcon logoUrl={row.original.logo_url} country={row.original.country} size={16} />
          <span className="font-medium text-foreground truncate max-w-[280px]">
            {row.original.name}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'trade_name',
      header: t('entities.columns.trade_name'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? <span className="text-sm text-muted-foreground truncate block">{v}</span> : <span className="text-muted-foreground">—</span>
      },
      size: 180,
    },
    {
      accessorKey: 'legal_form',
      header: t('entities.columns.legal_form'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        if (!v) return <span className="text-muted-foreground">—</span>
        const label = LEGAL_FORM_OPTIONS.find((o) => o.value === v)?.label ?? v
        return <BadgeCell value={label} variant="info" />
      },
      size: 140,
    },
    {
      accessorKey: 'country',
      header: t('entities.columns.country'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        if (!v) return <span className="text-muted-foreground">—</span>
        const label = COUNTRY_OPTIONS.find((c) => c.value === v)?.label ?? v
        return <CountryFlag code={v} label={label} className="text-sm text-muted-foreground" />
      },
      size: 140,
    },
    {
      accessorKey: 'city',
      header: t('entities.columns.city'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? <span className="text-sm text-muted-foreground">{v}</span> : <span className="text-muted-foreground">—</span>
      },
      size: 120,
    },
    {
      accessorKey: 'currency',
      header: t('entities.columns.currency'),
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground font-mono">{getValue() as string}</span>
      ),
      size: 80,
    },
    {
      accessorKey: 'timezone',
      header: t('entities.columns.timezone'),
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {getValue() as string}
        </span>
      ),
      size: 180,
    },
    {
      accessorKey: 'user_count',
      header: t('entities.columns.users'),
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {getValue() as number}
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'active',
      header: t('entities.columns.status'),
      cell: ({ getValue }) => {
        const active = getValue() as boolean
        return <BadgeCell value={active ? 'Active' : 'Archivée'} variant={active ? 'success' : 'neutral'} />
      },
      size: 100,
    },
    {
      accessorKey: 'created_at',
      header: t('entities.columns.created_at'),
      cell: ({ getValue }) => <DateCell value={getValue() as string} />,
      size: 110,
    },
  ], [t])

  const entityUserColumns = useMemo<ColumnDef<EntityUser, unknown>[]>(() => [
    {
      accessorKey: 'first_name',
      header: t('entities.columns.user_name'),
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className="flex items-center gap-2">
            {u.avatar_url ? (
              <img src={u.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
            ) : (
              <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold shrink-0">
                {u.first_name[0]}{u.last_name[0]}
              </div>
            )}
            <span className="text-sm font-medium text-foreground truncate">{u.first_name} {u.last_name}</span>
          </div>
        )
      },
      enableHiding: false,
    },
    {
      accessorKey: 'email',
      header: t('entities.columns.email'),
      cell: ({ getValue }) => <span className="text-xs text-muted-foreground truncate block">{getValue() as string}</span>,
      size: 200,
    },
    {
      accessorKey: 'group_names',
      header: t('entities.columns.groups'),
      cell: ({ getValue }) => {
        const groups = getValue() as string[]
        return groups.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => <span key={g} className="gl-badge gl-badge-neutral text-[9px]">{g}</span>)}
          </div>
        ) : <span className="text-muted-foreground text-xs">—</span>
      },
      size: 180,
    },
    {
      accessorKey: 'active',
      header: t('entities.columns.user_status'),
      cell: ({ getValue }) => {
        const active = getValue() as boolean
        return <BadgeCell value={active ? 'Actif' : 'Inactif'} variant={active ? 'success' : 'neutral'} />
      },
      size: 90,
    },
  ], [t])

  return { entityColumns, entityUserColumns }
}


// ── Sub-section label ────────────────────────────────────────
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

// ── Create Entity Panel ─────────────────────────────────────

function CreateEntityPanel() {
  const { t } = useTranslation()
  const createEntity = useCreateEntity()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const dictCountries = useDictionaryOptions('country')
  const dictLegalForms = useDictionaryOptions('legal_form')
  const dictCurrencies = useDictionaryOptions('currency')
  const dictIndustries = useDictionaryOptions('industry')
  const countryOpts = dictCountries.length > 0 ? dictCountries : COUNTRY_OPTIONS
  const legalFormOpts = dictLegalForms.length > 0 ? dictLegalForms : LEGAL_FORM_OPTIONS
  const currencyOpts = dictCurrencies.length > 0 ? dictCurrencies : CURRENCY_OPTIONS

  const [form, setForm] = useState<EntityCreatePayload>({
    code: '',
    name: '',
    country: 'CM',
    timezone: 'Africa/Douala',
    currency: 'XAF',
    language: 'fr',
    fiscal_year_start: 1,
    active: true,
  })

  const set = useCallback((patch: Partial<EntityCreatePayload>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createEntity.mutateAsync(form)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('entities.create')}
      subtitle={t('entities.title')}
      icon={<Globe size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createEntity.isPending}
            onClick={() => (document.getElementById('create-entity-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createEntity.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-entity-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title={t('assets.identity')}>
          <FormGrid>
            <DynamicPanelField label={t('common.code_field')} required>
              <input type="text" required maxLength={50} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="PER_CMR" />
            </DynamicPanelField>
            <DynamicPanelField label="Raison sociale" required>
              <input type="text" required value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="ACME Energy" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('entities.columns.trade_name')}>
              <input type="text" value={form.trade_name || ''} onChange={(e) => set({ trade_name: e.target.value || null })} className={panelInputClass} placeholder="Perenco Cameroun S.A." />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.country')}>
              <TagSelector options={countryOpts} value={form.country || 'CM'} onChange={(v) => set({ country: v })} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Secteur d'activité">
              {dictIndustries.length > 0 ? (
                <TagSelector options={dictIndustries} value={form.industry || ''} onChange={(v) => set({ industry: v || null })} />
              ) : (
                <input type="text" value={form.industry || ''} onChange={(e) => set({ industry: e.target.value || null })} className={panelInputClass} placeholder="Oil & Gas" />
              )}
            </DynamicPanelField>
            <DynamicPanelField label="Site web">
              <input type="url" value={form.website || ''} onChange={(e) => set({ website: e.target.value || null })} className={panelInputClass} placeholder="https://www.company.com" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('common.legal')}>
          <FormGrid>
            <DynamicPanelField label="Forme juridique">
              <TagSelector options={legalFormOpts} value={form.legal_form || ''} onChange={(v) => set({ legal_form: v || null })} />
            </DynamicPanelField>
            <DynamicPanelField label="Devise">
              <TagSelector options={currencyOpts} value={form.currency || 'XAF'} onChange={(v) => set({ currency: v })} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Capital social">
              <input type="number" value={form.capital ?? ''} onChange={(e) => set({ capital: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('entities.debut_exercice_fiscal')}>
              <TagSelector options={FISCAL_MONTH_OPTIONS} value={String(form.fiscal_year_start ?? 1)} onChange={(v) => set({ fiscal_year_start: Number(v) })} />
            </DynamicPanelField>
            <DynamicPanelField label={t('entities.date_de_fondation')}>
              <input type="date" value={form.founded_date || ''} onChange={(e) => set({ founded_date: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('common.configuration')}>
          <FormGrid>
            <DynamicPanelField label="Fuseau horaire">
              <TagSelector options={TIMEZONE_OPTIONS} value={form.timezone || 'Africa/Douala'} onChange={(v) => set({ timezone: v })} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.language')}>
              <TagSelector options={LANGUAGE_OPTIONS} value={form.language || 'fr'} onChange={(v) => set({ language: v })} />
            </DynamicPanelField>
          </FormGrid>
          <label className="flex items-center gap-2.5 cursor-pointer group mt-2">
            <input type="checkbox" checked={form.active !== false} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm text-foreground group-hover:text-primary transition-colors">Active</span>
          </label>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}


// ── Entity Detail Panel ─────────────────────────────────────

type DetailTab = 'fiche' | 'users'

function EntityDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { entityUserColumns } = useEntityPageColumns()
  const { data: entity } = useEntity(id)
  const updateEntity = useUpdateEntity()
  const { data: entityUsers, isLoading: usersLoading } = useEntityUsers(id)
  const addEntityUser = useAddEntityUser()
  const removeEntityUser = useRemoveEntityUser()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('core.entity.update')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  // Dictionary-driven options
  const dictCountries = useDictionaryOptions('country')
  const dictLegalForms = useDictionaryOptions('legal_form')
  const dictCurrencies = useDictionaryOptions('currency')
  const dictIndustries = useDictionaryOptions('industry')
  const countryOpts = dictCountries.length > 0 ? dictCountries : COUNTRY_OPTIONS
  const legalFormOpts = dictLegalForms.length > 0 ? dictLegalForms : LEGAL_FORM_OPTIONS
  const currencyOpts = dictCurrencies.length > 0 ? dictCurrencies : CURRENCY_OPTIONS

  // Polymorphic data counts
  const { data: phones } = usePhones('entity', id)
  const { data: contactEmails } = useContactEmails('entity', id)
  const { data: addresses } = useAddresses('entity', id)
  const { data: socialNetworks } = useSocialNetworks('entity', id)
  const { data: openingHours } = useOpeningHours('entity', id)
  const { data: notes } = useNotes('entity', id)
  const { data: attachments } = useAttachments('entity', id)

  const [tab, setTab] = useState<DetailTab>('fiche')
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [logoEditing, setLogoEditing] = useState(false)
  const [logoInput, setLogoInput] = useState('')
  const { data: allUsersData } = useUsers({ page: 1, page_size: 50, search: userSearch || undefined, active: true })

  const save = useCallback((field: string, value: string | number | boolean | Record<string, unknown> | null) => {
    updateEntity.mutate({ id, payload: { [field]: value } })
  }, [id, updateEntity])

  const handleToggleActive = useCallback(() => {
    if (!entity) return
    updateEntity.mutate({ id, payload: { active: !entity.active } })
  }, [id, entity, updateEntity])

  const handleAddUser = useCallback((userId: string) => {
    addEntityUser.mutate({ entityId: id, userId })
    setShowUserPicker(false)
    setUserSearch('')
  }, [id, addEntityUser])

  const handleRemoveUser = useCallback((userId: string) => {
    removeEntityUser.mutate({ entityId: id, userId })
  }, [id, removeEntityUser])

  const [userFilterSearch, setUserFilterSearch] = useState('')

  // Users DataTable columns — with remove action
  const usersColumns = useMemo<ColumnDef<EntityUser, unknown>[]>(() => [
    ...entityUserColumns,
    ...(canUpdate ? [{
      id: 'actions',
      header: '',
      size: 50,
      cell: ({ row }: { row: { original: EntityUser } }) => (
        <button
          type="button"
          className="gl-button gl-button-danger dark:hover:bg-red-900/30 text-red-500 opacity-0 group-hover:opacity-100"
          title={t('common.remove')}
          onClick={(e) => { e.stopPropagation(); handleRemoveUser(row.original.user_id) }}
        >
          <X size={12} />
        </button>
      ),
    }] : []),
  ], [canUpdate, handleRemoveUser])

  const existingUserIds = useMemo(() => new Set((entityUsers ?? []).map((u) => u.user_id)), [entityUsers])
  const availableUsers = useMemo(() => {
    if (!allUsersData?.items) return []
    return allUsersData.items.filter((u) => !existingUserIds.has(u.id) && u.active)
  }, [allUsersData, existingUserIds])

  if (!entity) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Globe size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const TABS: { id: DetailTab; label: string; icon: typeof Globe }[] = [
    { id: 'fiche', label: 'Fiche', icon: Building2 },
    { id: 'users', label: `Utilisateurs (${entity.user_count})`, icon: Users },
  ]

  return (
    <DynamicPanelShell
      title={entity.name}
      subtitle={entity.code}
      icon={<Building2 size={14} className="text-primary" />}
      actions={
        canUpdate ? (
          <PanelActionButton
            variant={entity.active ? 'danger' : 'primary'}
            onClick={handleToggleActive}
            disabled={updateEntity.isPending}
          >
            {entity.active ? <><Archive size={12} className="mr-1" /> Archiver</> : <><Check size={12} className="mr-1" /> Activer</>}
          </PanelActionButton>
        ) : null
      }
    >
      {/* Entity header with logo */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'h-14 w-14 flex items-center justify-center rounded-full shrink-0 relative group',
              entity.logo_url ? '' : 'bg-primary/10 text-primary',
            )}
            title={canUpdate ? 'Cliquer pour changer le logo' : undefined}
            onClick={() => {
              if (!canUpdate) return
              setLogoInput(entity.logo_url || '')
              setLogoEditing(true)
            }}
          >
            {entity.logo_url ? (
              <img src={entity.logo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <Building2 size={24} />
            )}
            {canUpdate && (
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                <Image size={14} className="text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {logoEditing ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="url"
                  className={cn(panelInputClass, 'flex-1 text-xs')}
                  placeholder={t('entities.url_du_logo')}
                  value={logoInput}
                  onChange={(e) => setLogoInput(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { save('logo_url', logoInput || null); setLogoEditing(false) }
                    if (e.key === 'Escape') setLogoEditing(false)
                  }}
                />
                <button className="gl-button-sm gl-button-confirm" onClick={() => { save('logo_url', logoInput || null); setLogoEditing(false) }}>
                  <Check size={10} />
                </button>
                <button className="gl-button-sm gl-button-default" onClick={() => setLogoEditing(false)}>
                  <X size={10} />
                </button>
              </div>
            ) : (
              <h3 className="text-base font-semibold text-foreground truncate">{entity.name}</h3>
            )}
            {!logoEditing && entity.trade_name && entity.trade_name !== entity.name && (
              <p className="text-xs text-muted-foreground truncate">{entity.trade_name}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs text-muted-foreground">{entity.code}</span>
              <span className={cn('gl-badge text-[9px]', entity.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                {entity.active ? 'Active' : 'Archivée'}
              </span>
              {entity.country && (
                <CountryFlag code={entity.country} label={countryOpts.find((c) => c.value === entity.country)?.label ?? entity.country} className="text-xs text-muted-foreground" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <TabBar
        items={TABS}
        activeId={tab}
        onTabChange={setTab}
        variant="muted"
      />

      {/* Tab content */}
      <PanelContentLayout>
        {tab === 'fiche' && (
          <SectionColumns>
            {/* ─── Column 1: Identity + Coordonnées + Réseaux ─── */}
            <div className="@container space-y-5">
              <FormSection title={t('assets.identity')}>
                <InlineEditableRow label="Code" value={entity.code} onSave={(v) => save('code', v)} disabled={!canUpdate} />
                <InlineEditableRow label="Raison sociale" value={entity.name} onSave={(v) => save('name', v)} disabled={!canUpdate} />
                <InlineEditableRow label={t('entities.columns.trade_name')} value={entity.trade_name || ''} onSave={(v) => save('trade_name', v || null)} disabled={!canUpdate} />
                {dictIndustries.length > 0 ? (
                  <InlineEditableCombobox label="Secteur d'activité" value={entity.industry || ''} options={dictIndustries} onSave={(v) => save('industry', v || null)} placeholder={t('entities.rechercher_un_secteur')} />
                ) : (
                  <InlineEditableRow label="Secteur d'activité" value={entity.industry || ''} onSave={(v) => save('industry', v || null)} disabled={!canUpdate} />
                )}
                <InlineEditableRow label="Site web" value={entity.website || ''} onSave={(v) => save('website', v || null)} disabled={!canUpdate} />
                <InlineEditableRow label={t('entities.date_de_fondation')} value={entity.founded_date || ''} onSave={(v) => save('founded_date', v || null)} disabled={!canUpdate} type="date" />
              </FormSection>

              {/* Coordonnées — polymorphic managers */}
              <FormSection title={t('geo.coordinates')} collapsible defaultExpanded storageKey="panel.entity.sections" id="entity-contact">
                <div className="space-y-3 border-t border-border/40 pt-3 mt-2">
                  <SubSectionLabel icon={Phone} label={t('shared.phones.title')} count={phones?.length ?? 0} />
                  <PhoneManager ownerType="entity" ownerId={id} compact />

                  <SubSectionLabel icon={Mail} label="Emails" count={contactEmails?.length ?? 0} />
                  <ContactEmailManager ownerType="entity" ownerId={id} compact />

                  <SubSectionLabel icon={MapPin} label="Adresses" count={addresses?.length ?? 0} />
                  <AddressManager ownerType="entity" ownerId={id} compact />
                </div>
              </FormSection>

              {/* Réseaux sociaux — polymorphic manager */}
              <FormSection title={t('tiers.ui.social_networks')} collapsible storageKey="panel.entity.sections" id="entity-social">
                <div className="border-t border-border/40 pt-3 mt-2">
                  <SubSectionLabel icon={Share2} label={t('entities.reseaux')} count={socialNetworks?.length ?? 0} />
                  <SocialNetworkManager ownerType="entity" ownerId={id} compact />
                </div>
              </FormSection>
            </div>

            {/* ─── Column 2: Juridique + Config + Activité + Horaires + Notes ─── */}
            <div className="@container space-y-5">
              <FormSection title={t('common.legal')}>
                <InlineEditableTags label="Forme juridique" value={entity.legal_form || ''} options={legalFormOpts} onSave={(v) => save('legal_form', v || null)} disabled={!canUpdate} />
                <InlineEditableRow label="Capital" value={entity.capital != null ? String(entity.capital) : ''} onSave={(v) => save('capital', v ? Number(v) : null)} disabled={!canUpdate} />
                <div className="mt-2">
                  <LegalIdentifierManager ownerType="entity" ownerId={id} country={entity.country} compact />
                </div>
              </FormSection>

              <FormSection title={t('common.configuration')}>
                <InlineEditableTags label="Pays" value={entity.country || ''} options={countryOpts} onSave={(v) => save('country', v)} disabled={!canUpdate} />
                <InlineEditableTags label="Fuseau horaire" value={entity.timezone} options={TIMEZONE_OPTIONS} onSave={(v) => save('timezone', v)} disabled={!canUpdate} />
                <InlineEditableTags label="Langue" value={entity.language} options={LANGUAGE_OPTIONS} onSave={(v) => save('language', v)} disabled={!canUpdate} />
                <InlineEditableTags label="Devise" value={entity.currency} options={currencyOpts} onSave={(v) => save('currency', v)} disabled={!canUpdate} />
                <InlineEditableTags label="Exercice fiscal" value={String(entity.fiscal_year_start)} options={FISCAL_MONTH_OPTIONS} onSave={(v) => save('fiscal_year_start', Number(v))} disabled={!canUpdate} />
              </FormSection>

              <FormSection title={t('paxlog.create_avm.program.activity')}>
                <ReadOnlyRow
                  label="Utilisateurs"
                  value={
                    <button
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                      onClick={() => setTab('users')}
                    >
                      <Users size={12} />{entity.user_count}
                    </button>
                  }
                />
                {entity.parent_name && (
                  <ReadOnlyRow label={t('entities.entite_parente')} value={<span className="text-sm">{entity.parent_name}</span>} />
                )}
                {entity.children_count > 0 && (
                  <ReadOnlyRow label={t('entities.sous_entites')} value={<span className="text-sm">{entity.children_count}</span>} />
                )}
                <ReadOnlyRow
                  label={t('common.created_at')}
                  value={
                    <span className="flex items-center gap-1.5 text-sm">
                      <Clock size={12} className="text-muted-foreground" />
                      {entity.created_at ? new Date(entity.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                  }
                />
                {entity.updated_at && (
                  <ReadOnlyRow
                    label={t('common.updated_at')}
                    value={<span className="text-sm">{new Date(entity.updated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                  />
                )}
              </FormSection>

              {/* Horaires d'ouverture — polymorphic manager */}
              <FormSection title="Horaires d'ouverture" collapsible storageKey="panel.entity.sections" id="entity-hours">
                <div className="border-t border-border/40 pt-3 mt-2">
                  <SubSectionLabel icon={Clock} label="Horaires" count={openingHours?.length ?? 0} />
                  <OpeningHoursManager ownerType="entity" ownerId={id} compact />
                </div>
              </FormSection>

              {/* Notes & Documents */}
              <FormSection title={t('common.notes_documents')} collapsible storageKey="panel.entity.sections" id="entity-notes-files">
                <DetailFieldGrid>
                  <div>
                    <SubSectionLabel icon={MessageSquare} label="Notes" count={notes?.length ?? 0} />
                    <NoteManager ownerType="entity" ownerId={id} compact />
                  </div>
                  <div>
                    <SubSectionLabel icon={Paperclip} label="Fichiers" count={attachments?.length ?? 0} />
                    <AttachmentManager ownerType="entity" ownerId={id} compact />
                  </div>
                </DetailFieldGrid>
              </FormSection>
            </div>
          </SectionColumns>
        )}

        {tab === 'users' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {entityUsers ? `${entityUsers.length} utilisateur(s)` : '...'}
              </span>
              {canUpdate && (
                <button className="gl-button-sm gl-button-confirm" onClick={() => setShowUserPicker(!showUserPicker)}>
                  <UserPlus size={12} /> Ajouter
                </button>
              )}
            </div>

            {showUserPicker && (
              <div className="border border-border rounded-lg bg-card">
                <div className="p-2 border-b border-border/50">
                  <input
                    type="text"
                    className={cn(panelInputClass, 'w-full')}
                    placeholder={t('paxlog.search_user')}
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {availableUsers.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground text-center">{t('entities.aucun_utilisateur_disponible')}</p>
                  ) : (
                    availableUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="gl-button gl-button-default w-full flex text-left text-sm"
                        onClick={() => handleAddUser(user.id)}
                      >
                        <UserPlus size={12} className="text-primary shrink-0" />
                        <span className="truncate flex-1">{user.first_name} {user.last_name}</span>
                        <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="p-1.5 border-t border-border/50 flex justify-end">
                  <button className="gl-button-sm gl-button-default" onClick={() => { setShowUserPicker(false); setUserSearch('') }}>
                    <X size={12} /> Fermer
                  </button>
                </div>
              </div>
            )}

            <DataTable<EntityUser>
              columns={usersColumns}
              data={entityUsers ?? []}
              isLoading={usersLoading}
              getRowId={(row) => row.user_id}
              storageKey="entity-users"

              searchValue={userFilterSearch}
              onSearchChange={setUserFilterSearch}
              searchPlaceholder="Filtrer par nom ou email..."

              sortable

              onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'users', id: row.user_id })}

              emptyIcon={Users}
              emptyTitle="Aucun utilisateur"
              emptyAction={canUpdate ? {
                label: 'Ajouter un utilisateur',
                onClick: () => setShowUserPicker(true),
              } : undefined}
            />
          </div>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}


// ── Entities list view ───────────────────────────────────────

function EntitiesListView() {
  const { t } = useTranslation()
  const { entityColumns } = useEntityPageColumns()
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useFilterPersistence<Record<string, unknown>>('entities.filters', {})
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  const { hasPermission } = usePermission()
  const canExport = hasPermission('core.entity.read')
  const canUpdate = hasPermission('core.entity.update')
  const canDelete = hasPermission('core.entity.delete')
  const updateEntity = useUpdateEntity()
  const confirm = useConfirm()

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const active = statusFilter === 'active' ? true : statusFilter === 'archived' ? false : undefined

  const { data, isLoading } = useAllEntities({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    active,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  useEffect(() => {
    if (data?.items) setNavItems(data.items.map(i => i.id))
    return () => setNavItems([])
  }, [data?.items, setNavItems])

  const filters = useMemo<DataTableFilterDef[]>(() => {
    const activeCount = data?.items?.filter((e) => e.active).length ?? 0
    const archivedCount = data?.items?.filter((e) => !e.active).length ?? 0
    return [{
      id: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Toutes', count: data?.total },
        { value: 'active', label: 'Actives', count: activeCount },
        { value: 'archived', label: 'Archivées', count: archivedCount },
      ],
    }]
  }, [data])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null || value === 'all') delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  // ── Batch actions ──
  const batchActions: DataTableBatchAction<EntityRead>[] = useMemo(() => {
    const actions: DataTableBatchAction<EntityRead>[] = []
    if (canUpdate) {
      actions.push(
        {
          id: 'activate',
          label: 'Activer',
          icon: Power,
          onAction: async (rows) => {
            const inactive = rows.filter((r) => !r.active)
            if (inactive.length === 0) return
            await Promise.all(inactive.map((r) => updateEntity.mutateAsync({ id: r.id, payload: { active: true } })))
          },
        },
        {
          id: 'archive',
          label: 'Archiver',
          icon: Archive,
          variant: 'danger',
          onAction: async (rows) => {
            const activeRows = rows.filter((r) => r.active)
            if (activeRows.length === 0) return
            const ok = await confirm({
              title: `Archiver ${activeRows.length} entité(s) ?`,
              message: 'Les entités sélectionnées seront désactivées.',
              confirmLabel: 'Archiver',
              variant: 'danger',
            })
            if (!ok) return
            await Promise.all(activeRows.map((r) => updateEntity.mutateAsync({ id: r.id, payload: { active: false } })))
          },
        },
      )
    }
    return actions
  }, [canUpdate, canDelete, updateEntity, confirm])

  const pagination = data ? {
    page: data.page,
    pageSize: data.page_size,
    total: data.total,
    pages: data.pages,
  } : undefined

  return (
    <DataTable<EntityRead>
      columns={entityColumns}
      data={data?.items ?? []}
      isLoading={isLoading}
      getRowId={(row) => row.id}
      storageKey="entities"

      pagination={pagination}
      onPaginationChange={(p, size) => {
        if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p)
      }}

      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Rechercher par code ou nom..."

      sortable
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}

      columnVisibility
      defaultHiddenColumns={['created_at', 'trade_name', 'currency']}

      selectable
      batchActions={batchActions}

      importExport={canExport ? {
        exportFormats: ['csv', 'xlsx'],
        advancedExport: true,
        filenamePrefix: 'entites',
        exportHeaders: {
          code: 'Code',
          name: 'Raison sociale',
          trade_name: 'Nom commercial',
          legal_form: 'Forme juridique',
          country: 'Pays',
          city: 'Ville',
          currency: 'Devise',
          timezone: 'Fuseau horaire',
          user_count: 'Utilisateurs',
          active: 'Statut',
          created_at: 'Créé le',
        },
        importWizardTarget: canUpdate ? 'entity' as never : undefined,
        importTemplate: {
          filename: 'modele_entites',
          includeExamples: true,
          columns: [
            { key: 'code', label: 'Code', required: true, example: 'PER_CMR' },
            { key: 'name', label: 'Raison sociale', required: true, example: 'ACME Energy' },
            { key: 'trade_name', label: 'Nom commercial', example: 'ACME Energy S.A.' },
            { key: 'country', label: 'Pays (ISO)', example: 'CM' },
            { key: 'timezone', label: 'Fuseau horaire', example: 'Africa/Douala' },
            { key: 'currency', label: 'Devise', example: 'XAF' },
            { key: 'legal_form', label: 'Forme juridique', example: 'SA' },
            { key: 'registration_number', label: 'N° RCCM', example: 'RC/DLA/2019/B/1234' },
            { key: 'tax_id', label: 'Tax ID', example: 'M012345678901A' },
          ],
        },
      } : undefined}

      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'entities', id: row.id })}

      columnResizing
      columnPinning
      defaultPinnedColumns={{ left: ['code'] }}

      emptyIcon={Globe}
      emptyTitle={t('entities.no_entities')}
      emptyAction={{
        label: t('entities.create'),
        onClick: () => openDynamicPanel({ type: 'create', module: 'entities' }),
      }}
    />
  )
}


// ── Main page ────────────────────────────────────────────────

export function EntitiesPage() {
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const { hasPermission } = usePermission()
  const canCreate = hasPermission('core.entity.create')

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'entities'

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Building2} title={t('entities.title')} subtitle="Gestion des entités de l'organisation">
            {canCreate && (
              <ToolbarButton
                icon={Plus}
                label={t('entities.create')}
                variant="primary"
                onClick={() => openDynamicPanel({ type: 'create', module: 'entities' })}
              />
            )}
          </PanelHeader>

          <PanelContent scroll={false}>
            <EntitiesListView />
          </PanelContent>
        </div>
      )}

      {dynamicPanel?.module === 'entities' && dynamicPanel.type === 'create' && <CreateEntityPanel />}
      {dynamicPanel?.module === 'entities' && dynamicPanel.type === 'detail' && <EntityDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}


// ── Panel renderer registration ──────────────────────────────

registerPanelRenderer('entities', (view) => {
  if (view.type === 'create') return <CreateEntityPanel />
  if (view.type === 'detail' && 'id' in view) return <EntityDetailPanel id={view.id} />
  return null
})
