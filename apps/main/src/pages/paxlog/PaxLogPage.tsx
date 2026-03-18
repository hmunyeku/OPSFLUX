/**
 * PaxLog page — PAX management, Avis de Séjour, Credentials, Compliance, Incidents.
 *
 * Static Panel: tab bar + DataTable per tab.
 * Dynamic Panel: create/detail forms with company/user pickers.
 * Each tab manages its own search via DataTable visual query bar.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users,
  Plus,
  Loader2,
  Trash2,
  ClipboardList,
  AlertTriangle,
  FileCheck2,
  Send,
  XCircle,
  CheckCircle2,
  Clock,
  Info,
  User,
  Building2,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  usePaxProfiles,
  usePaxProfile,
  useCreatePaxProfile,
  useUpdatePaxProfile,
  usePaxCredentials,
  useCredentialTypes,
  useAdsList,
  useAds,
  useCreateAds,
  useSubmitAds,
  useCancelAds,
  useAdsPax,
  usePaxIncidents,
  useCreatePaxIncident,
  useResolvePaxIncident,
} from '@/hooks/usePaxlog'
import { useTiers } from '@/hooks/useTiers'
import { useUsers } from '@/hooks/useUsers'
import type {
  PaxProfileSummary,
  AdsSummary,
  PaxIncident,
  PaxCredential,
  CredentialType,
} from '@/services/paxlogService'

// ── Constants ──────────────────────────────────────────────────

const PAX_TYPE_OPTIONS = [
  { value: 'internal', label: 'Interne' },
  { value: 'external', label: 'Externe' },
]

const PAX_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'incomplete', label: 'Incomplet' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'archived', label: 'Archivé' },
]

const ADS_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'submitted', label: 'Soumis' },
  { value: 'approved', label: 'Approuvé' },
  { value: 'rejected', label: 'Rejeté' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'completed', label: 'Terminé' },
  { value: 'cancelled', label: 'Annulé' },
]

const VISIT_CATEGORY_OPTIONS = [
  { value: 'project_work', label: 'Projet' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'visit', label: 'Visite' },
  { value: 'permanent_ops', label: 'Opérations permanentes' },
  { value: 'other', label: 'Autre' },
]

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info', color: 'gl-badge-info' },
  { value: 'warning', label: 'Avertissement', color: 'gl-badge-warning' },
  { value: 'temp_ban', label: 'Ban temporaire', color: 'gl-badge-danger' },
  { value: 'permanent_ban', label: 'Ban permanent', color: 'gl-badge-danger' },
]

const CREDENTIAL_CATEGORY_OPTIONS = [
  { value: 'safety', label: 'Sécurité' },
  { value: 'medical', label: 'Médical' },
  { value: 'technical', label: 'Technique' },
  { value: 'administrative', label: 'Administratif' },
]

const MAIN_TABS = [
  { id: 'profiles' as const, label: 'Profils PAX', icon: Users },
  { id: 'ads' as const, label: 'Avis de Séjour', icon: ClipboardList },
  { id: 'credentials' as const, label: 'Certifications', icon: FileCheck2 },
  { id: 'incidents' as const, label: 'Incidents', icon: AlertTriangle },
]

type MainTabId = (typeof MAIN_TABS)[number]['id']

// ── Helpers ────────────────────────────────────────────────────

function StatusBadge({ status, className }: { status: string; className?: string }) {
  const colorMap: Record<string, string> = {
    active: 'gl-badge-success', draft: 'gl-badge-neutral', submitted: 'gl-badge-info',
    approved: 'gl-badge-success', rejected: 'gl-badge-danger', in_progress: 'gl-badge-warning',
    completed: 'gl-badge-success', cancelled: 'gl-badge-neutral', incomplete: 'gl-badge-warning',
    suspended: 'gl-badge-danger', archived: 'gl-badge-neutral', valid: 'gl-badge-success',
    expired: 'gl-badge-danger', pending_validation: 'gl-badge-warning',
  }
  return <span className={cn('gl-badge', colorMap[status] || 'gl-badge-neutral', className)}>{status.replace(/_/g, ' ')}</span>
}

function SeverityBadge({ severity }: { severity: string }) {
  const opt = SEVERITY_OPTIONS.find((o) => o.value === severity)
  return <span className={cn('gl-badge', opt?.color || 'gl-badge-neutral')}>{opt?.label || severity}</span>
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function CompletenessBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{value}%</span>
    </div>
  )
}

// ── Searchable Picker (reused for company & user selection) ───

function SearchablePicker<T extends { id: string }>({
  label,
  icon,
  items,
  isLoading,
  searchValue,
  onSearchChange,
  renderItem,
  selectedId,
  onSelect,
  onClear,
  placeholder,
}: {
  label: string
  icon: React.ReactNode
  items: T[]
  isLoading: boolean
  searchValue: string
  onSearchChange: (v: string) => void
  renderItem: (item: T) => React.ReactNode
  selectedId: string | null
  onSelect: (item: T) => void
  onClear: () => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const selected = selectedId ? items.find((i) => i.id === selectedId) : null

  return (
    <DynamicPanelField label={label}>
      {selected ? (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-muted/30">
          {icon}
          <span className="text-xs font-medium flex-1 truncate">{renderItem(selected)}</span>
          <button onClick={() => { onClear(); setOpen(false) }} className="text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => { onSearchChange(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              className={cn(panelInputClass, 'pl-7')}
              placeholder={placeholder}
            />
          </div>
          {open && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
              {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Chargement...</div>}
              {!isLoading && items.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">Aucun résultat</div>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => { onSelect(item); setOpen(false) }}
                >
                  {renderItem(item)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </DynamicPanelField>
  )
}

// ── Create PAX Profile Panel ──────────────────────────────────

function CreateProfilePanel() {
  const { t } = useTranslation()
  const createProfile = useCreatePaxProfile()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const [form, setForm] = useState({
    type: 'external' as 'internal' | 'external',
    first_name: '',
    last_name: '',
    birth_date: null as string | null,
    nationality: null as string | null,
    badge_number: null as string | null,
    company_id: null as string | null,
    user_id: null as string | null,
  })

  // Company search (for external PAX)
  const [companySearch, setCompanySearch] = useState('')
  const { data: tiersData, isLoading: tiersLoading } = useTiers({
    page: 1, page_size: 20, search: companySearch || undefined,
  })

  // User search (for internal PAX)
  const [userSearch, setUserSearch] = useState('')
  const { data: usersData, isLoading: usersLoading } = useUsers({
    page: 1, page_size: 20, search: userSearch || undefined,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createProfile.mutateAsync({
      type: form.type,
      first_name: form.first_name,
      last_name: form.last_name,
      birth_date: form.birth_date || undefined,
      nationality: form.nationality || undefined,
      badge_number: form.badge_number || undefined,
      company_id: form.type === 'external' ? form.company_id || undefined : undefined,
      user_id: form.type === 'internal' ? form.user_id || undefined : undefined,
    })
    closeDynamicPanel()
  }

  // Auto-fill from user when selecting internal user
  const handleUserSelect = (user: { id: string; first_name: string; last_name: string; email: string }) => {
    setForm({
      ...form,
      user_id: user.id,
      first_name: form.first_name || user.first_name,
      last_name: form.last_name || user.last_name,
    })
  }

  return (
    <DynamicPanelShell
      title="Nouveau profil PAX"
      subtitle="PaxLog"
      icon={<Users size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createProfile.isPending}
            onClick={() => (document.getElementById('create-profile-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createProfile.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-profile-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title="Type de profil">
          <TagSelector
            options={PAX_TYPE_OPTIONS}
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as 'internal' | 'external', company_id: null, user_id: null })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {form.type === 'internal'
              ? 'Personnel Perenco — lié à un compte utilisateur'
              : 'Sous-traitant / visiteur — lié à une entreprise (tier)'}
          </p>
        </FormSection>

        {/* Company picker (external) */}
        {form.type === 'external' && (
          <FormSection title="Entreprise">
            <SearchablePicker
              label="Entreprise (tier)"
              icon={<Building2 size={12} className="text-muted-foreground" />}
              items={tiersData?.items || []}
              isLoading={tiersLoading}
              searchValue={companySearch}
              onSearchChange={setCompanySearch}
              renderItem={(tier) => <><span className="font-semibold">{tier.code}</span> — {tier.name}</>}
              selectedId={form.company_id}
              onSelect={(tier) => setForm({ ...form, company_id: tier.id })}
              onClear={() => setForm({ ...form, company_id: null })}
              placeholder="Rechercher une entreprise..."
            />
          </FormSection>
        )}

        {/* User picker (internal) */}
        {form.type === 'internal' && (
          <FormSection title="Compte utilisateur">
            <SearchablePicker
              label="Utilisateur Perenco"
              icon={<User size={12} className="text-muted-foreground" />}
              items={usersData?.items || []}
              isLoading={usersLoading}
              searchValue={userSearch}
              onSearchChange={setUserSearch}
              renderItem={(u) => <>{u.first_name} {u.last_name} <span className="text-muted-foreground">({u.email})</span></>}
              selectedId={form.user_id}
              onSelect={handleUserSelect}
              onClear={() => setForm({ ...form, user_id: null })}
              placeholder="Rechercher un utilisateur..."
            />
          </FormSection>
        )}

        <FormSection title="Identité">
          <FormGrid>
            <DynamicPanelField label="Prénom" required>
              <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Nom" required>
              <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title="Informations complémentaires">
          <FormGrid>
            <DynamicPanelField label="Date de naissance">
              <input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Nationalité">
              <input type="text" value={form.nationality || ''} onChange={(e) => setForm({ ...form, nationality: e.target.value || null })} className={panelInputClass} placeholder="CM, FR..." />
            </DynamicPanelField>
            <DynamicPanelField label="N° badge">
              <input type="text" value={form.badge_number || ''} onChange={(e) => setForm({ ...form, badge_number: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}

// ── PAX Profile Detail Panel ──────────────────────────────────

function ProfileDetailPanel({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: profile, isLoading } = usePaxProfile(id)
  const updateProfile = useUpdatePaxProfile()
  const { data: credentials } = usePaxCredentials(id)
  const { data: credentialTypes } = useCredentialTypes()

  const handleSave = useCallback((field: string, value: string) => {
    updateProfile.mutate({ id, payload: { [field]: value } })
  }, [id, updateProfile])

  const credTypeMap = useMemo(() => {
    const m: Record<string, CredentialType> = {}
    credentialTypes?.forEach((ct) => { m[ct.id] = ct })
    return m
  }, [credentialTypes])

  if (isLoading || !profile) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={`${profile.first_name} ${profile.last_name}`}
      subtitle={profile.badge_number || profile.type}
      icon={<User size={14} className="text-primary" />}
      actions={
        <DangerConfirmButton
          icon={<Trash2 size={12} />}
          onConfirm={() => { updateProfile.mutate({ id, payload: { status: 'archived' } }); closeDynamicPanel() }}
          confirmLabel="Archiver ?"
        >
          Archiver
        </DangerConfirmButton>
      }
    >
      <div className="p-4 space-y-5">
        {/* Status + type badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={profile.status} />
          <span className={cn('gl-badge', profile.type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
            {profile.type === 'internal' ? 'Interne' : 'Externe'}
          </span>
          <CompletenessBar value={profile.profile_completeness} />
        </div>

        {/* Company / User link */}
        {profile.company_name && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <Building2 size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{profile.company_name}</p>
              <p className="text-[10px] text-muted-foreground">Entreprise liée</p>
            </div>
          </div>
        )}
        {profile.user_email && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <User size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{profile.user_email}</p>
              <p className="text-[10px] text-muted-foreground">Compte utilisateur lié</p>
            </div>
          </div>
        )}

        <FormSection title="Identité">
          <InlineEditableRow label="Prénom" value={profile.first_name} onSave={(v) => handleSave('first_name', v)} />
          <InlineEditableRow label="Nom" value={profile.last_name} onSave={(v) => handleSave('last_name', v)} />
          <ReadOnlyRow label="Date de naissance" value={formatDate(profile.birth_date)} />
          <InlineEditableRow label="Nationalité" value={profile.nationality || ''} onSave={(v) => handleSave('nationality', v)} />
          <InlineEditableRow label="N° badge" value={profile.badge_number || ''} onSave={(v) => handleSave('badge_number', v)} />
        </FormSection>

        {profile.synced_from_intranet && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs">
            <Info size={12} /> Profil synchronisé depuis l'intranet — édition limitée
          </div>
        )}

        {/* Credentials */}
        <FormSection title={`Certifications (${credentials?.length || 0})`}>
          {!credentials || credentials.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">Aucune certification enregistrée.</p>
          ) : (
            <div className="space-y-1">
              {credentials.map((cred: PaxCredential) => (
                <div key={cred.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent/50 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{credTypeMap[cred.credential_type_id]?.name || 'Certification'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Obtenu : {formatDate(cred.obtained_date)}
                      {cred.expiry_date && ` — Expire : ${formatDate(cred.expiry_date)}`}
                    </p>
                  </div>
                  <StatusBadge status={cred.status} />
                </div>
              ))}
            </div>
          )}
        </FormSection>

        <ReadOnlyRow label="Créé le" value={formatDate(profile.created_at)} />
      </div>
    </DynamicPanelShell>
  )
}

// ── Create AdS Panel ──────────────────────────────────────────

function CreateAdsPanel() {
  const { t } = useTranslation()
  const createAds = useCreateAds()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const [form, setForm] = useState<{
    type: 'individual' | 'team'
    site_entry_asset_id: string
    visit_purpose: string
    visit_category: string
    start_date: string
    end_date: string
  }>({
    type: 'individual',
    site_entry_asset_id: '',
    visit_purpose: '',
    visit_category: 'project_work',
    start_date: '',
    end_date: '',
  })

  // TODO: Replace with asset picker when Asset module hooks are available
  // For now we use a text input — the backend validates the UUID

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createAds.mutateAsync(form)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title="Nouvel Avis de Séjour"
      subtitle="PaxLog"
      icon={<ClipboardList size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createAds.isPending}
            onClick={() => (document.getElementById('create-ads-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createAds.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-ads-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title="Type">
          <TagSelector
            options={[{ value: 'individual', label: 'Individuel' }, { value: 'team', label: 'Équipe' }]}
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as 'individual' | 'team' })}
          />
        </FormSection>

        <FormSection title="Destination">
          <DynamicPanelField label="Site d'entrée" required>
            <input
              type="text"
              required
              value={form.site_entry_asset_id}
              onChange={(e) => setForm({ ...form, site_entry_asset_id: e.target.value })}
              className={panelInputClass}
              placeholder="Sélectionner un site (asset)"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              UUID du site d'entrée issu du référentiel Assets
            </p>
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Détails de la visite">
          <DynamicPanelField label="Catégorie" required>
            <select value={form.visit_category} onChange={(e) => setForm({ ...form, visit_category: e.target.value })} className={panelInputClass}>
              {VISIT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </DynamicPanelField>
          <DynamicPanelField label="Objet de la visite" required>
            <textarea required value={form.visit_purpose} onChange={(e) => setForm({ ...form, visit_purpose: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder="Décrire l'objet de la visite..." />
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Dates">
          <FormGrid>
            <DynamicPanelField label="Date début" required>
              <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Date fin" required>
              <input type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <p className="text-xs text-muted-foreground italic">
          Les passagers et imputations peuvent être ajoutés après la création, via le panneau de détail.
        </p>
      </form>
    </DynamicPanelShell>
  )
}

// ── AdS Detail Panel ──────────────────────────────────────────

function AdsDetailPanel({ id }: { id: string }) {
  const { data: ads, isLoading } = useAds(id)
  const { data: adsPax } = useAdsPax(id)
  const submitAds = useSubmitAds()
  const cancelAds = useCancelAds()

  if (isLoading || !ads) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<ClipboardList size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const canSubmit = ads.status === 'draft'
  const canCancel = !['cancelled', 'completed', 'rejected'].includes(ads.status)

  return (
    <DynamicPanelShell
      title={ads.reference}
      subtitle={`AdS — ${VISIT_CATEGORY_OPTIONS.find((o) => o.value === ads.visit_category)?.label || ads.visit_category}`}
      icon={<ClipboardList size={14} className="text-primary" />}
      actions={
        <div className="flex items-center gap-1">
          {canSubmit && (
            <PanelActionButton variant="primary" disabled={submitAds.isPending} onClick={() => submitAds.mutate(id)}>
              <Send size={12} /> Soumettre
            </PanelActionButton>
          )}
          {canCancel && (
            <DangerConfirmButton
              icon={<XCircle size={12} />}
              onConfirm={() => cancelAds.mutate(id)}
              confirmLabel="Annuler ?"
            >
              Annuler
            </DangerConfirmButton>
          )}
        </div>
      }
    >
      <div className="p-4 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={ads.status} />
          <span className={cn('gl-badge', ads.type === 'team' ? 'gl-badge-info' : 'gl-badge-neutral')}>
            {ads.type === 'individual' ? 'Individuel' : 'Équipe'}
          </span>
          {ads.cross_company_flag && <span className="gl-badge gl-badge-warning">Cross-company</span>}
        </div>

        <FormSection title="Visite">
          <ReadOnlyRow label="Objet" value={ads.visit_purpose} />
          <ReadOnlyRow label="Catégorie" value={VISIT_CATEGORY_OPTIONS.find((o) => o.value === ads.visit_category)?.label || ads.visit_category} />
          <ReadOnlyRow label="Dates" value={`${formatDate(ads.start_date)} → ${formatDate(ads.end_date)}`} />
        </FormSection>

        {ads.outbound_transport_mode && (
          <FormSection title="Transport">
            <ReadOnlyRow label="Aller" value={ads.outbound_transport_mode} />
            {ads.return_transport_mode && <ReadOnlyRow label="Retour" value={ads.return_transport_mode} />}
          </FormSection>
        )}

        {/* PAX list with names */}
        <FormSection title={`Passagers (${adsPax?.length || 0})`}>
          {!adsPax || adsPax.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">Aucun passager. Ajoutez des PAX pour pouvoir soumettre l'AdS.</p>
          ) : (
            <div className="space-y-1">
              {adsPax.map((ap: Record<string, unknown>) => (
                <div key={ap.id as string} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent/50 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {ap.pax_last_name as string} {ap.pax_first_name as string}
                    </p>
                    {ap.pax_badge && <p className="text-[10px] text-muted-foreground">Badge: {ap.pax_badge as string}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('gl-badge', (ap.pax_type as string) === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
                      {(ap.pax_type as string) === 'internal' ? 'Int.' : 'Ext.'}
                    </span>
                    <StatusBadge status={ap.status as string} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>

        <div className="space-y-1">
          {ads.submitted_at && <ReadOnlyRow label="Soumis le" value={formatDate(ads.submitted_at)} />}
          {ads.approved_at && <ReadOnlyRow label="Approuvé le" value={formatDate(ads.approved_at)} />}
          {ads.rejected_at && <ReadOnlyRow label="Rejeté le" value={formatDate(ads.rejected_at)} />}
          {ads.rejection_reason && <ReadOnlyRow label="Motif de rejet" value={ads.rejection_reason} />}
          <ReadOnlyRow label="Créé le" value={formatDate(ads.created_at)} />
        </div>
      </div>
    </DynamicPanelShell>
  )
}

// ── Create Incident Panel ─────────────────────────────────────

function CreateIncidentPanel() {
  const { t } = useTranslation()
  const createIncident = useCreatePaxIncident()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // PAX search for linking incident
  const [paxSearch, setPaxSearch] = useState('')
  const { data: paxData, isLoading: paxLoading } = usePaxProfiles({ page: 1, page_size: 20, search: paxSearch || undefined })

  const [form, setForm] = useState<{
    severity: 'info' | 'warning' | 'temp_ban' | 'permanent_ban'
    description: string
    incident_date: string
    pax_id: string | null
    pax_display: string | null
    ban_start_date: string | null
    ban_end_date: string | null
  }>({
    severity: 'warning',
    description: '',
    incident_date: new Date().toISOString().split('T')[0],
    pax_id: null,
    pax_display: null,
    ban_start_date: null,
    ban_end_date: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createIncident.mutateAsync({
      severity: form.severity,
      description: form.description,
      incident_date: form.incident_date,
      pax_id: form.pax_id || null,
      ban_start_date: form.ban_start_date || null,
      ban_end_date: form.ban_end_date || null,
    })
    closeDynamicPanel()
  }

  const showBanDates = form.severity === 'temp_ban' || form.severity === 'permanent_ban'

  return (
    <DynamicPanelShell
      title="Nouvel incident"
      subtitle="PaxLog — Incidents"
      icon={<AlertTriangle size={14} className="text-destructive" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createIncident.isPending}
            onClick={() => (document.getElementById('create-incident-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createIncident.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-incident-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title="Sévérité">
          <TagSelector
            options={SEVERITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={form.severity}
            onChange={(v) => setForm({ ...form, severity: v as typeof form.severity })}
          />
        </FormSection>

        <FormSection title="PAX concerné">
          <SearchablePicker
            label="Profil PAX"
            icon={<User size={12} className="text-muted-foreground" />}
            items={paxData?.items || []}
            isLoading={paxLoading}
            searchValue={paxSearch}
            onSearchChange={setPaxSearch}
            renderItem={(p) => <>{p.last_name} {p.first_name} {p.company_name ? <span className="text-muted-foreground">— {p.company_name}</span> : ''}</>}
            selectedId={form.pax_id}
            onSelect={(p) => setForm({ ...form, pax_id: p.id, pax_display: `${p.last_name} ${p.first_name}` })}
            onClear={() => setForm({ ...form, pax_id: null, pax_display: null })}
            placeholder="Rechercher un PAX..."
          />
        </FormSection>

        <FormSection title="Détails">
          <DynamicPanelField label="Date de l'incident" required>
            <input type="date" required value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
          <DynamicPanelField label="Description" required>
            <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(panelInputClass, 'min-h-[80px] resize-y')} placeholder="Décrire l'incident..." />
          </DynamicPanelField>
        </FormSection>

        {showBanDates && (
          <FormSection title="Période de ban">
            <FormGrid>
              <DynamicPanelField label="Début du ban">
                <input type="date" value={form.ban_start_date || ''} onChange={(e) => setForm({ ...form, ban_start_date: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              {form.severity === 'temp_ban' && (
                <DynamicPanelField label="Fin du ban">
                  <input type="date" value={form.ban_end_date || ''} onChange={(e) => setForm({ ...form, ban_end_date: e.target.value || null })} className={panelInputClass} />
                </DynamicPanelField>
              )}
            </FormGrid>
          </FormSection>
        )}
      </form>
    </DynamicPanelShell>
  )
}

// ── Profiles Tab ──────────────────────────────────────────────

function ProfilesTab({ openDetail }: { openDetail: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const { data, isLoading } = usePaxProfiles({
    page, page_size: 25,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  })

  const profileColumns = useMemo<ColumnDef<PaxProfileSummary, unknown>[]>(() => [
    {
      id: 'name',
      header: 'Nom',
      accessorFn: (row) => `${row.last_name} ${row.first_name}`,
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.last_name} {row.original.first_name}</span>,
    },
    {
      accessorKey: 'company_name',
      header: 'Entreprise',
      cell: ({ row }) => row.original.company_name ? (
        <span className="flex items-center gap-1 text-muted-foreground text-xs"><Building2 size={11} /> {row.original.company_name}</span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
          {row.original.type === 'internal' ? 'Interne' : 'Externe'}
        </span>
      ),
      size: 80,
    },
    {
      accessorKey: 'badge_number',
      header: 'Badge',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.badge_number || '—'}</span>,
    },
    {
      accessorKey: 'profile_completeness',
      header: 'Complétude',
      cell: ({ row }) => <CompletenessBar value={row.original.profile_completeness} />,
      size: 120,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      size: 90,
    },
  ], [])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {PAX_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-border" />
          {PAX_TYPE_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setTypeFilter(typeFilter === opt.value ? '' : opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', typeFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{data.total} profils</span>}
      </div>

      <PanelContent>
        <DataTable<PaxProfileSummary>
          columns={profileColumns}
          data={data?.items ?? []}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize: 25, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par nom, badge…"
          onRowClick={(row) => openDetail(row.id)}
          emptyIcon={Users}
          emptyTitle="Aucun profil PAX"
          storageKey="paxlog-profiles"
        />
      </PanelContent>
    </>
  )
}

// ── AdS Tab ───────────────────────────────────────────────────

function AdsTab({ openDetail }: { openDetail: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useAdsList({ page, page_size: 25, status: statusFilter || undefined })

  const filtered = useMemo(() => {
    if (!data?.items || !search) return data?.items || []
    const q = search.toLowerCase()
    return data.items.filter((a: AdsSummary) => a.reference.toLowerCase().includes(q) || a.visit_category.toLowerCase().includes(q))
  }, [data?.items, search])

  const adsColumns = useMemo<ColumnDef<AdsSummary, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => <span className="font-medium text-foreground font-mono text-xs">{row.original.reference}</span>,
    },
    {
      accessorKey: 'visit_category',
      header: 'Catégorie',
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral">
          {VISIT_CATEGORY_OPTIONS.find((o) => o.value === row.original.visit_category)?.label || row.original.visit_category}
        </span>
      ),
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{formatDate(row.original.start_date)} → {formatDate(row.original.end_date)}</span>,
    },
    {
      accessorKey: 'pax_count',
      header: 'PAX',
      cell: ({ row }) => <span className="inline-flex items-center gap-1 text-xs"><Users size={11} className="text-muted-foreground" /> {row.original.pax_count}</span>,
      size: 60,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      size: 90,
    },
  ], [])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {ADS_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{data.total} avis</span>}
      </div>

      <PanelContent>
        <DataTable<AdsSummary>
          columns={adsColumns}
          data={filtered}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize: 25, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par référence, catégorie…"
          onRowClick={(row) => openDetail(row.id)}
          emptyIcon={ClipboardList}
          emptyTitle="Aucun avis de séjour"
          storageKey="paxlog-ads"
        />
      </PanelContent>
    </>
  )
}

// ── Credentials Tab ───────────────────────────────────────────

function CredentialsTab() {
  const { data: credentialTypes, isLoading } = useCredentialTypes()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const filtered = useMemo(() => {
    if (!credentialTypes) return []
    let list = credentialTypes
    if (categoryFilter) list = list.filter((ct: CredentialType) => ct.category === categoryFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((ct: CredentialType) => ct.name.toLowerCase().includes(q) || ct.code.toLowerCase().includes(q))
    }
    return list
  }, [credentialTypes, categoryFilter, search])

  const credentialColumns = useMemo<ColumnDef<CredentialType, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Nom',
      cell: ({ row }) => <span className="text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'category',
      header: 'Catégorie',
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral">
          {CREDENTIAL_CATEGORY_OPTIONS.find((o) => o.value === row.original.category)?.label || row.original.category}
        </span>
      ),
    },
    {
      id: 'validity',
      header: 'Validité',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {row.original.has_expiry ? (row.original.validity_months ? `${row.original.validity_months} mois` : 'Oui') : 'Non'}
        </span>
      ),
    },
    {
      id: 'proof',
      header: 'Preuve',
      cell: ({ row }) => row.original.proof_required
        ? <CheckCircle2 size={14} className="text-green-600" />
        : <span className="text-muted-foreground text-xs">Non</span>,
      size: 60,
    },
  ], [])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setCategoryFilter('')}
            className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', !categoryFilter ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>Tous</button>
          {CREDENTIAL_CATEGORY_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setCategoryFilter(opt.value)}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', categoryFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>{opt.label}</button>
          ))}
        </div>
        {credentialTypes && <span className="text-xs text-muted-foreground ml-auto">{filtered.length} types</span>}
      </div>

      <PanelContent>
        <DataTable<CredentialType>
          columns={credentialColumns}
          data={filtered}
          isLoading={isLoading}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher par code, nom…"
          emptyIcon={FileCheck2}
          emptyTitle="Aucun type de certification"
          storageKey="paxlog-credentials"
        />
      </PanelContent>
    </>
  )
}

// ── Incidents Tab ─────────────────────────────────────────────

function IncidentsTab() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const resolveIncident = useResolvePaxIncident()

  const { data, isLoading } = usePaxIncidents({ page, page_size: 25, active_only: activeOnly })

  const filtered = useMemo(() => {
    if (!data?.items || !search) return data?.items || []
    const q = search.toLowerCase()
    return data.items.filter((i: PaxIncident) => i.description.toLowerCase().includes(q))
  }, [data?.items, search])

  const incidentColumns = useMemo<ColumnDef<PaxIncident, unknown>[]>(() => [
    {
      accessorKey: 'incident_date',
      header: 'Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(row.original.incident_date)}</span>,
    },
    {
      accessorKey: 'severity',
      header: 'Sévérité',
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      size: 100,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-foreground max-w-[250px] truncate block">{row.original.description}</span>,
    },
    {
      id: 'ban',
      header: 'Ban',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.ban_start_date
            ? `${formatDate(row.original.ban_start_date)}${row.original.ban_end_date ? ` → ${formatDate(row.original.ban_end_date)}` : ' → ∞'}`
            : '—'}
        </span>
      ),
    },
    {
      id: 'resolved',
      header: 'Résolu',
      cell: ({ row }) => row.original.resolved_at
        ? <CheckCircle2 size={14} className="text-green-600" />
        : <Clock size={14} className="text-amber-500" />,
      size: 60,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => !row.original.resolved_at ? (
        <button
          className="gl-button-sm gl-button-default text-xs"
          onClick={(e) => { e.stopPropagation(); resolveIncident.mutate({ id: row.original.id, payload: {} }) }}
          disabled={resolveIncident.isPending}
        >
          Résoudre
        </button>
      ) : null,
      size: 80,
    },
  ], [resolveIncident])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <button onClick={() => setActiveOnly(!activeOnly)}
          className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', activeOnly ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          Actifs uniquement
        </button>
        {data && <span className="text-xs text-muted-foreground ml-auto">{data.total} incidents</span>}
      </div>

      <PanelContent>
        <DataTable<PaxIncident>
          columns={incidentColumns}
          data={filtered}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize: 25, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par description…"
          emptyIcon={AlertTriangle}
          emptyTitle="Aucun incident"
          storageKey="paxlog-incidents"
        />
      </PanelContent>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export function PaxLogPage() {
  const [activeTab, setActiveTab] = useState<MainTabId>('profiles')
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'paxlog'

  const handleCreate = useCallback(() => {
    if (activeTab === 'profiles') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'profile' } })
    else if (activeTab === 'ads') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'ads' } })
    else if (activeTab === 'incidents') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'incident' } })
  }, [activeTab, openDynamicPanel])

  const handleOpenDetail = useCallback((id: string) => {
    if (activeTab === 'profiles') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'profile' } })
    else if (activeTab === 'ads') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'ads' } })
  }, [activeTab, openDynamicPanel])

  const createLabel = activeTab === 'profiles' ? 'Nouveau profil' : activeTab === 'ads' ? 'Nouvel AdS' : activeTab === 'incidents' ? 'Nouvel incident' : ''
  const showCreate = ['profiles', 'ads', 'incidents'].includes(activeTab)

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Users} title="PaxLog" subtitle="Gestion des passagers et avis de séjour">
            {showCreate && <ToolbarButton icon={Plus} label={createLabel} variant="primary" onClick={handleCreate} />}
          </PanelHeader>

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border px-3.5 h-9 shrink-0">
            {MAIN_TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeTab === tab.id ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}>
                  <Icon size={12} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {activeTab === 'profiles' && <ProfilesTab openDetail={handleOpenDetail} />}
          {activeTab === 'ads' && <AdsTab openDetail={handleOpenDetail} />}
          {activeTab === 'credentials' && <CredentialsTab />}
          {activeTab === 'incidents' && <IncidentsTab />}
        </div>
      )}

      {/* Dynamic panels */}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'profile' && <CreateProfilePanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'ads' && <CreateAdsPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'incident' && <CreateIncidentPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'profile' && <ProfileDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'ads' && <AdsDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// ── Panel renderer registration ───────────────────────────────
registerPanelRenderer('paxlog', (view) => {
  if (view.type === 'create') {
    if (view.meta?.subtype === 'profile') return <CreateProfilePanel />
    if (view.meta?.subtype === 'ads') return <CreateAdsPanel />
    if (view.meta?.subtype === 'incident') return <CreateIncidentPanel />
  }
  if (view.type === 'detail' && 'id' in view) {
    if (view.meta?.subtype === 'profile') return <ProfileDetailPanel id={view.id} />
    if (view.meta?.subtype === 'ads') return <AdsDetailPanel id={view.id} />
  }
  return null
})
