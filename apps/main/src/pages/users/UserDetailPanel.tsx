/**
 * UserDetailPanel + its helpers (SubSectionLabel, PPESizeRow).
 *
 * Extracted from UsersPage.tsx to keep the main page file reviewable
 * (this component alone is ~800 lines of form, tabs and inline edits).
 * Re-exports UserDetailTab so TypeScript consumers can reuse the
 * tab union type if they need it later.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users, Loader2,
  UserCheck, UserX, Calendar, Clock,
  Shield, KeyRound, LogOut,
  Building2, Trash2, X,
  ShieldCheck, Lock, Unlock, AlertTriangle, Globe,
  Phone, Mail, MapPin, MessageSquare, Paperclip, Camera, Upload, Link2,
  FileText, Stamp, Heart, CreditCard, Syringe, Languages, Car, Stethoscope,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import {
  DynamicPanelShell,
  FormSection,
  SectionColumns,
  InlineEditableRow,
  InlineEditableTags,
  InlineEditableCombobox,
  ReadOnlyRow,
  SectionHeader,
  DetailFieldGrid,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import {
  useUser, useUpdateUser, useDeleteUser, useRevokeAllSessions,
  useUserEntities, useSendPasswordReset, useProfileCompleteness,
  useUserTierLinks,
  useAdminUploadAvatar, useAdminSetAvatarFromURL,
} from '@/hooks/useUsers'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { usePhones, useContactEmails, useAddresses, useNotes, useAttachments } from '@/hooks/useSettings'
import { useSSOProviders, useDeleteSSOProvider, useUserIPLocation } from '@/hooks/useUserSubModels'
import { useTierContact } from '@/hooks/useTiers'
import { AddressManager } from '@/components/shared/AddressManager'
import { PhoneManager } from '@/components/shared/PhoneManager'
import { ContactEmailManager } from '@/components/shared/ContactEmailManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { PassportManager } from '@/components/shared/PassportManager'
import { VisaManager } from '@/components/shared/VisaManager'
import { EmergencyContactManager } from '@/components/shared/EmergencyContactManager'
import { SocialSecurityManager } from '@/components/shared/SocialSecurityManager'
import { VaccineManager } from '@/components/shared/VaccineManager'
import { UserLanguageManager } from '@/components/shared/UserLanguageManager'
import { DrivingLicenseManager } from '@/components/shared/DrivingLicenseManager'
import { MedicalCheckManager } from '@/components/shared/MedicalCheckManager'
import { HealthConditionsChecklist } from '@/components/shared/HealthConditionsChecklist'
import { ExternalRefManager } from '@/components/shared/ExternalRefManager'
import { ReferentielManager } from '@/components/shared/ReferentielManager'
import { useJobPositions } from '@/hooks/useConformite'
import { useDictionaryOptions, useDictionaryColumnOptions } from '@/hooks/useDictionary'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { TabBar } from '@/components/ui/Tabs'
import { relativeTime, getAvatarColor } from '@/components/ui/DataTable/utils'

// Auth-type display labels (moved here from UsersPage when the panel
// was extracted — only this component uses them).
const AUTH_TYPE_LABELS: Record<string, string> = {
  email_password: 'Email / Mot de passe',
  sso: 'SSO',
  both: 'Email + SSO',
}
import { UserEntitiesTab } from './UserEntitiesTab'
import { UserJournalTab, UserPermissionsTab } from './UserInnerTabs'

// ── Sub-section label (reused from TiersPage pattern) ──────
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

// ── PPE Size Row with info chart popover ────────────────────

const CLOTHING_SIZE_CHART = [
  { label: 'XS', eu: '44', us: '34', uk: '34', cm: '84-88' },
  { label: 'S', eu: '46', us: '36', uk: '36', cm: '88-92' },
  { label: 'M', eu: '48', us: '38', uk: '38', cm: '92-96' },
  { label: 'L', eu: '50', us: '40', uk: '40', cm: '96-100' },
  { label: 'XL', eu: '52', us: '42', uk: '42', cm: '100-104' },
  { label: 'XXL', eu: '54', us: '44', uk: '44', cm: '104-108' },
  { label: '3XL', eu: '56', us: '46', uk: '46', cm: '108-112' },
]

const SHOE_SIZE_CHART = [
  { eu: '38', us: '5.5', uk: '5', cm: '24' },
  { eu: '39', us: '6.5', uk: '5.5', cm: '24.5' },
  { eu: '40', us: '7', uk: '6', cm: '25.5' },
  { eu: '41', us: '8', uk: '7', cm: '26' },
  { eu: '42', us: '9', uk: '8', cm: '26.5' },
  { eu: '43', us: '9.5', uk: '8.5', cm: '27.5' },
  { eu: '44', us: '10.5', uk: '9.5', cm: '28' },
  { eu: '45', us: '11', uk: '10', cm: '29' },
  { eu: '46', us: '12', uk: '11', cm: '29.5' },
  { eu: '47', us: '13', uk: '12', cm: '30.5' },
]

function PPESizeRow({ label, value, onSave, chartType }: { label: string; value: string; onSave: (v: string) => void; chartType: 'clothing' | 'shoe' }) {
  const [showChart, setShowChart] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!showChart) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setShowChart(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showChart])

  return (
    <div className="flex items-center gap-1">
      <div className="flex-1">
        <InlineEditableRow label={label} value={value} onSave={onSave} />
      </div>
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setShowChart(!showChart)}
          className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground text-[9px] font-bold transition-colors shrink-0"
          title="Tableau de correspondance des tailles"
        >
          i
        </button>
        {showChart && (
          <div className="absolute right-0 bottom-6 z-50 w-64 rounded-lg border border-border bg-popover shadow-lg p-2.5 text-[10px]">
            <div className="font-semibold text-foreground mb-1.5">
              {chartType === 'clothing' ? 'Correspondance tailles vêtements' : 'Correspondance pointures'}
            </div>
            <table className="w-full text-center">
              <thead>
                <tr className="text-muted-foreground border-b border-border/50">
                  {chartType === 'clothing' && <th className="pb-1 px-1">Taille</th>}
                  <th className="pb-1 px-1">EU</th>
                  <th className="pb-1 px-1">US</th>
                  <th className="pb-1 px-1">UK</th>
                  <th className="pb-1 px-1">cm</th>
                </tr>
              </thead>
              <tbody>
                {chartType === 'clothing'
                  ? CLOTHING_SIZE_CHART.map((r) => (
                      <tr key={r.label} className="border-b border-border/30 last:border-0">
                        <td className="py-0.5 px-1 font-semibold text-foreground">{r.label}</td>
                        <td className="py-0.5 px-1">{r.eu}</td>
                        <td className="py-0.5 px-1">{r.us}</td>
                        <td className="py-0.5 px-1">{r.uk}</td>
                        <td className="py-0.5 px-1">{r.cm}</td>
                      </tr>
                    ))
                  : SHOE_SIZE_CHART.map((r) => (
                      <tr key={r.eu} className="border-b border-border/30 last:border-0">
                        <td className="py-0.5 px-1 font-semibold text-foreground">{r.eu}</td>
                        <td className="py-0.5 px-1">{r.us}</td>
                        <td className="py-0.5 px-1">{r.uk}</td>
                        <td className="py-0.5 px-1">{r.cm}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── User Detail Panel (with inline editing) ─────────────────
type UserDetailTab = 'fiche' | 'entities' | 'securite' | 'journal' | 'permissions'

export function UserDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: user } = useUser(id)
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const revokeAllSessions = useRevokeAllSessions()
  const sendPasswordReset = useSendPasswordReset()
  const { toast } = useToast()
  const uploadAvatar = useAdminUploadAvatar()
  const setAvatarFromURL = useAdminSetAvatarFromURL()
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const { data: userEntities } = useUserEntities(id)
  const { data: userTierLinks } = useUserTierLinks(id)

  // Derive this user's groups/roles from their entity memberships (not the logged-in user's /me data)
  const userGroups = useMemo(() => {
    if (!userEntities?.length) return []
    return userEntities.flatMap(e => e.groups)
  }, [userEntities])
  const userRoleNames = useMemo(() => {
    const set = new Set<string>()
    for (const g of userGroups) for (const r of g.role_names) set.add(r)
    return [...set]
  }, [userGroups])
  const { data: phones } = usePhones('user', id)
  const { data: contactEmails } = useContactEmails('user', id)
  const { data: addresses } = useAddresses('user', id)
  const { data: notes } = useNotes('user', id)
  const { data: attachments } = useAttachments('user', id)
  const { data: ssoProviders } = useSSOProviders(id)
  const deleteSSOProvider = useDeleteSSOProvider()
  const { data: ipLocation } = useUserIPLocation(id)
  const { data: completeness } = useProfileCompleteness(id)
  const genderOptions = useDictionaryOptions('gender')
  const nationalityOptions = useDictionaryColumnOptions('nationality', 'nationality')
  const countryOptions = useDictionaryColumnOptions('nationality', 'country')
  const airportOptions = useDictionaryOptions('airport')
  const dictLanguageOptions = useDictionaryOptions('language')
  const detailLanguageOptions = dictLanguageOptions
  const dictUserTypeOptions = useDictionaryOptions('user_type')
  const detailUserTypeOptions = dictUserTypeOptions
  const clothingSizeOptions = useDictionaryOptions('clothing_size')
  const shoeSizeOptions = useDictionaryOptions('shoe_size')
  const { data: jobPositionsData } = useJobPositions({ page_size: 200 })
  const jobPositionOptions = (jobPositionsData?.items ?? []).map(jp => ({ value: jp.id, label: `${jp.code} — ${jp.name}` }))
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [detailTab, setDetailTab] = useState<UserDetailTab>('fiche')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const primaryTierLink = useMemo(
    () => (userTierLinks && userTierLinks.length > 0 ? userTierLinks[0] : null),
    [userTierLinks],
  )
  const { data: linkedTierContact } = useTierContact(primaryTierLink?.tier_id, user?.tier_contact_id || undefined)
  const externalIdentitySummary = useMemo(() => {
    if (!user?.tier_contact_id) return null
    if (linkedTierContact) return `${linkedTierContact.first_name} ${linkedTierContact.last_name}`
    return t('users.external_contact_unavailable')
  }, [linkedTierContact, t, user?.tier_contact_id])

  const handleInlineSave = useCallback((field: string, value: string) => {
    updateUser.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateUser])

  const confirm = useConfirm()

  const handleToggleActive = useCallback(() => {
    if (!user) return
    updateUser.mutate({ id, payload: { active: !user.active } })
  }, [id, user, updateUser])

  const handleDelete = useCallback(async () => {
    if (!user) return
    const ok = await confirm({
      title: 'Supprimer cet utilisateur ?',
      message: `L'utilisateur "${user.first_name} ${user.last_name}" sera définitivement supprimé. Cette action est irréversible. Si l'utilisateur a de l'activité dans le système, la suppression sera refusée.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    deleteUser.mutate(id, {
      onSuccess: () => toast({ title: t('users.toast.deleted'), variant: 'success' }),
      onError: (err) => {
        const detail = (err as { response?: { data?: { detail?: { message?: string; blockers?: string[] } | string } } })?.response?.data?.detail
        if (typeof detail === 'object' && detail?.blockers) {
          toast({
            title: detail.message || t('users.toast.delete_blocked'),
            description: detail.blockers.join(', '),
            variant: 'error',
          })
        } else {
          toast({ title: String(detail || t('users.toast.delete_error')), variant: 'error' })
        }
      },
    })
  }, [id, user, confirm, deleteUser, toast])

  const handleRevokeSessions = useCallback(() => {
    revokeAllSessions.mutate()
  }, [revokeAllSessions])

  const handleAvatarUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadAvatar.mutate({ userId: id, file })
    e.target.value = ''
  }, [uploadAvatar, id])

  const handleAvatarFromURL = useCallback(() => {
    if (!avatarUrl.trim()) return
    setAvatarFromURL.mutate({ userId: id, url: avatarUrl.trim() }, {
      onSuccess: () => { setShowUrlInput(false); setAvatarUrl(''); toast({ title: t('users.toast.avatar_updated'), variant: 'success' }) },
      onError: () => toast({ title: t('users.toast.avatar_upload_error'), variant: 'error' }),
    })
  }, [id, avatarUrl, setAvatarFromURL, toast])

  const handlePasswordReset = useCallback(() => {
    if (user?.email) sendPasswordReset.mutate(user.email, {
      onSuccess: () => toast({ title: t('users.toast.reset_email_sent', { email: user.email }), variant: 'success' }),
      onError: () => toast({ title: t('users.toast.reset_email_error'), variant: 'error' }),
    })
  }, [user?.email, sendPasswordReset, toast])

  const handleUnlockAccount = useCallback(() => {
    updateUser.mutate({ id, payload: { failed_login_count: 0, locked_until: null } })
  }, [id, updateUser])

  const userDetailActionItems = useMemo<ActionItem[]>(() => [
    {
      id: 'toggle-active',
      label: user?.active ? 'Desactiver' : 'Activer',
      icon: user?.active ? UserX : UserCheck,
      variant: user?.active ? 'danger' : 'primary',
      priority: 80,
      loading: updateUser.isPending,
      disabled: updateUser.isPending,
      onClick: handleToggleActive,
    },
    {
      id: 'delete',
      label: 'Supprimer',
      icon: Trash2,
      variant: 'danger',
      priority: 70,
      loading: deleteUser.isPending,
      disabled: deleteUser.isPending,
      onClick: handleDelete,
    },
  ], [user?.active, updateUser.isPending, deleteUser.isPending, handleToggleActive, handleDelete])

  if (!user) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  const entitiesCount = userEntities?.length ?? 0
  const isLocked = !!(user.locked_until && new Date(user.locked_until) > new Date())
  const isExpired = !!(user.account_expires_at && new Date(user.account_expires_at) < new Date())
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <DynamicPanelShell
      title={`${user.first_name} ${user.last_name}`}
      subtitle={user.email}
      icon={
        user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className={cn('h-7 w-7 flex items-center justify-center rounded-full font-semibold text-white text-[10px]', getAvatarColor(`${user.first_name}${user.last_name}`))}>
            {`${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`}
          </div>
        )
      }
      actionItems={userDetailActionItems}
    >
      <div className="p-4 space-y-5">
        {/* Profile header with avatar upload */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/50">
          <div className="relative shrink-0 group">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className={cn('h-14 w-14 flex items-center justify-center rounded-full font-semibold text-white text-lg', getAvatarColor(`${user.first_name}${user.last_name}`))}>
                {`${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`}
              </div>
            )}
            <button
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => setShowAvatarMenu(v => !v)}
              title="Changer l'avatar"
            >
              <Camera size={16} className="text-white" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { handleAvatarUpload(e); setShowAvatarMenu(false) }}
            />
            {(uploadAvatar.isPending || setAvatarFromURL.isPending) && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                <Loader2 size={16} className="animate-spin text-white" />
              </div>
            )}
            {/* Avatar options dropdown */}
            {showAvatarMenu && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
                <button
                  className="gl-button gl-button-sm gl-button-default w-full text-left flex"
                  onClick={() => { avatarInputRef.current?.click() }}
                >
                  <Upload size={12} className="text-muted-foreground" />
                  Charger depuis le PC
                </button>
                <button
                  className="gl-button gl-button-sm gl-button-default w-full text-left flex"
                  onClick={() => { setShowUrlInput(true); setShowAvatarMenu(false) }}
                >
                  <Link2 size={12} className="text-muted-foreground" />
                  Importer depuis une URL
                </button>
              </div>
            )}
          </div>
          {/* URL input overlay */}
          {showUrlInput && (
            <div className="absolute left-0 right-0 top-0 z-50 bg-card border border-border rounded-lg shadow-lg p-3 mx-4">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">URL de l&apos;image</label>
              <div className="flex gap-2">
                <input
                  className="gl-form-input flex-1 text-xs"
                  placeholder="https://example.com/photo.jpg"
                  value={avatarUrl}
                  onChange={e => setAvatarUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAvatarFromURL()}
                  autoFocus
                />
                <button className="gl-button-sm gl-button-confirm" onClick={handleAvatarFromURL} disabled={setAvatarFromURL.isPending}>
                  {setAvatarFromURL.isPending ? <Loader2 size={12} className="animate-spin" /> : 'OK'}
                </button>
                <button className="gl-button-sm gl-button-default" onClick={() => { setShowUrlInput(false); setAvatarUrl('') }}>
                  ✕
                </button>
              </div>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate">{user.first_name} {user.last_name}</h3>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {isLocked ? (
                <span className="gl-badge gl-badge-warning"><Lock size={9} className="mr-0.5" />Verrouillé</span>
              ) : isExpired ? (
                <span className="gl-badge gl-badge-neutral"><AlertTriangle size={9} className="mr-0.5" />Expiré</span>
              ) : (
                <span className={cn('gl-badge', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                  {user.active ? 'Actif' : 'Archivé'}
                </span>
              )}
              {user.mfa_enabled && (
                <span className="gl-badge gl-badge-info text-[10px]"><ShieldCheck size={9} className="mr-0.5" />MFA</span>
              )}
              <span className="gl-badge gl-badge-neutral text-[10px]">{AUTH_TYPE_LABELS[user.auth_type] ?? user.auth_type}</span>
              <span className="text-xs text-muted-foreground uppercase font-medium">{user.language}</span>
            </div>
            {/* Profile completeness bar */}
            {completeness && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      completeness.percentage >= 80 ? 'bg-emerald-500' : completeness.percentage >= 50 ? 'bg-amber-500' : 'bg-red-400',
                    )}
                    style={{ width: `${completeness.percentage}%` }}
                  />
                </div>
                <span className={cn(
                  'text-[10px] font-semibold tabular-nums shrink-0',
                  completeness.percentage >= 80 ? 'text-emerald-500' : completeness.percentage >= 50 ? 'text-amber-500' : 'text-red-400',
                )}>
                  {completeness.percentage}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Detail tabs */}
        <div className="-mx-4">
          <TabBar
            items={[
              { id: 'fiche', label: 'Fiche', icon: Users },
              { id: 'entities', label: 'Entités & Rôles', icon: Building2, badge: entitiesCount || undefined },
              { id: 'securite', label: 'Sécurité', icon: Shield },
              { id: 'journal', label: 'Journal', icon: Clock },
              { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
            ]}
            activeId={detailTab}
            onTabChange={(id) => setDetailTab(id as typeof detailTab)}
          />
        </div>

        {detailTab === 'fiche' ? (
          <SectionColumns>
            {/* Column 1: Identity + Coordonnées */}
            <div className="@container space-y-5">
                <FormSection title={t('common.identity')}>
                  <InlineEditableRow label={t('users.last_name')} value={user.last_name} onSave={(v) => handleInlineSave('last_name', v)} />
                  <InlineEditableRow label={t('users.first_name')} value={user.first_name} onSave={(v) => handleInlineSave('first_name', v)} />
                  <InlineEditableRow label="Nom passeport" value={user.passport_name || ''} onSave={(v) => updateUser.mutate({ id, payload: { passport_name: v || null } })} />
                  <InlineEditableRow label="Email" value={user.email} onSave={(v) => handleInlineSave('email', v)} type="email" />
                  {genderOptions.length > 0 ? (
                    <InlineEditableTags label="Genre" value={user.gender || ''} options={genderOptions} onSave={(v) => updateUser.mutate({ id, payload: { gender: v || null } })} />
                  ) : (
                    <InlineEditableRow label="Genre" value={user.gender || ''} onSave={(v) => updateUser.mutate({ id, payload: { gender: v || null } })} />
                  )}
                {nationalityOptions.length > 0 ? (
                  <InlineEditableCombobox label="Nationalité" value={user.nationality || ''} options={nationalityOptions} onSave={(v) => updateUser.mutate({ id, payload: { nationality: v || null } })} placeholder={t('users.rechercher_une_nationalite')} />
                ) : (
                  <InlineEditableRow label="Nationalité" value={user.nationality || ''} onSave={(v) => updateUser.mutate({ id, payload: { nationality: v || null } })} />
                )}
                {countryOptions.length > 0 ? (
                  <InlineEditableCombobox label="Pays de naissance" value={user.birth_country || ''} options={countryOptions} onSave={(v) => updateUser.mutate({ id, payload: { birth_country: v || null } })} placeholder={t('users.rechercher_un_pays')} />
                ) : (
                  <InlineEditableRow label="Pays de naissance" value={user.birth_country || ''} onSave={(v) => updateUser.mutate({ id, payload: { birth_country: v || null } })} />
                )}
                <InlineEditableRow label="Ville de naissance" value={user.birth_city || ''} onSave={(v) => updateUser.mutate({ id, payload: { birth_city: v || null } })} />
                <InlineEditableRow label="Date de naissance" value={user.birth_date || ''} onSave={(v) => updateUser.mutate({ id, payload: { birth_date: v || null } })} type="date" />
                <InlineEditableRow label="ID Intranet" value={user.intranet_id || ''} onSave={(v) => updateUser.mutate({ id, payload: { intranet_id: v || undefined } })} />
                  {detailLanguageOptions.length > 0 ? (
                    <InlineEditableTags label={t('settings.language')} value={user.language} options={detailLanguageOptions} onSave={(v) => handleInlineSave('language', v)} />
                  ) : (
                    <InlineEditableRow label={t('settings.language')} value={user.language || ''} onSave={(v) => handleInlineSave('language', v)} />
                  )}
                  {detailUserTypeOptions.length > 0 ? (
                    <InlineEditableTags label="Type" value={user.user_type || 'internal'} options={detailUserTypeOptions} onSave={(v) => updateUser.mutate({ id, payload: { user_type: v } })} />
                  ) : (
                    <InlineEditableRow label="Type" value={user.user_type || 'internal'} onSave={(v) => updateUser.mutate({ id, payload: { user_type: v || 'internal' } })} />
                  )}
                {jobPositionOptions.length > 0 ? (
                  <InlineEditableCombobox label="Poste / Fonction" value={user.job_position_id || ''} options={jobPositionOptions} onSave={(v) => updateUser.mutate({ id, payload: { job_position_id: v || null } })} placeholder={t('users.selectionner_un_poste')} />
                  ) : (
                    <ReadOnlyRow label="Poste / Fonction" value={<span className="text-xs text-muted-foreground">Aucun poste défini</span>} />
                  )}
                </FormSection>

                {(user.user_type === 'external' || !!user.tier_contact_id || !!primaryTierLink) && (
                  <FormSection title={t('users.external_identity_title')}>
                    <ReadOnlyRow
                      label={t('users.external_identity_type')}
                      value={
                        <span className="gl-badge gl-badge-info text-[10px]">
                          {t('users.external_identity_external_user')}
                        </span>
                      }
                    />
                    <ReadOnlyRow
                      label={t('users.external_identity_contact_origin')}
                      value={
                        externalIdentitySummary ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-foreground">{externalIdentitySummary}</span>
                            {primaryTierLink && (
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => openDynamicPanel({ type: 'detail', module: 'tiers', id: primaryTierLink.tier_id })}
                              >
                                {t('users.external_identity_open_company')}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('users.external_identity_no_contact')}</span>
                        )
                      }
                    />
                    <ReadOnlyRow
                      label={t('users.external_identity_company')}
                      value={
                        primaryTierLink ? (
                          <CrossModuleLink
                            module="tiers"
                            id={primaryTierLink.tier_id}
                            label={primaryTierLink.tier_name}
                            showIcon={false}
                            className="text-sm font-medium"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('users.external_identity_no_company')}</span>
                        )
                      }
                    />
                    <ReadOnlyRow
                      label={t('users.external_identity_scope')}
                      value={<span className="text-xs text-muted-foreground">{t('users.external_identity_scope_hint')}</span>}
                    />
                  </FormSection>
                )}

                {/* Coordonnées: phones, emails, addresses */}
                <FormSection title={t('common.contact_info')} collapsible defaultExpanded storageKey="panel.user.sections" id="user-contact">
                <div className="space-y-3 border-t border-border/40 pt-3 mt-2">
                  <SubSectionLabel icon={Phone} label="Téléphones" count={phones?.length ?? 0} />
                  <PhoneManager ownerType="user" ownerId={id} compact />

                  <SubSectionLabel icon={Mail} label="Emails" count={contactEmails?.length ?? 0} />
                  <ContactEmailManager ownerType="user" ownerId={id} compact />

                  <SubSectionLabel icon={MapPin} label="Adresses" count={addresses?.length ?? 0} />
                  <AddressManager ownerType="user" ownerId={id} compact />

                  <SubSectionLabel icon={Heart} label="Contacts d'urgence" count={0} />
                  <EmergencyContactManager userId={id} compact />
                </div>
              </FormSection>

              {/* Documents administratifs */}
              <FormSection title="Documents administratifs" collapsible storageKey="panel.user.sections" id="user-documents">
                <div className="space-y-3 border-t border-border/40 pt-3 mt-2">
                  <SubSectionLabel icon={FileText} label="Passeports" count={0} />
                  <PassportManager userId={id} compact />

                  <SubSectionLabel icon={Stamp} label="Visas" count={0} />
                  <VisaManager userId={id} compact />

                  <SubSectionLabel icon={CreditCard} label="Sécurité sociale" count={0} />
                  <SocialSecurityManager userId={id} compact />
                </div>
              </FormSection>

              {/* Voyage & Transport */}
              <FormSection title="Voyage & Transport" collapsible storageKey="panel.user.sections" id="user-travel">
                {airportOptions.length > 0 ? (
                  <InlineEditableCombobox label="Aéroport contractuel" value={user.contractual_airport || ''} options={airportOptions} onSave={(v) => updateUser.mutate({ id, payload: { contractual_airport: v || null } })} placeholder={t('users.rechercher_un_aeroport')} />
                ) : (
                  <InlineEditableRow label="Aéroport contractuel" value={user.contractual_airport || ''} onSave={(v) => updateUser.mutate({ id, payload: { contractual_airport: v || null } })} />
                )}
                {airportOptions.length > 0 ? (
                  <InlineEditableCombobox label="Aéroport le plus proche" value={user.nearest_airport || ''} options={airportOptions} onSave={(v) => updateUser.mutate({ id, payload: { nearest_airport: v || null } })} placeholder={t('users.rechercher_un_aeroport')} />
                ) : (
                  <InlineEditableRow label="Aéroport le plus proche" value={user.nearest_airport || ''} onSave={(v) => updateUser.mutate({ id, payload: { nearest_airport: v || null } })} />
                )}
                <InlineEditableRow label="Gare la plus proche" value={user.nearest_station || ''} onSave={(v) => updateUser.mutate({ id, payload: { nearest_station: v || null } })} />
                <InlineEditableRow label="Programme fidélité" value={user.loyalty_program || ''} onSave={(v) => updateUser.mutate({ id, payload: { loyalty_program: v || null } })} />
              </FormSection>
            </div>

            {/* Column 2: Roles/Groups + Activity + Dates + Notes/Files */}
            <div className="@container space-y-5">
              {/* Roles & Groups */}
              <FormSection title="Rôles & Groupes" collapsible defaultExpanded storageKey="panel.user.sections" id="user-roles-groups">
                <SectionHeader>
                  <span className="flex items-center gap-1.5"><Shield size={12} /> Rôles attribués</span>
                </SectionHeader>
                {userRoleNames.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {userRoleNames.map((roleName) => (
                      <button
                        key={roleName}
                        onClick={() => openDynamicPanel({ type: 'detail', module: 'roles', id: roleName })}
                        className="gl-badge gl-badge-info text-xs cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
                      >
                        {roleName}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Aucun rôle attribué</p>
                )}

                <SectionHeader>
                  <span className="flex items-center gap-1.5 mt-3"><KeyRound size={12} /> Groupes</span>
                </SectionHeader>
                {userGroups.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {userGroups.map((group) => (
                      <button
                        key={group.group_id}
                        onClick={() => openDynamicPanel({ type: 'detail', module: 'groups', id: group.group_id })}
                        className="gl-badge gl-badge-neutral text-xs cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
                      >
                        {group.group_name} ({group.role_names.join(', ') || group.role_codes.join(', ')})
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Aucun groupe</p>
                )}
              </FormSection>

              <FormSection title={t('common.activity')}>
                <ReadOnlyRow
                  label="Dernière connexion"
                  value={
                    <span className="flex items-center gap-1.5 text-sm">
                      <Clock size={12} className="text-muted-foreground" />
                      {user.last_login_at ? (
                        <span title={formatDateTime(user.last_login_at)}>{relativeTime(user.last_login_at)}</span>
                      ) : '—'}
                    </span>
                  }
                />
                <ReadOnlyRow
                  label="Dernière IP"
                  value={
                    user.last_login_ip ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-sm font-mono">
                          <Globe size={12} className="text-muted-foreground" />{user.last_login_ip}
                        </span>
                        {ipLocation?.location && ipLocation.location.status === 'success' && (
                          <span className="text-[11px] text-muted-foreground ml-5">
                            {[ipLocation.location.city, ipLocation.location.regionName, ipLocation.location.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </span>
                    ) : <span className="text-sm text-muted-foreground">—</span>
                  }
                />
                <ReadOnlyRow
                  label="Créé le"
                  value={
                    <span className="flex items-center gap-1.5 text-sm">
                      <Calendar size={12} className="text-muted-foreground" />
                      {formatDate(user.created_at)}
                    </span>
                  }
                />
                {user.updated_at && (
                  <ReadOnlyRow
                    label="Modifié le"
                    value={<span className="text-sm">{formatDate(user.updated_at)}</span>}
                  />
                )}
              </FormSection>

              {/* Mensurations / EPI */}
              <FormSection title={t('common.body_measurements')} collapsible storageKey="panel.user.sections" id="user-body">
                <InlineEditableRow label="Taille (cm)" value={user.height != null ? String(user.height) : ''} onSave={(v) => updateUser.mutate({ id, payload: { height: v ? parseInt(v) : null } })} />
                <InlineEditableRow label="Poids (kg)" value={user.weight != null ? String(user.weight) : ''} onSave={(v) => updateUser.mutate({ id, payload: { weight: v ? parseFloat(v) : null } })} />
                {clothingSizeOptions.length > 0
                  ? <InlineEditableTags label="Vêtement haut" value={user.ppe_clothing_size || ''} options={clothingSizeOptions} onSave={(v) => updateUser.mutate({ id, payload: { ppe_clothing_size: v || null } })} />
                  : <PPESizeRow label="Vêtement haut" value={user.ppe_clothing_size || ''} onSave={(v) => updateUser.mutate({ id, payload: { ppe_clothing_size: v || null } })} chartType="clothing" />
                }
                {clothingSizeOptions.length > 0
                  ? <InlineEditableTags label="Vêtement bas" value={user.ppe_clothing_size_bottom || ''} options={clothingSizeOptions} onSave={(v) => updateUser.mutate({ id, payload: { ppe_clothing_size_bottom: v || null } })} />
                  : <PPESizeRow label="Vêtement bas" value={user.ppe_clothing_size_bottom || ''} onSave={(v) => updateUser.mutate({ id, payload: { ppe_clothing_size_bottom: v || null } })} chartType="clothing" />
                }
                {shoeSizeOptions.length > 0
                  ? <InlineEditableTags label="Pointure" value={user.ppe_shoe_size || ''} options={shoeSizeOptions} onSave={(v) => updateUser.mutate({ id, payload: { ppe_shoe_size: v || null } })} />
                  : <PPESizeRow label="Pointure" value={user.ppe_shoe_size || ''} onSave={(v) => updateUser.mutate({ id, payload: { ppe_shoe_size: v || null } })} chartType="shoe" />
                }
              </FormSection>

              {/* Santé */}
              <FormSection title={t('common.health')} collapsible storageKey="panel.user.sections" id="user-health">
                <div className="border-b border-border/40 pb-3 mb-2">
                  <SubSectionLabel icon={Stethoscope} label="Visites médicales" count={0} />
                  <MedicalCheckManager ownerType="user" ownerId={id} compact />
                </div>
                <div className="border-t border-border/40 pt-3 mt-2">
                  <SubSectionLabel icon={Syringe} label="Vaccins" count={0} />
                  <VaccineManager userId={id} compact />
                </div>
                <div className="border-t border-border/40 pt-3 mt-2">
                  <SubSectionLabel icon={Heart} label="Conditions de santé" count={0} />
                  <HealthConditionsChecklist userId={id} />
                </div>
              </FormSection>

              {/* Compétences */}
              <FormSection title="Compétences" collapsible storageKey="panel.user.sections" id="user-skills">
                <div className="space-y-3 border-t border-border/40 pt-3 mt-2">
                  <SubSectionLabel icon={Languages} label="Langues" count={0} />
                  <UserLanguageManager userId={id} compact />

                  <SubSectionLabel icon={Car} label="Permis de conduire" count={0} />
                  <DrivingLicenseManager userId={id} compact />
                </div>
              </FormSection>

              {/* Référentiels & Conformité */}
              <FormSection title="Référentiels & Conformité" collapsible storageKey="panel.user.sections" id="user-referentiels">
                <ReferentielManager ownerType="user" ownerId={id} compact />
              </FormSection>


              {/* Identifiants externes */}
              <FormSection title="Identifiants externes" collapsible storageKey="panel.user.sections" id="user-ext-refs" defaultExpanded={false}>
                <ExternalRefManager ownerType="user" ownerId={id} compact />
              </FormSection>

              {/* Notes & Fichiers */}
              <FormSection title={t('common.notes_documents')} collapsible storageKey="panel.user.sections" id="user-notes-files">
                <DetailFieldGrid>
                  <div>
                    <SubSectionLabel icon={MessageSquare} label="Notes" count={notes?.length ?? 0} />
                    <NoteManager ownerType="user" ownerId={id} compact />
                  </div>
                  <div>
                    <SubSectionLabel icon={Paperclip} label="Fichiers" count={attachments?.length ?? 0} />
                    <AttachmentManager ownerType="user" ownerId={id} compact />
                  </div>
                </DetailFieldGrid>
              </FormSection>
            </div>
          </SectionColumns>
        ) : detailTab === 'entities' ? (
          <UserEntitiesTab userId={id} />
        ) : detailTab === 'securite' ? (
          /* Sécurité tab — uses SectionColumns for wide-screen layout */
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title="Authentification">
                <ReadOnlyRow
                  label="Type"
                  value={
                    <span className="gl-badge gl-badge-neutral text-[10px]">
                      {AUTH_TYPE_LABELS[user.auth_type] ?? user.auth_type}
                    </span>
                  }
                />
                <ReadOnlyRow
                  label="MFA (TOTP)"
                  value={
                    user.mfa_enabled
                      ? <span className="gl-badge gl-badge-success text-[10px]"><ShieldCheck size={9} className="mr-0.5" />Activé</span>
                      : <span className="gl-badge gl-badge-neutral text-[10px]">{t('common.disabled')}</span>
                  }
                />
                <ReadOnlyRow
                  label="Mot de passe changé"
                  value={<span className="text-sm">{formatDate(user.password_changed_at)}</span>}
                />
              </FormSection>

              {/* SSO Providers */}
              <FormSection title="Fournisseurs SSO" collapsible storageKey="panel.user.sections" id="user-sso">
                {ssoProviders && (ssoProviders as { id: string; provider: string; email: string | null; linked_at: string }[]).length > 0 ? (
                  <div className="space-y-1.5">
                    {(ssoProviders as { id: string; provider: string; email: string | null; linked_at: string }[]).map((sso) => (
                      <div key={sso.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 group">
                        <span className="gl-badge gl-badge-info text-[10px]">{sso.provider}</span>
                        <span className="text-xs text-muted-foreground flex-1 truncate">{sso.email || '—'}</span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(sso.linked_at)}</span>
                        <button
                          onClick={() => deleteSSOProvider.mutate({ userId: id, itemId: sso.id })}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} className="text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun fournisseur SSO lié</p>
                )}
              </FormSection>

              <FormSection title="Verrouillage & Expiration">
                <ReadOnlyRow
                  label="Tentatives échouées"
                  value={
                    <span className={cn('text-sm font-medium', user.failed_login_count > 3 && 'text-destructive')}>
                      {user.failed_login_count}
                    </span>
                  }
                />
                <ReadOnlyRow
                  label="Verrouillé jusqu'à"
                  value={
                    isLocked
                      ? <span className="text-sm text-destructive font-medium">{formatDateTime(user.locked_until)}</span>
                      : <span className="text-sm text-muted-foreground">Non verrouillé</span>
                  }
                />
                <ReadOnlyRow
                  label="Expiration du compte"
                  value={
                    user.account_expires_at ? (
                      <span className={cn('text-sm', isExpired && 'text-destructive font-medium')}>
                        {formatDate(user.account_expires_at)}
                        {isExpired && ' (expiré)'}
                      </span>
                    ) : <span className="text-sm text-muted-foreground">Pas d'expiration</span>
                  }
                />
              </FormSection>
            </div>

            <div className="@container space-y-5">
              <FormSection title="Sessions & Dernière activité">
                <ReadOnlyRow
                  label="Dernière connexion"
                  value={
                    <span className="flex items-center gap-1.5 text-sm">
                      <Clock size={12} className="text-muted-foreground" />
                      {user.last_login_at ? (
                        <span title={formatDateTime(user.last_login_at)}>{relativeTime(user.last_login_at)}</span>
                      ) : '—'}
                    </span>
                  }
                />
                <ReadOnlyRow
                  label="Dernière IP"
                  value={
                    user.last_login_ip ? (
                      <span className="flex items-center gap-1.5 text-sm font-mono">
                        <Globe size={12} className="text-muted-foreground" />{user.last_login_ip}
                      </span>
                    ) : <span className="text-sm text-muted-foreground">—</span>
                  }
                />
              </FormSection>

              <FormSection title={t('common.actions')}>
                <div className="space-y-3">
                  <div>
                    <button
                      className="gl-button-sm gl-button-confirm flex items-center gap-1.5"
                      onClick={handlePasswordReset}
                      disabled={sendPasswordReset.isPending}
                    >
                      {sendPasswordReset.isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <KeyRound size={12} />
                      )}
                      Réinitialiser le mot de passe
                    </button>
                    <p className="text-xs text-muted-foreground mt-1">
                      Envoie un email de réinitialisation à {user.email}.
                    </p>
                  </div>

                  {(isLocked || user.failed_login_count > 0) && (
                    <div>
                      <button
                        className="gl-button-sm gl-button-default flex items-center gap-1.5"
                        onClick={handleUnlockAccount}
                        disabled={updateUser.isPending}
                      >
                        {updateUser.isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Unlock size={12} />
                        )}
                        Déverrouiller le compte
                      </button>
                      <p className="text-xs text-muted-foreground mt-1">
                        Remet le compteur de tentatives à 0 et supprime le verrouillage.
                      </p>
                    </div>
                  )}

                  <div>
                    <button
                      className="gl-button-sm gl-button-danger flex items-center gap-1.5"
                      onClick={handleRevokeSessions}
                      disabled={revokeAllSessions.isPending}
                    >
                      {revokeAllSessions.isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <LogOut size={12} />
                      )}
                      Révoquer toutes les sessions
                    </button>
                    <p className="text-xs text-muted-foreground mt-1">
                      Déconnecte l'utilisateur de tous les appareils (sauf la session courante).
                    </p>
                  </div>
                </div>
              </FormSection>
            </div>
          </SectionColumns>
        ) : detailTab === 'journal' ? (
          <UserJournalTab userId={id} />
        ) : detailTab === 'permissions' ? (
          <UserPermissionsTab userId={id} />
        ) : null}
      </div>
    </DynamicPanelShell>
  )
}

// ── HealthConditionsChecklist — extracted to @/components/shared/HealthConditionsChecklist

// ── Journal Tab (DataTable) ───────────────────────────────
// ── Main Page ──────────────────────────────────────────────