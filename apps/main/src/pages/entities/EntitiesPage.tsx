/**
 * EntitiesPage — standalone admin page for managing entities.
 *
 * Architecture:
 *  - PanelHeader + PanelContent wrapper
 *  - DataTable with columns, search, filters, pagination, export
 *  - CreateEntityPanel / EntityDetailPanel via DynamicPanel
 *  - Tabbed detail: Général, Juridique, Adresse & Contact, Réseaux & Horaires, Utilisateurs
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Globe, Plus, Loader2, Users,
  UserPlus, UserMinus, Check, X,
  Building2, Clock, Archive, MapPin,
  Scale, Share2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isoToFlag } from '@/lib/countryFlags'
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
  SectionHeader,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { usePermission } from '@/hooks/usePermission'
import { useDebounce } from '@/hooks/useDebounce'
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
import type { EntityRead, EntityCreate as EntityCreatePayload } from '@/services/entityService'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  BadgeCell,
  DateCell,
  type DataTableFilterDef,
} from '@/components/ui/DataTable'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { AddressManager } from '@/components/shared/AddressManager'
import { PhoneManager } from '@/components/shared/PhoneManager'
import { ContactEmailManager } from '@/components/shared/ContactEmailManager'

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

const DAY_LABELS: Record<string, string> = {
  mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi',
  thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche',
}
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const SOCIAL_KEYS: { key: string; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'twitter', label: 'Twitter / X' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
]

// ── Column definitions ─────────────────────────────────────

const entityColumns: ColumnDef<EntityRead, unknown>[] = [
  {
    accessorKey: 'code',
    header: 'Code',
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
    header: 'Nom',
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground truncate max-w-[300px] block">
        {getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: 'country',
    header: 'Pays',
    cell: ({ getValue }) => {
      const v = getValue() as string | null
      if (!v) return <span className="text-muted-foreground">—</span>
      const flag = isoToFlag(v)
      const label = COUNTRY_OPTIONS.find((c) => c.value === v)?.label ?? v
      return <span className="text-sm text-muted-foreground">{flag ? `${flag} ${label}` : label}</span>
    },
    size: 140,
  },
  {
    accessorKey: 'city',
    header: 'Ville',
    cell: ({ getValue }) => {
      const v = getValue() as string | null
      return v ? <span className="text-sm text-muted-foreground">{v}</span> : <span className="text-muted-foreground">—</span>
    },
    size: 120,
  },
  {
    accessorKey: 'timezone',
    header: 'Fuseau horaire',
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground font-mono">
        {getValue() as string}
      </span>
    ),
    size: 180,
  },
  {
    accessorKey: 'user_count',
    header: 'Utilisateurs',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {getValue() as number}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: 'active',
    header: 'Statut',
    cell: ({ getValue }) => {
      const active = getValue() as boolean
      return <BadgeCell value={active ? 'Active' : 'Archivée'} variant={active ? 'success' : 'neutral'} />
    },
    size: 100,
  },
  {
    accessorKey: 'created_at',
    header: 'Créé le',
    cell: ({ getValue }) => <DateCell value={getValue() as string} />,
    size: 110,
  },
]


// ── Create Entity Panel ─────────────────────────────────────

function CreateEntityPanel() {
  const { t } = useTranslation()
  const createEntity = useCreateEntity()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // Dictionary-driven options (fallback to static if loading)
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
        {/* Identity */}
        <FormSection title="Identité">
          <FormGrid>
            <DynamicPanelField label="Code" required>
              <input type="text" required maxLength={50} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="PER_CMR" />
            </DynamicPanelField>
            <DynamicPanelField label="Raison sociale" required>
              <input type="text" required value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="Perenco Cameroun" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Nom commercial">
              <input type="text" value={form.trade_name || ''} onChange={(e) => set({ trade_name: e.target.value || null })} className={panelInputClass} placeholder="Perenco Cameroun S.A." />
            </DynamicPanelField>
            <DynamicPanelField label="Secteur d'activité">
              {dictIndustries.length > 0 ? (
                <TagSelector options={dictIndustries} value={form.industry || ''} onChange={(v) => set({ industry: v || null })} />
              ) : (
                <input type="text" value={form.industry || ''} onChange={(e) => set({ industry: e.target.value || null })} className={panelInputClass} placeholder="Oil & Gas" />
              )}
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* Legal */}
        <FormSection title="Juridique">
          <FormGrid>
            <DynamicPanelField label="Forme juridique">
              <TagSelector options={legalFormOpts} value={form.legal_form || ''} onChange={(v) => set({ legal_form: v || null })} />
            </DynamicPanelField>
            <DynamicPanelField label="Devise">
              <TagSelector options={currencyOpts} value={form.currency || 'XAF'} onChange={(v) => set({ currency: v })} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="N° RCCM / Immatriculation">
              <input type="text" value={form.registration_number || ''} onChange={(e) => set({ registration_number: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="N° Contribuable / Tax ID">
              <input type="text" value={form.tax_id || ''} onChange={(e) => set({ tax_id: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="N° TVA">
              <input type="text" value={form.vat_number || ''} onChange={(e) => set({ vat_number: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Capital social">
              <input type="number" value={form.capital ?? ''} onChange={(e) => set({ capital: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="1 000 000" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Début exercice fiscal">
              <TagSelector options={FISCAL_MONTH_OPTIONS} value={String(form.fiscal_year_start ?? 1)} onChange={(v) => set({ fiscal_year_start: Number(v) })} />
            </DynamicPanelField>
            <DynamicPanelField label="Date de fondation">
              <input type="date" value={form.founded_date || ''} onChange={(e) => set({ founded_date: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* Address */}
        <FormSection title="Adresse">
          <DynamicPanelField label="Adresse ligne 1">
            <input type="text" value={form.address_line1 || ''} onChange={(e) => set({ address_line1: e.target.value || null })} className={panelInputClass} placeholder="123 Rue Principale" />
          </DynamicPanelField>
          <DynamicPanelField label="Adresse ligne 2">
            <input type="text" value={form.address_line2 || ''} onChange={(e) => set({ address_line2: e.target.value || null })} className={panelInputClass} />
          </DynamicPanelField>
          <FormGrid>
            <DynamicPanelField label="Ville">
              <input type="text" value={form.city || ''} onChange={(e) => set({ city: e.target.value || null })} className={panelInputClass} placeholder="Douala" />
            </DynamicPanelField>
            <DynamicPanelField label="Région / État">
              <input type="text" value={form.state || ''} onChange={(e) => set({ state: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Code postal / BP">
              <input type="text" value={form.zip_code || ''} onChange={(e) => set({ zip_code: e.target.value || null })} className={panelInputClass} placeholder="BP 2199" />
            </DynamicPanelField>
            <DynamicPanelField label="Pays">
              <TagSelector options={countryOpts} value={form.country || 'CM'} onChange={(v) => set({ country: v })} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* Contact */}
        <FormSection title="Contact">
          <FormGrid>
            <DynamicPanelField label="Téléphone">
              <input type="tel" value={form.phone || ''} onChange={(e) => set({ phone: e.target.value || null })} className={panelInputClass} placeholder="+237 233 42 64 80" />
            </DynamicPanelField>
            <DynamicPanelField label="Fax">
              <input type="tel" value={form.fax || ''} onChange={(e) => set({ fax: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Email">
              <input type="email" value={form.email || ''} onChange={(e) => set({ email: e.target.value || null })} className={panelInputClass} placeholder="contact@company.com" />
            </DynamicPanelField>
            <DynamicPanelField label="Site web">
              <input type="url" value={form.website || ''} onChange={(e) => set({ website: e.target.value || null })} className={panelInputClass} placeholder="https://www.company.com" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* Config */}
        <FormSection title="Configuration">
          <FormGrid>
            <DynamicPanelField label="Fuseau horaire">
              <TagSelector options={TIMEZONE_OPTIONS} value={form.timezone || 'Africa/Douala'} onChange={(v) => set({ timezone: v })} />
            </DynamicPanelField>
            <DynamicPanelField label="Langue">
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

type DetailTab = 'general' | 'legal' | 'address' | 'social' | 'users'

function EntityDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: entity } = useEntity(id)
  const updateEntity = useUpdateEntity()
  const { data: entityUsers, isLoading: usersLoading } = useEntityUsers(id)
  const addEntityUser = useAddEntityUser()
  const removeEntityUser = useRemoveEntityUser()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('core.entity.update')

  // Dictionary-driven options (fallback to static if loading)
  const dictCountries = useDictionaryOptions('country')
  const dictLegalForms = useDictionaryOptions('legal_form')
  const dictCurrencies = useDictionaryOptions('currency')
  const countryOpts = dictCountries.length > 0 ? dictCountries : COUNTRY_OPTIONS
  const legalFormOpts = dictLegalForms.length > 0 ? dictLegalForms : LEGAL_FORM_OPTIONS
  const currencyOpts = dictCurrencies.length > 0 ? dictCurrencies : CURRENCY_OPTIONS

  const [tab, setTab] = useState<DetailTab>('general')
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const { data: allUsersData } = useUsers({ page: 1, page_size: 50, search: userSearch || undefined })

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
    { id: 'general', label: 'Général', icon: Building2 },
    { id: 'legal', label: 'Juridique', icon: Scale },
    { id: 'address', label: 'Adresse & Contact', icon: MapPin },
    { id: 'social', label: 'Réseaux & Horaires', icon: Share2 },
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
      {/* Entity header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 flex items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            {entity.logo_url ? (
              <img src={entity.logo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <Building2 size={24} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate">{entity.name}</h3>
            {entity.trade_name && entity.trade_name !== entity.name && (
              <p className="text-xs text-muted-foreground truncate">{entity.trade_name}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs text-muted-foreground">{entity.code}</span>
              <span className={cn('gl-badge text-[9px]', entity.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                {entity.active ? 'Active' : 'Archivée'}
              </span>
              {entity.country && (
                <span className="text-xs text-muted-foreground">
                  {isoToFlag(entity.country)} {countryOpts.find((c) => c.value === entity.country)?.label ?? entity.country}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-border bg-muted/30 px-4 gap-0.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <PanelContentLayout>
        {tab === 'general' && (
          <div className="space-y-5">
            <FormSection title="Identité">
              <InlineEditableRow label="Code" value={entity.code} onSave={(v) => save('code', v)} disabled={!canUpdate} />
              <InlineEditableRow label="Raison sociale" value={entity.name} onSave={(v) => save('name', v)} disabled={!canUpdate} />
              <InlineEditableRow label="Nom commercial" value={entity.trade_name || ''} onSave={(v) => save('trade_name', v || null)} disabled={!canUpdate} />
              <InlineEditableRow label="Secteur d'activité" value={entity.industry || ''} onSave={(v) => save('industry', v || null)} disabled={!canUpdate} />
            </FormSection>

            <FormSection title="Configuration">
              <InlineEditableTags label="Pays" value={entity.country || ''} options={countryOpts} onSave={(v) => save('country', v)} disabled={!canUpdate} />
              <InlineEditableTags label="Fuseau horaire" value={entity.timezone} options={TIMEZONE_OPTIONS} onSave={(v) => save('timezone', v)} disabled={!canUpdate} />
              <InlineEditableTags label="Langue" value={entity.language} options={LANGUAGE_OPTIONS} onSave={(v) => save('language', v)} disabled={!canUpdate} />
              <InlineEditableTags label="Devise" value={entity.currency} options={currencyOpts} onSave={(v) => save('currency', v)} disabled={!canUpdate} />
            </FormSection>

            <SectionHeader>Informations</SectionHeader>
            <div className="space-y-0">
              <ReadOnlyRow label="Utilisateurs" value={<span className="flex items-center gap-1.5 text-sm"><Users size={12} className="text-muted-foreground" />{entity.user_count}</span>} />
              <ReadOnlyRow
                label="Créé le"
                value={
                  <span className="flex items-center gap-1.5 text-sm">
                    <Clock size={12} className="text-muted-foreground" />
                    {entity.created_at ? new Date(entity.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </span>
                }
              />
            </div>

            {entity.notes !== null && entity.notes !== undefined && (
              <FormSection title="Notes">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entity.notes || 'Aucune note'}</p>
              </FormSection>
            )}
          </div>
        )}

        {tab === 'legal' && (
          <div className="space-y-5">
            <FormSection title="Informations juridiques">
              <InlineEditableTags label="Forme juridique" value={entity.legal_form || ''} options={legalFormOpts} onSave={(v) => save('legal_form', v || null)} disabled={!canUpdate} />
              <InlineEditableRow label="N° RCCM / Immatriculation" value={entity.registration_number || ''} onSave={(v) => save('registration_number', v || null)} disabled={!canUpdate} />
              <InlineEditableRow label="N° Contribuable / Tax ID" value={entity.tax_id || ''} onSave={(v) => save('tax_id', v || null)} disabled={!canUpdate} />
              <InlineEditableRow label="N° TVA" value={entity.vat_number || ''} onSave={(v) => save('vat_number', v || null)} disabled={!canUpdate} />
            </FormSection>

            <FormSection title="Financier">
              <InlineEditableRow label="Capital social" value={entity.capital != null ? String(entity.capital) : ''} onSave={(v) => save('capital', v ? Number(v) : null)} disabled={!canUpdate} />
              <InlineEditableTags label="Devise" value={entity.currency} options={currencyOpts} onSave={(v) => save('currency', v)} disabled={!canUpdate} />
              <InlineEditableTags label="Début exercice fiscal" value={String(entity.fiscal_year_start)} options={FISCAL_MONTH_OPTIONS} onSave={(v) => save('fiscal_year_start', Number(v))} disabled={!canUpdate} />
              <InlineEditableRow label="Date de fondation" value={entity.founded_date || ''} onSave={(v) => save('founded_date', v || null)} disabled={!canUpdate} />
            </FormSection>
          </div>
        )}

        {tab === 'address' && (
          <div className="@container space-y-5">
            {/* Adresse siège (champs directs du modèle) */}
            <FormSection title="Adresse du siège">
              <InlineEditableRow label="Adresse ligne 1" value={entity.address_line1 || ''} onSave={(v) => save('address_line1', v || null)} disabled={!canUpdate} />
              <InlineEditableRow label="Adresse ligne 2" value={entity.address_line2 || ''} onSave={(v) => save('address_line2', v || null)} disabled={!canUpdate} />
              <InlineEditableRow label="Ville" value={entity.city || ''} onSave={(v) => save('city', v || null)} disabled={!canUpdate} />
              <InlineEditableRow label="Région / État" value={entity.state || ''} onSave={(v) => save('state', v || null)} disabled={!canUpdate} />
              <InlineEditableRow label="Code postal / BP" value={entity.zip_code || ''} onSave={(v) => save('zip_code', v || null)} disabled={!canUpdate} />
              <InlineEditableTags label="Pays" value={entity.country || ''} options={countryOpts} onSave={(v) => save('country', v)} disabled={!canUpdate} />
            </FormSection>

            {/* Adresses supplémentaires (polymorphique) */}
            <FormSection title="Adresses supplémentaires" collapsible storageKey="panel.entity.sections" id="entity-addresses">
              <AddressManager ownerType="entity" ownerId={id} compact />
            </FormSection>

            {/* Contact principal */}
            <FormSection title="Contact principal">
              <InlineEditableRow label="Téléphone" value={entity.phone || ''} onSave={(v) => save('phone', v || null)} disabled={!canUpdate} type="tel" />
              <InlineEditableRow label="Fax" value={entity.fax || ''} onSave={(v) => save('fax', v || null)} disabled={!canUpdate} type="tel" />
              <InlineEditableRow label="Email" value={entity.email || ''} onSave={(v) => save('email', v || null)} disabled={!canUpdate} type="email" />
              <InlineEditableRow label="Site web" value={entity.website || ''} onSave={(v) => save('website', v || null)} disabled={!canUpdate} />
            </FormSection>

            {/* Téléphones et emails supplémentaires (polymorphiques) */}
            <FormSection title="Téléphones" collapsible storageKey="panel.entity.sections" id="entity-phones">
              <PhoneManager ownerType="entity" ownerId={id} compact />
            </FormSection>

            <FormSection title="Emails" collapsible storageKey="panel.entity.sections" id="entity-emails">
              <ContactEmailManager ownerType="entity" ownerId={id} compact />
            </FormSection>
          </div>
        )}

        {tab === 'social' && (
          <div className="space-y-5">
            <FormSection title="Réseaux sociaux">
              {SOCIAL_KEYS.map((s) => (
                <InlineEditableRow
                  key={s.key}
                  label={s.label}
                  value={(entity.social_networks as Record<string, string> | null)?.[s.key] || ''}
                  onSave={(v) => {
                    const current = (entity.social_networks || {}) as Record<string, string>
                    const updated = { ...current }
                    if (v) updated[s.key] = v
                    else delete updated[s.key]
                    save('social_networks', Object.keys(updated).length > 0 ? updated : null)
                  }}
                  disabled={!canUpdate}
                />
              ))}
            </FormSection>

            <FormSection title="Horaires d'ouverture">
              <div className="space-y-1.5">
                {DAY_KEYS.map((day) => {
                  const hours = (entity.opening_hours as Record<string, { open: string; close: string }> | null)?.[day]
                  return (
                    <div key={day} className="flex items-center gap-3 text-sm">
                      <span className="w-20 text-muted-foreground text-xs">{DAY_LABELS[day]}</span>
                      {hours ? (
                        <span className="text-foreground font-mono text-xs">{hours.open} — {hours.close}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Fermé</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {canUpdate && (
                <p className="text-[10px] text-muted-foreground mt-2 italic">
                  Les horaires peuvent être modifiés via l'API pour le moment.
                </p>
              )}
            </FormSection>
          </div>
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
                    placeholder="Rechercher un utilisateur..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {availableUsers.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground text-center">Aucun utilisateur disponible</p>
                  ) : (
                    availableUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
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

            {usersLoading ? (
              <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
            ) : entityUsers && entityUsers.length > 0 ? (
              <div className="space-y-1">
                {entityUsers.map((user) => (
                  <div key={user.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 group transition-colors">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold shrink-0">
                        {user.first_name[0]}{user.last_name[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground truncate block">{user.first_name} {user.last_name}</span>
                      {user.group_names.length > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate block">{user.group_names.join(', ')}</span>
                      )}
                    </div>
                    <span className={cn('gl-badge text-[9px]', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                      {user.active ? 'Actif' : 'Inactif'}
                    </span>
                    {canUpdate && (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                        title="Retirer l'utilisateur"
                        onClick={() => handleRemoveUser(user.user_id)}
                      >
                        <UserMinus size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">Aucun utilisateur dans cette entité</p>
            )}
          </div>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}


// ── Entities list view ───────────────────────────────────────

function EntitiesListView() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  const { hasPermission } = usePermission()
  const canExport = hasPermission('core.entity.read')

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
      defaultHiddenColumns={['created_at', 'city']}

      selectable

      importExport={canExport ? {
        exportFormats: ['csv', 'xlsx'],
        advancedExport: true,
        filenamePrefix: 'entites',
        exportHeaders: {
          code: 'Code',
          name: 'Nom',
          country: 'Pays',
          city: 'Ville',
          timezone: 'Fuseau horaire',
          user_count: 'Utilisateurs',
          active: 'Statut',
          created_at: 'Créé le',
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

          <PanelContent>
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
