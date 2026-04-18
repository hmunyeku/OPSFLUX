/**
 * Users / Comptes page — powered by DataTable universal component.
 *
 * Features:
 * - Table & Grid views via DataTable viewModes
 * - Sorting, filtering, pagination, column visibility
 * - Row selection with batch actions
 * - Avatar cells
 * - CSV export
 * - Rich create & detail panels
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { useTranslation } from 'react-i18next'
import {
  Users, Plus, Loader2,
  UserCheck, UserX, Calendar, Clock,
  CheckSquare, Square, Shield, KeyRound, LogOut,
  Building2, Trash2, X,
  ShieldCheck, Lock, Unlock, AlertTriangle, Globe,
  Phone, Mail, MapPin, MessageSquare, Paperclip, Camera, Upload, Link2,
  LayoutDashboard,
  FileText, Stamp, Heart, CreditCard, Syringe, Languages, Car, Wifi, Stethoscope,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { normalizeNames } from '@/lib/normalize'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
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
  TagSelector,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useUsers, useUser, useCreateUser, useUpdateUser, useDeleteUser, useRevokeAllSessions, useUserEntities, useAssignUserToEntity, useRemoveUserFromEntity, useSendPasswordReset, useUsersStats, useRecentActivity, useUserTierLinks, useLinkUserToTier, useUnlinkUserFromTier, useProfileCompleteness, useAdminUploadAvatar, useAdminSetAvatarFromURL } from '@/hooks/useUsers'
import { useAllEntities } from '@/hooks/useEntities'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { usePageSize } from '@/hooks/usePageSize'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { RolesTab, GroupsTab, GroupDetailPanel, RoleDetailPanel, CreateGroupForm } from '@/pages/settings/tabs/RbacAdminTab'
import { useRoles, useGroups, useAddGroupMembers, useUserPermissionOverrides, useSetUserPermissionOverrides } from '@/hooks/useRbac'
import { usePermission } from '@/hooks/usePermission'
import { usePhones, useContactEmails, useAddresses, useNotes, useAttachments } from '@/hooks/useSettings'
import { useSSOProviders, useDeleteSSOProvider, useUserIPLocation } from '@/hooks/useUserSubModels'
import { useTierContact, useTiers } from '@/hooks/useTiers'
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
import type { UserRead, UserCreate } from '@/types/api'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DataTable,
  AvatarCell,
  BadgeCell,
  DateCell,
  type DataTableFilterDef,
  type DataTableBatchAction,
  type CardRendererProps,
} from '@/components/ui/DataTable'
import { relativeTime, getAvatarColor } from '@/components/ui/DataTable/utils'
import { TabBar, PageNavBar } from '@/components/ui/Tabs'

// ── Auth type labels ─────────────────────────────────────
const AUTH_TYPE_LABELS: Record<string, string> = {
  email_password: 'Email / Mot de passe',
  sso: 'SSO',
  both: 'Email + SSO',
}

// ── Helper: display null-safe text ──────────────────────────
const TextCell = ({ value }: { value: string | null | undefined }) =>
  value ? <span className="text-foreground text-xs truncate block">{value}</span> : <span className="text-muted-foreground/40">—</span>

// ── Helper: display ISO country code with flag ──────────────
const FlagCell = ({ value }: { value: string | null | undefined }) => {
  if (!value) return <span className="text-muted-foreground/40">—</span>
  return <CountryFlag code={value} label={value.toUpperCase()} className="text-foreground text-xs" />
}

// ── Column definitions ─────────────────────────────────────
const getUserColumns = (t: (key: string) => string): ColumnDef<UserRead, unknown>[] => [
  // ── Always visible ──
  {
    accessorKey: 'name',
    header: t('users.columns.name'),
    accessorFn: (row) => `${row.first_name} ${row.last_name}`,
    cell: ({ row }) => (
      <AvatarCell
        name={`${row.original.first_name} ${row.original.last_name}`}
        avatarUrl={row.original.avatar_url}
      />
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'email',
    header: t('users.columns.email'),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground truncate max-w-[200px] block">
        {getValue() as string}
      </span>
    ),
    meta: { filterType: 'text' as const, filterLabel: 'Email' },
  },
  {
    accessorKey: 'intranet_id',
    header: t('users.columns.intranet_id'),
    cell: ({ getValue }) => {
      const v = getValue() as string | null
      return v ? <span className="font-mono text-[10px] text-muted-foreground">{v}</span> : <span className="text-muted-foreground/40">—</span>
    },
    size: 110,
  },
  {
    accessorKey: 'auth_type',
    header: t('users.columns.auth'),
    cell: ({ getValue }) => {
      const v = getValue() as string
      return <span className="gl-badge gl-badge-neutral text-[10px]">{AUTH_TYPE_LABELS[v] ?? v}</span>
    },
    size: 120,
    meta: { filterType: 'select' as const, filterOptions: [{ value: 'email_password', label: 'Email / Mot de passe' }, { value: 'sso', label: 'SSO' }, { value: 'both', label: 'Email + SSO' }] },
  },
  {
    id: 'mfa',
    header: t('users.columns.mfa'),
    accessorFn: (row) => row.mfa_enabled,
    cell: ({ row }) => (
      row.original.mfa_enabled
        ? <span className="gl-badge gl-badge-success text-[10px]"><ShieldCheck size={9} className="mr-0.5" />Actif</span>
        : <span className="gl-badge gl-badge-neutral text-[10px]">Inactif</span>
    ),
    size: 80,
  },
  {
    accessorKey: 'language',
    header: t('users.columns.language'),
    cell: ({ getValue }) => (
      <span className="uppercase text-xs text-muted-foreground font-medium">
        {getValue() as string}
      </span>
    ),
    size: 80,
    meta: { filterType: 'select' as const, filterOptions: [{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }] },
  },
  {
    accessorKey: 'active',
    header: t('users.columns.status'),
    cell: ({ row }) => {
      const u = row.original
      if (u.locked_until && new Date(u.locked_until) > new Date()) {
        return <BadgeCell value="Verrouillé" variant="warning" />
      }
      if (u.account_expires_at && new Date(u.account_expires_at) < new Date()) {
        return <BadgeCell value="Expiré" variant="neutral" />
      }
      return <BadgeCell value={u.active ? 'Actif' : 'Archivé'} variant={u.active ? 'success' : 'neutral'} />
    },
    size: 100,
  },
  {
    accessorKey: 'user_type',
    header: t('users.columns.type'),
    cell: ({ getValue }) => {
      const v = getValue() as string
      return v === 'external'
        ? <BadgeCell value="Externe" variant="warning" />
        : <BadgeCell value="Interne" variant="info" />
    },
    size: 90,
  },
  {
    accessorKey: 'created_at',
    header: t('users.columns.created_at'),
    cell: ({ getValue }) => <DateCell value={getValue() as string} />,
    size: 110,
  },
  {
    accessorKey: 'last_login_at',
    header: t('users.columns.last_login'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} relative />,
    size: 140,
  },
  // ── HR Identity (hidden by default) ──
  {
    accessorKey: 'passport_name',
    header: t('users.columns.passport_name'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 150,
  },
  {
    accessorKey: 'gender',
    header: t('users.columns.gender'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 70,
    meta: { filterType: 'select' as const, filterOptions: [{ value: 'M', label: 'Masculin' }, { value: 'F', label: 'Féminin' }, { value: 'X', label: 'Autre' }] },
  },
  {
    accessorKey: 'nationality',
    header: t('users.columns.nationality'),
    cell: ({ getValue }) => <FlagCell value={getValue() as string | null} />,
    size: 120,
  },
  {
    accessorKey: 'birth_country',
    header: t('users.columns.birth_country'),
    cell: ({ getValue }) => <FlagCell value={getValue() as string | null} />,
    size: 140,
  },
  {
    accessorKey: 'birth_city',
    header: t('users.columns.birth_city'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 140,
  },
  {
    accessorKey: 'birth_date',
    header: t('users.columns.birth_date'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 130,
  },
  // ── Travel (hidden by default) ──
  {
    accessorKey: 'contractual_airport',
    header: t('users.columns.contractual_airport'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 150,
  },
  {
    accessorKey: 'nearest_airport',
    header: t('users.columns.nearest_airport'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 140,
  },
  {
    accessorKey: 'nearest_station',
    header: t('users.columns.nearest_station'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 140,
  },
  {
    accessorKey: 'loyalty_program',
    header: t('users.columns.loyalty_program'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 140,
  },
  // ── Health / Medical (hidden by default) ──
  {
    accessorKey: 'last_medical_check',
    header: t('users.columns.last_medical_check'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 130,
  },
  {
    accessorKey: 'last_international_medical_check',
    header: t('users.columns.last_international_medical_check'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 160,
  },
  {
    accessorKey: 'last_subsidiary_medical_check',
    header: t('users.columns.last_subsidiary_medical_check'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 140,
  },
  // ── Mensurations (hidden by default) ──
  {
    accessorKey: 'height',
    header: t('users.columns.height'),
    cell: ({ getValue }) => { const v = getValue() as number | null; return v ? <span className="text-xs tabular-nums">{v} cm</span> : <span className="text-muted-foreground/40">—</span> },
    size: 90,
  },
  {
    accessorKey: 'weight',
    header: t('users.columns.weight'),
    cell: ({ getValue }) => { const v = getValue() as number | null; return v ? <span className="text-xs tabular-nums">{v} kg</span> : <span className="text-muted-foreground/40">—</span> },
    size: 90,
  },
  {
    accessorKey: 'ppe_clothing_size',
    header: t('users.columns.clothing_size'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 120,
  },
  {
    accessorKey: 'ppe_shoe_size',
    header: t('users.columns.shoe_size'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 90,
  },
  // ── Misc / HR (hidden by default) ──
  {
    accessorKey: 'retirement_date',
    header: t('users.columns.retirement_date'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 120,
  },
  {
    accessorKey: 'vantage_number',
    header: t('users.columns.vantage_number'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 110,
  },
  {
    accessorKey: 'extension_number',
    header: t('users.columns.extension_number'),
    cell: ({ getValue }) => <TextCell value={getValue() as string | null} />,
    size: 100,
  },
  // ── Security (hidden by default) ──
  {
    accessorKey: 'last_login_ip',
    header: t('users.columns.last_ip'),
    cell: ({ getValue }) => { const v = getValue() as string | null; return v ? <span className="font-mono text-[10px] text-muted-foreground">{v}</span> : <span className="text-muted-foreground/40">—</span> },
    size: 120,
  },
  {
    accessorKey: 'failed_login_count',
    header: t('users.columns.failed_login_count'),
    cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-xs text-amber-500 font-semibold tabular-nums">{v}</span> : <span className="text-muted-foreground/40">0</span> },
    size: 120,
  },
  {
    accessorKey: 'password_changed_at',
    header: t('users.columns.password_changed'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} relative />,
    size: 150,
  },
  {
    accessorKey: 'account_expires_at',
    header: t('users.columns.account_expires'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} />,
    size: 130,
  },
  {
    accessorKey: 'updated_at',
    header: t('users.columns.updated_at'),
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} relative />,
    size: 120,
  },
]

// Default hidden columns — all the extended HR/travel/health/security fields
const defaultHiddenUserColumns = [
  'passport_name', 'gender', 'nationality', 'birth_country', 'birth_city', 'birth_date',
  'contractual_airport', 'nearest_airport', 'nearest_station', 'loyalty_program',
  'last_medical_check', 'last_international_medical_check', 'last_subsidiary_medical_check',
  'height', 'weight', 'ppe_clothing_size', 'ppe_clothing_size_bottom', 'ppe_shoe_size',
  'retirement_date', 'vantage_number', 'extension_number',
  'last_login_ip', 'failed_login_count', 'password_changed_at', 'account_expires_at', 'updated_at',
]

// ── User Card (for grid view) ──────────────────────────────
function UserCard({ row: user, selected, onSelect, onClick }: CardRendererProps<UserRead>) {
  const initials = `${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`
  const color = getAvatarColor(`${user.first_name}${user.last_name}`)

  return (
    <div
      className={cn(
        'group relative border rounded-lg p-4 transition-all cursor-pointer hover:shadow-md',
        selected
          ? 'border-primary bg-primary/[0.04] shadow-sm'
          : 'border-border bg-card hover:border-border-hover',
      )}
      onClick={onClick}
    >
      <button
        type="button"
        className={cn(
          'absolute top-3 right-3 text-muted-foreground transition-opacity',
          selected ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100',
        )}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
      >
        {selected ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>

      <div className="flex flex-col items-center text-center">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className={cn('h-14 w-14 flex items-center justify-center rounded-full font-semibold text-white text-lg', color)}>
            {initials}
          </div>
        )}
        <h4 className="mt-3 text-sm font-semibold text-foreground truncate w-full">
          {user.first_name} {user.last_name}
        </h4>
        <p className="text-xs text-muted-foreground truncate w-full mt-0.5">{user.email}</p>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
        <span className={cn('gl-badge', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
          {user.active ? 'Actif' : 'Archivé'}
        </span>
        {user.mfa_enabled && (
          <span className="gl-badge gl-badge-info text-[10px]"><ShieldCheck size={9} className="mr-0.5" />MFA</span>
        )}
        <span className="text-xs text-muted-foreground uppercase font-medium">{user.language}</span>
      </div>

      <div className="mt-3 pt-3 border-t border-border/50 text-center">
        <span className="text-xs text-muted-foreground" title={user.last_login_at ? new Date(user.last_login_at).toLocaleString() : undefined}>
          <Clock size={10} className="inline mr-1" />
          {user.last_login_at ? relativeTime(user.last_login_at) : 'Jamais connecté'}
        </span>
      </div>
    </div>
  )
}

// ── Create User Panel ──────────────────────────────────────
function CreateUserPanel() {
  const { t } = useTranslation()
  const createUser = useCreateUser()
  const { toast } = useToast()
  const { data: allEntitiesData } = useAllEntities({ page: 1, page_size: 200 })
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const dictLanguageOptions = useDictionaryOptions('language')
  const dictUserTypeOptions = useDictionaryOptions('user_type')
  const languageOptions = dictLanguageOptions
  const userTypeOptions = dictUserTypeOptions
  const [form, setForm] = useState<UserCreate & { account_expires_at?: string }>({
    email: '', first_name: '', last_name: '', password: '', language: 'fr',
  })
  const [sendInvite, setSendInvite] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { account_expires_at, password, ...rest } = form
      const payload = normalizeNames(rest) as UserCreate & { account_expires_at?: string }
      // Send null instead of empty string for optional password (min_length=8 validation)
      payload.password = password && password.length >= 8 ? password : undefined
      if (account_expires_at) payload.account_expires_at = account_expires_at
      await createUser.mutateAsync(payload as UserCreate)
      toast({ title: t('users.created_success'), variant: 'success' })
      closeDynamicPanel()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : t('common.error_generic')
      toast({ title: t('users.create_error'), description: msg, variant: 'error' })
    }
  }

  const entities = allEntitiesData?.items?.filter((e) => e.active) ?? []

  const createUserActionItems = useMemo<ActionItem[]>(() => [
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
      loading: createUser.isPending,
      disabled: createUser.isPending,
      onClick: () => (document.getElementById('create-user-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [t, closeDynamicPanel, createUser.isPending])

  return (
    <DynamicPanelShell
      title={t('users.create')}
      subtitle={t('users.title')}
      icon={<Users size={14} className="text-primary" />}
      actionItems={createUserActionItems}
    >
      <form id="create-user-form" onSubmit={handleSubmit} className="p-4 space-y-0">
        <SectionColumns>
          {/* ── Column 1: Identité ── */}
          <div className="@container">
            <table className="w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[160px]" />
                <col />
              </colgroup>
              <tbody>
                <tr>
                  <td colSpan={2} className="pt-2 pb-1.5 px-3">
                    <SectionHeader><span className="flex items-center gap-1.5"><Users size={12} /> Identité</span></SectionHeader>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">
                    {t('users.last_name')} <span className="text-destructive">*</span>
                  </td>
                  <td className="py-2 px-3">
                    <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} placeholder="DUPONT" />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">
                    {t('users.first_name')} <span className="text-destructive">*</span>
                  </td>
                  <td className="py-2 px-3">
                    <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} placeholder="Jean" />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">
                    Email <span className="text-destructive">*</span>
                  </td>
                  <td className="py-2 px-3">
                    <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={panelInputClass} placeholder="jean.dupont@perenco.com" />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">ID Intranet</td>
                  <td className="py-2 px-3">
                    <input type="text" value={form.intranet_id || ''} onChange={(e) => setForm({ ...form, intranet_id: e.target.value || undefined })} className={cn(panelInputClass, 'max-w-[200px]')} placeholder="EMP-001" />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">{t('settings.language')}</td>
                  <td className="py-2 px-3">
                    <TagSelector options={languageOptions} value={form.language || 'fr'} onChange={(v) => setForm({ ...form, language: v })} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Column 2: Entité & Accès + Authentification ── */}
          <div className="@container">
            <table className="w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[160px]" />
                <col />
              </colgroup>
              <tbody>
                <tr>
                  <td colSpan={2} className="pt-2 pb-1.5 px-3">
                    <SectionHeader><span className="flex items-center gap-1.5"><Building2 size={12} /> Entité & Accès</span></SectionHeader>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Type</td>
                  <td className="py-2 px-3">
                    <TagSelector
                      options={userTypeOptions}
                      value={form.user_type || 'internal'}
                      onChange={(v) => setForm({ ...form, user_type: v })}
                    />
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Entité par défaut</td>
                  <td className="py-2 px-3">
                    <select
                      value={form.default_entity_id || ''}
                      onChange={(e) => setForm({ ...form, default_entity_id: e.target.value || undefined })}
                      className="gl-form-select"
                    >
                      <option value="">— Aucune —</option>
                      {entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>{entity.name} ({entity.code})</option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Expiration</td>
                  <td className="py-2 px-3">
                    <input
                      type="date"
                      value={form.account_expires_at || ''}
                      onChange={(e) => setForm({ ...form, account_expires_at: e.target.value || undefined })}
                      className={cn(panelInputClass, 'max-w-[200px]')}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Vide = pas d'expiration.</p>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Rôles & Groupes</td>
                  <td className="py-2 px-3">
                    <p className="text-xs text-muted-foreground italic">Configurable après création.</p>
                  </td>
                </tr>

                {/* ── Sub-section: Authentification ── */}
                <tr>
                  <td colSpan={2} className="pt-5 pb-1.5 px-3">
                    <SectionHeader><span className="flex items-center gap-1.5"><Shield size={12} /> Authentification</span></SectionHeader>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">{t('auth.password')}</td>
                  <td className="py-2 px-3">
                    <input
                      type="password"
                      minLength={8}
                      value={form.password || ''}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className={panelInputClass}
                      placeholder="Min. 8 caractères"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Vide = mot de passe temporaire auto-généré.</p>
                  </td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 px-3 text-muted-foreground font-medium align-top whitespace-nowrap">Invitation</td>
                  <td className="py-2 px-3">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                      <div>
                        <span className="text-sm text-foreground group-hover:text-primary transition-colors">Envoyer un email d'invitation</span>
                        <p className="text-xs text-muted-foreground mt-0.5">Lien pour définir son mot de passe.</p>
                      </div>
                    </label>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionColumns>
      </form>
    </DynamicPanelShell>
  )
}

// ── User Entities Tab ───────────────────────────────────────

function UserEntitiesTab({ userId }: { userId: string }) {
  const { data: entities, isLoading } = useUserEntities(userId)
  const assignToEntity = useAssignUserToEntity()
  const removeFromEntity = useRemoveUserFromEntity()
  const { data: tierLinks } = useUserTierLinks(userId)
  const linkToTier = useLinkUserToTier()
  const unlinkFromTier = useUnlinkUserFromTier()
  const confirm = useConfirm()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [showTierPicker, setShowTierPicker] = useState(false)
  const [tierSearch, setTierSearch] = useState('')
  const { data: allEntitiesData } = useAllEntities({ page: 1, page_size: 200 })
  const { data: tiersData } = useTiers({ page: 1, page_size: 200, search: tierSearch || undefined })

  // Filter out entities the user already belongs to
  const availableEntities = useMemo(() => {
    if (!allEntitiesData?.items || !entities) return []
    const assignedIds = new Set(entities.map((e) => e.entity_id))
    return allEntitiesData.items.filter(
      (e) => !assignedIds.has(e.id) && e.active,
    )
  }, [allEntitiesData, entities])

  const filteredAvailable = useMemo(() => {
    if (!pickerSearch) return availableEntities
    const q = pickerSearch.toLowerCase()
    return availableEntities.filter(
      (e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q),
    )
  }, [availableEntities, pickerSearch])

  const handleAssign = useCallback(async (entityId: string) => {
    await assignToEntity.mutateAsync({ userId, entityId })
    setShowPicker(false)
    setPickerSearch('')
  }, [userId, assignToEntity])

  const handleRemove = useCallback(async (entityId: string, entityName: string) => {
    const ok = await confirm({
      title: 'Retirer de l\'entité ?',
      message: `L'utilisateur sera retiré de tous les groupes de l'entité "${entityName}". Cette action est réversible.`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    })
    if (ok) {
      removeFromEntity.mutate({ userId, entityId })
    }
  }, [userId, removeFromEntity, confirm])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Add to entity button / picker */}
      {showPicker ? (
        <div className="border border-border rounded-lg bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Ajouter à une entité</span>
            <button
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setShowPicker(false); setPickerSearch('') }}
            >
              <X size={14} />
            </button>
          </div>
          <input
            type="text"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className={panelInputClass}
            placeholder="Rechercher une entité..."
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filteredAvailable.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                {availableEntities.length === 0 ? 'Aucune entité disponible' : 'Aucun résultat'}
              </p>
            ) : (
              filteredAvailable.map((entity) => (
                <button
                  key={entity.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-accent transition-colors group"
                  onClick={() => handleAssign(entity.id)}
                  disabled={assignToEntity.isPending}
                >
                  <Building2 size={12} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground block truncate">{entity.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{entity.code}</span>
                  </div>
                  <Plus size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <button
          className="gl-button-sm gl-button-default flex items-center gap-1.5"
          onClick={() => setShowPicker(true)}
        >
          <Plus size={12} /> Ajouter à une entité
        </button>
      )}

      {/* Entity cards */}
      {!entities || entities.length === 0 ? (
        <div className="text-center py-6">
          <Building2 size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aucune entité assignée</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ajoutez cet utilisateur à une entité pour lui donner accès.
          </p>
        </div>
      ) : (
        entities.map((entity) => (
          <div key={entity.entity_id} className="border border-border rounded-lg p-3 space-y-2">
            {/* Entity header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 size={14} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <CrossModuleLink module="entities" id={entity.entity_id} label={entity.entity_name} showIcon={false} className="text-sm font-semibold" />
                  <span className="text-[10px] text-muted-foreground font-mono">{entity.entity_code}</span>
                </div>
              </div>
              <button
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Retirer de cette entité"
                onClick={() => handleRemove(entity.entity_id, entity.entity_name)}
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* Groups & Roles */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Groupes & Roles</span>
              {entity.groups.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun groupe</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {entity.groups.map((g) => (
                    <button
                      key={g.group_id}
                      onClick={() => useUIStore.getState().openDynamicPanel({ type: 'detail', module: 'groups', id: g.group_id })}
                      className="inline-flex items-center gap-1 gl-badge gl-badge-neutral text-[10px] cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
                      title={`Groupe: ${g.group_name} | Rôles: ${g.role_names.join(', ') || g.role_codes.join(', ')}`}
                    >
                      <KeyRound size={9} className="shrink-0" />
                      {g.group_name}
                      <span className="text-primary/80 font-semibold">
                        {g.role_names.join(', ') || g.role_codes.join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {/* ── Entreprises liées (Tier Links) ── */}
      <div className="border-t border-border pt-3 mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Entreprises liées</span>
          {!showTierPicker && (
            <button
              className="gl-button-sm gl-button-default flex items-center gap-1"
              onClick={() => setShowTierPicker(true)}
            >
              <Plus size={12} /> Lier une entreprise
            </button>
          )}
        </div>

        {showTierPicker && (
          <div className="border border-border rounded-lg bg-muted/30 p-3 space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Rechercher une entreprise</span>
              <button
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setShowTierPicker(false); setTierSearch('') }}
              >
                <X size={14} />
              </button>
            </div>
            <input
              type="text"
              value={tierSearch}
              onChange={(e) => setTierSearch(e.target.value)}
              className={panelInputClass}
              placeholder="Rechercher par nom ou code…"
              autoFocus
            />
            <div className="max-h-40 overflow-y-auto space-y-1">
              {(() => {
                const linkedIds = new Set((tierLinks ?? []).map((l) => l.tier_id))
                const available = (tiersData?.items ?? []).filter((t) => !linkedIds.has(t.id))
                if (available.length === 0) {
                  return <p className="text-xs text-muted-foreground py-2 text-center">Aucune entreprise disponible</p>
                }
                return available.slice(0, 20).map((tier) => (
                  <button
                    key={tier.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-accent transition-colors group"
                    onClick={async () => {
                      await linkToTier.mutateAsync({ userId, tierId: tier.id })
                      setShowTierPicker(false)
                      setTierSearch('')
                    }}
                    disabled={linkToTier.isPending}
                  >
                    <CreditCard size={12} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground block truncate">{tier.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{tier.code}</span>
                    </div>
                    <Plus size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))
              })()}
            </div>
          </div>
        )}

        {!tierLinks || tierLinks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Aucune entreprise liée</p>
        ) : (
          <div className="space-y-1.5">
            {tierLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
                <CreditCard size={13} className="text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <CrossModuleLink module="tiers" id={link.tier_id} label={link.tier_name} showIcon={false} className="text-sm font-medium truncate block" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground">{link.tier_code}</span>
                    {link.tier_type && <span className="gl-badge gl-badge-neutral text-[9px]">{link.tier_type}</span>}
                    <span className="gl-badge gl-badge-info text-[9px]">{link.role}</span>
                  </div>
                </div>
                <button
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Retirer le lien"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Retirer le lien ?',
                      message: `L'utilisateur ne sera plus lié à l'entreprise "${link.tier_name}".`,
                      confirmLabel: 'Retirer',
                      variant: 'danger',
                    })
                    if (ok) unlinkFromTier.mutate({ userId, linkId: link.id })
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

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

function UserDetailPanel({ id }: { id: string }) {
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
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2"
                  onClick={() => { avatarInputRef.current?.click() }}
                >
                  <Upload size={12} className="text-muted-foreground" />
                  Charger depuis le PC
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2"
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
                <FormSection title="Identité">
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
                  <InlineEditableCombobox label="Nationalité" value={user.nationality || ''} options={nationalityOptions} onSave={(v) => updateUser.mutate({ id, payload: { nationality: v || null } })} placeholder="Rechercher une nationalité..." />
                ) : (
                  <InlineEditableRow label="Nationalité" value={user.nationality || ''} onSave={(v) => updateUser.mutate({ id, payload: { nationality: v || null } })} />
                )}
                {countryOptions.length > 0 ? (
                  <InlineEditableCombobox label="Pays de naissance" value={user.birth_country || ''} options={countryOptions} onSave={(v) => updateUser.mutate({ id, payload: { birth_country: v || null } })} placeholder="Rechercher un pays..." />
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
                  <InlineEditableCombobox label="Poste / Fonction" value={user.job_position_id || ''} options={jobPositionOptions} onSave={(v) => updateUser.mutate({ id, payload: { job_position_id: v || null } })} placeholder="Sélectionner un poste..." />
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
                <FormSection title="Coordonnées" collapsible defaultExpanded storageKey="panel.user.sections" id="user-contact">
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
                  <InlineEditableCombobox label="Aéroport contractuel" value={user.contractual_airport || ''} options={airportOptions} onSave={(v) => updateUser.mutate({ id, payload: { contractual_airport: v || null } })} placeholder="Rechercher un aéroport..." />
                ) : (
                  <InlineEditableRow label="Aéroport contractuel" value={user.contractual_airport || ''} onSave={(v) => updateUser.mutate({ id, payload: { contractual_airport: v || null } })} />
                )}
                {airportOptions.length > 0 ? (
                  <InlineEditableCombobox label="Aéroport le plus proche" value={user.nearest_airport || ''} options={airportOptions} onSave={(v) => updateUser.mutate({ id, payload: { nearest_airport: v || null } })} placeholder="Rechercher un aéroport..." />
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

              <FormSection title="Activité">
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
              <FormSection title="Mensurations" collapsible storageKey="panel.user.sections" id="user-body">
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
              <FormSection title="Santé" collapsible storageKey="panel.user.sections" id="user-health">
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
              <FormSection title="Notes & Documents" collapsible storageKey="panel.user.sections" id="user-notes-files">
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
                      : <span className="gl-badge gl-badge-neutral text-[10px]">Désactivé</span>
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

              <FormSection title="Actions">
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
type AuditEntry = { id: string; action: string; resource_type: string; resource_id: string | null; ip_address: string | null; details: Record<string, unknown> | null; created_at: string }

const ACTION_BADGE_VARIANT: Record<string, string> = {
  create: 'gl-badge-success',
  login: 'gl-badge-info',
  update: 'gl-badge-warning',
  delete: 'gl-badge-danger',
  logout: 'gl-badge-neutral',
}

const getJournalColumns = (t: (key: string) => string): ColumnDef<AuditEntry>[] => [
  {
    accessorKey: 'created_at',
    header: t('users.journal.date'),
    cell: ({ getValue }) => {
      const v = getValue<string>()
      return <span className="text-xs tabular-nums text-muted-foreground">{new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    },
    size: 150,
  },
  {
    accessorKey: 'action',
    header: t('users.journal.action'),
    cell: ({ getValue }) => {
      const action = getValue<string>()
      const key = action.toLowerCase().split('.')[0]
      const variant = ACTION_BADGE_VARIANT[key] ?? 'gl-badge-neutral'
      return <span className={`gl-badge ${variant} text-[10px]`}>{action}</span>
    },
    size: 110,
  },
  {
    accessorKey: 'resource_type',
    header: t('users.journal.resource'),
    cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue<string>()}</span>,
    size: 110,
  },
  {
    accessorKey: 'resource_id',
    header: t('users.journal.id'),
    cell: ({ getValue }) => {
      const v = getValue<string | null>()
      return v ? <span className="text-xs font-mono text-primary truncate max-w-[120px] inline-block">{v}</span> : <span className="text-muted-foreground/50">—</span>
    },
    size: 100,
  },
  {
    id: 'details_summary',
    header: t('users.journal.details'),
    cell: ({ row }) => {
      const d = row.original.details
      if (!d || Object.keys(d).length === 0) return <span className="text-muted-foreground/50">—</span>
      const keys = Object.keys(d).slice(0, 3)
      return <span className="text-xs text-muted-foreground truncate max-w-[200px] inline-block">{keys.map(k => `${k}: ${String(d[k])}`).join(', ')}</span>
    },
  },
  {
    accessorKey: 'ip_address',
    header: t('users.journal.ip'),
    cell: ({ getValue }) => <span className="text-xs font-mono text-muted-foreground">{getValue<string>() ?? '—'}</span>,
    size: 110,
  },
]

function UserJournalTab({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const journalColumns = useMemo(() => getJournalColumns(t), [t])
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [data, setData] = useState<{ items: AuditEntry[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    import('@/lib/api').then(({ default: api }) => {
      api.get('/api/v1/audit-log', { params: { user_id: userId, page, page_size: pageSize } })
        .then(({ data: resp }) => {
          if (!cancelled) {
            setData({ items: resp.items ?? resp ?? [], total: resp.total ?? (resp.items ?? resp ?? []).length })
            setLoading(false)
          }
        })
        .catch(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true }
  }, [userId, page, pageSize])

  const total = data?.total ?? 0

  return (
    <DataTable
      data={data?.items ?? []}
      columns={journalColumns}
      pagination={{ page, pageSize, total, pages: Math.ceil(total / pageSize) || 1 }}
      onPaginationChange={(p, s) => { setPage(p); if (s && s !== pageSize) setPage(1) }}
      isLoading={loading}
      selectable={false}
      sortable
      columnVisibility
      defaultHiddenColumns={['resource_id', 'ip_address']}
      storageKey="user-journal"
    />
  )
}

// ── Permissions Tab (uses shared PermissionMatrix) ────────
import { PermissionMatrix } from '@/components/shared/PermissionMatrix'

function UserPermissionsTab({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('admin.rbac')
  const { data: overridesData } = useUserPermissionOverrides(userId)
  const setOverrides = useSetUserPermissionOverrides()
  const { toast } = useToast()

  const userOverrideSet = useMemo(() => {
    return new Set((overridesData ?? []).map((o: { permission_code: string }) => o.permission_code))
  }, [overridesData])

  const handleToggle = useCallback((code: string, granted: boolean) => {
    const current = (overridesData ?? []) as { permission_code: string; granted: boolean }[]
    const existing = current.find(o => o.permission_code === code)

    let newOverrides: { permission_code: string; granted: boolean }[]
    if (existing) {
      if (existing.granted === granted) {
        // Remove override (revert to role/group default)
        newOverrides = current.filter(o => o.permission_code !== code)
      } else {
        newOverrides = current.map(o => o.permission_code === code ? { ...o, granted } : o)
      }
    } else {
      newOverrides = [...current, { permission_code: code, granted }]
    }

    setOverrides.mutate(
      { userId, overrides: newOverrides },
      {
        onSuccess: () => toast({ title: granted ? t('users.toast.permission_granted') : t('users.toast.permission_revoked'), variant: 'success' }),
        onError: () => toast({ title: t('users.toast.permission_error'), variant: 'error' }),
      },
    )
  }, [userId, overridesData, setOverrides, toast])

  return (
    <PermissionMatrix
      userId={userId}
      editable={canEdit}
      onToggle={handleToggle}
      userOverrides={userOverrideSet}
    />
  )
}
// ── Overview Dashboard ─────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AccountsOverview({ onNavigate, onCreateGroup }: { onNavigate: (tab: AccountsTab) => void; onCreateGroup: () => void }) {
  const { t } = useTranslation()
  const { data: usersData, isLoading: usersLoading } = useUsers({ page: 1, page_size: 1 })
  const { data: activeUsersData } = useUsers({ page: 1, page_size: 1, active: true })
  const { data: userStats } = useUsersStats()
  const { data: roles, isLoading: rolesLoading } = useRoles()
  const { data: groupsData, isLoading: groupsLoading } = useGroups({ page: 1, page_size: 1 })
  const { data: recentData } = useRecentActivity(5)
  const { hasPermission: hasPerm } = usePermission()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setDynamicPanelMode = useUIStore((s) => s.setDynamicPanelMode)

  const openFullScreen = useCallback((view: Parameters<typeof openDynamicPanel>[0]) => {
    setDynamicPanelMode('full')
    openDynamicPanel(view)
  }, [setDynamicPanelMode, openDynamicPanel])

  const totalUsers = usersData?.total ?? 0
  const activeUsers = activeUsersData?.total ?? 0
  const inactiveUsers = totalUsers - activeUsers
  const onlineUsers = userStats?.online ?? 0
  const totalRoles = roles?.length ?? 0
  const totalGroups = groupsData?.total ?? 0
  const anyLoading = usersLoading || rolesLoading || groupsLoading

  const stats: { label: string; value: number; icon: React.ElementType; color: string; bg: string; tab: AccountsTab; pulse?: boolean }[] = [
    { label: 'Utilisateurs', value: totalUsers, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', tab: 'users' },
    { label: 'Actifs', value: activeUsers, icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', tab: 'users' },
    { label: 'En ligne', value: onlineUsers, icon: Wifi, color: 'text-green-500', bg: 'bg-green-500/10', tab: 'users', pulse: true },
    { label: 'Archivés', value: inactiveUsers, icon: UserX, color: 'text-amber-500', bg: 'bg-amber-500/10', tab: 'users' },
    { label: 'Groupes', value: totalGroups, icon: KeyRound, color: 'text-violet-500', bg: 'bg-violet-500/10', tab: 'groups' },
    { label: 'Rôles', value: totalRoles, icon: Shield, color: 'text-indigo-500', bg: 'bg-indigo-500/10', tab: 'roles' },
  ]

  const quickActions = [
    ...(hasPerm('user.create') || hasPerm('core.users.manage') ? [{ label: t('users.create'), icon: UserCheck, onClick: () => openFullScreen({ type: 'create', module: 'users' }) }] : []),
    { label: 'Nouveau groupe', icon: KeyRound, onClick: () => onCreateGroup() },
    { label: 'Voir les rôles', icon: Shield, onClick: () => onNavigate('roles') },
    { label: 'Voir les utilisateurs', icon: Users, onClick: () => onNavigate('users') },
  ]

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((card) => {
          const Icon = card.icon
          return (
            <button key={card.label} onClick={() => onNavigate(card.tab)} className="rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm text-left cursor-pointer group">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  {card.label}
                  {card.pulse && card.value > 0 && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
                </span>
                <div className={cn('h-7 w-7 rounded-md flex items-center justify-center', card.bg)}>
                  <Icon size={14} className={card.color} />
                </div>
              </div>
              <div className="mt-2">
                {anyLoading ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-2xl font-bold text-foreground tabular-nums group-hover:text-primary transition-colors">{card.value}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Actions rapides</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={action.onClick}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-card text-left hover:border-primary/30 hover:bg-primary/[0.02] transition-all group"
              >
                <Icon size={14} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{action.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Recent activity widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent users */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            <span className="flex items-center gap-1.5"><Users size={11} /> Derniers utilisateurs</span>
          </h3>
          <div className="space-y-1">
            {!recentData ? (
              <Loader2 size={14} className="animate-spin text-muted-foreground mx-auto mt-2" />
            ) : recentData.users.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Aucun utilisateur</p>
            ) : (
              recentData.users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => openDynamicPanel({ type: 'detail', module: 'users', id: u.id })}
                  className="flex items-center gap-2.5 w-full p-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
                >
                  <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0', getAvatarColor(`${u.first_name} ${u.last_name}`))}>
                    {u.first_name?.[0]}{u.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{u.first_name} {u.last_name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{relativeTime(u.updated_at)}</div>
                  </div>
                  <span className={cn(
                    'text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                    u.action === 'created' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'
                  )}>
                    {u.action === 'created' ? 'Créé' : 'Modifié'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Recent groups */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            <span className="flex items-center gap-1.5"><KeyRound size={11} /> Derniers groupes</span>
          </h3>
          <div className="space-y-1">
            {!recentData ? (
              <Loader2 size={14} className="animate-spin text-muted-foreground mx-auto mt-2" />
            ) : recentData.groups.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Aucun groupe</p>
            ) : (
              recentData.groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onNavigate('groups')}
                  className="flex items-center gap-2.5 w-full p-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                    <KeyRound size={12} className="text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{g.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{g.role_names?.join(', ') || g.role_codes?.join(', ') || '—'} · {g.member_count} membre{g.member_count !== 1 ? 's' : ''} · {relativeTime(g.updated_at)}</div>
                  </div>
                  <span className={cn(
                    'text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                    g.action === 'created' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'
                  )}>
                    {g.action === 'created' ? 'Créé' : 'Modifié'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Recent roles */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            <span className="flex items-center gap-1.5"><Shield size={11} /> Derniers rôles</span>
          </h3>
          <div className="space-y-1">
            {!recentData ? (
              <Loader2 size={14} className="animate-spin text-muted-foreground mx-auto mt-2" />
            ) : recentData.roles.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Aucun rôle</p>
            ) : (
              recentData.roles.map((r) => (
                <button
                  key={r.code}
                  onClick={() => onNavigate('roles')}
                  className="flex items-center gap-2.5 w-full p-1.5 rounded-md hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="h-7 w-7 rounded-md bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <Shield size={12} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{r.module ?? 'core'} · {relativeTime(r.updated_at)}</div>
                  </div>
                  <span className={cn(
                    'text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                    r.action === 'created' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'
                  )}>
                    {r.action === 'created' ? 'Créé' : 'Modifié'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Batch Assignment Modal ─────────────────────────────────
interface BatchAssignItem {
  id: string
  label: string
  sublabel?: string
  meta?: string
  badge?: string
  icon?: import('lucide-react').LucideIcon
  iconClassName?: string
}

function BatchAssignModal({ title, subtitle, searchPlaceholder, items, isPending, onSelect, onClose }: {
  title: string
  subtitle: string
  searchPlaceholder: string
  items: BatchAssignItem[]
  isPending: boolean
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      i.sublabel?.toLowerCase().includes(q) ||
      i.badge?.toLowerCase().includes(q)
    )
  }, [items, search])

  return (
    <div className="gl-modal-backdrop" onClick={onClose}>
      <div className="gl-modal-card !bg-card !max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="gl-input w-full text-sm"
        />
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Aucun résultat</p>
          ) : filtered.map((item) => {
            const Icon = item.icon
            return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              disabled={isPending}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/50 flex items-center gap-2.5 transition-colors group"
            >
              {Icon && <Icon size={13} className={cn('shrink-0', item.iconClassName)} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{item.label}</span>
                  {item.badge && <span className="gl-badge gl-badge-neutral text-[9px] shrink-0">{item.badge}</span>}
                </div>
                {item.sublabel && <p className="text-[11px] text-muted-foreground truncate">{item.sublabel}</p>}
              </div>
              {item.meta && <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">{item.meta}</span>}
            </button>
            )
          })}
        </div>
        <button onClick={onClose} className="gl-button-sm gl-button-default w-full text-xs">Annuler</button>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
void AccountsOverview // keep for reference — replaced by ModuleDashboard
type AccountsTab = 'overview' | 'users' | 'groups' | 'roles'

export function UsersPage() {
  const { t } = useTranslation()
  const userColumns = useMemo(() => getUserColumns(t), [t])
  const [activeTab, setActiveTab] = useState<AccountsTab>('overview')
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [statusFilterValue, setStatusFilterValue] = useState<string | undefined>(undefined)
  const [userTypeFilter, setUserTypeFilter] = useState<string | undefined>(undefined)
  const [mfaFilter, setMfaFilter] = useState<string | undefined>(undefined)
  // Counter to trigger create in child Roles/Groups tabs
  const [createTrigger, setCreateTrigger] = useState(0)

  const search = useUIStore((s) => s.globalSearch)
  const setGlobalSearch = useUIStore((s) => s.setGlobalSearch)
  const debouncedSearch = useDebounce(search, 300)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  // Reset pagination when search changes
  useEffect(() => { setPage(1) }, [debouncedSearch])

  // Server-side filters
  const activeFilter = statusFilterValue === 'active' ? true : statusFilterValue === 'archived' ? false : undefined
  const userTypeParam = userTypeFilter && userTypeFilter !== 'all' ? userTypeFilter : undefined
  const mfaParam = mfaFilter === 'enabled' ? true : mfaFilter === 'disabled' ? false : undefined
  const { data, isLoading } = useUsers({ page, page_size: pageSize, search: debouncedSearch || undefined, active: activeFilter, user_type: userTypeParam, mfa_enabled: mfaParam })

  // Deep link: /users#create
  useEffect(() => {
    if (window.location.hash === '#create') {
      openDynamicPanel({ type: 'create', module: 'users' })
    }
  }, [openDynamicPanel])

  const items = data?.items ?? []

  // Set navigation items for the dynamic panel
  useEffect(() => {
    if (items.length > 0) {
      setNavItems(items.map((u) => u.id))
    }
    return () => setNavItems([])
  }, [items, setNavItems])

  // Batch actions
  const updateUser = useUpdateUser()
  const batchPasswordReset = useSendPasswordReset()
  const confirm = useConfirm()
  const { hasPermission } = usePermission()
  const canManageUsers = hasPermission('core.users.manage')
  const canCreateUser = hasPermission('user.create') || canManageUsers
  const canManageRbac = hasPermission('core.rbac.manage')
  const canManageEntities = hasPermission('core.entity.update')
  const [batchGroupUserIds, setBatchGroupUserIds] = useState<string[] | null>(null)
  const [batchEntityUserIds, setBatchEntityUserIds] = useState<string[] | null>(null)
  const addGroupMembers = useAddGroupMembers()
  const assignToEntity = useAssignUserToEntity()
  const { data: allGroupsForPicker } = useGroups({ page: 1, page_size: 200 })
  const { data: allEntitiesForPicker } = useAllEntities({ page: 1, page_size: 200 })
  const batchActions: DataTableBatchAction<UserRead>[] = useMemo(() => {
    const actions: DataTableBatchAction<UserRead>[] = []
    if (canManageUsers) {
      actions.push(
        {
          id: 'reset-password',
          label: 'Réinitialiser le mot de passe',
          icon: KeyRound,
          onAction: async (rows) => {
            const ok = await confirm({
              title: `Réinitialiser le mot de passe de ${rows.length} utilisateur${rows.length > 1 ? 's' : ''} ?`,
              message: 'Un email de réinitialisation sera envoyé à chaque utilisateur sélectionné.',
              confirmLabel: 'Réinitialiser',
            })
            if (!ok) return
            await Promise.all(rows.map((r) => batchPasswordReset.mutateAsync(r.email)))
          },
        },
        {
          id: 'activate',
          label: 'Activer',
          icon: UserCheck,
          onAction: async (rows) => {
            const inactiveRows = rows.filter((r) => !r.active)
            if (inactiveRows.length === 0) return
            await Promise.all(
              inactiveRows.map((r) => updateUser.mutateAsync({ id: r.id, payload: { active: true } }))
            )
          },
        },
        {
          id: 'deactivate',
          label: 'Désactiver',
          icon: UserX,
          variant: 'danger' as const,
          onAction: async (rows) => {
            const activeRows = rows.filter((r) => r.active)
            if (activeRows.length === 0) return
            const ok = await confirm({
              title: `Désactiver ${activeRows.length} utilisateur${activeRows.length > 1 ? 's' : ''} ?`,
              message: 'Les utilisateurs sélectionnés seront archivés et ne pourront plus se connecter.',
              confirmLabel: 'Désactiver',
              variant: 'danger',
            })
            if (!ok) return
            await Promise.all(
              activeRows.map((r) => updateUser.mutateAsync({ id: r.id, payload: { active: false } }))
            )
          },
        },
        {
          id: 'unlock',
          label: 'Déverrouiller',
          icon: Unlock,
          onAction: async (rows) => {
            const locked = rows.filter((r) => r.failed_login_count > 0 || (r.locked_until && new Date(r.locked_until) > new Date()))
            if (locked.length === 0) return
            await Promise.all(
              locked.map((r) => updateUser.mutateAsync({ id: r.id, payload: { failed_login_count: 0, locked_until: null } }))
            )
          },
        },
        {
          id: 'set-user-type',
          label: 'Changer le type',
          icon: Shield,
          onAction: async (rows) => {
            const ok = await confirm({
              title: `Changer le type de ${rows.length} utilisateur${rows.length > 1 ? 's' : ''} ?`,
              message: 'Interne = accès entité, Externe = accès limité aux entreprises liées.',
              confirmLabel: 'Interne',
              cancelLabel: 'Externe',
            })
            const newType = ok ? 'internal' : 'external'
            await Promise.all(rows.map((r) => updateUser.mutateAsync({ id: r.id, payload: { user_type: newType } })))
          },
        },
      )
    }
    if (canManageRbac) {
      actions.push({
        id: 'assign-group',
        label: 'Affecter à un groupe',
        icon: Users,
        onAction: (rows) => {
          setBatchGroupUserIds(rows.map((r) => r.id))
        },
      })
    }
    if (canManageEntities) {
      actions.push({
        id: 'assign-entity',
        label: 'Affecter à une entité',
        icon: Building2,
        onAction: (rows) => {
          setBatchEntityUserIds(rows.map((r) => r.id))
        },
      })
    }
    return actions
  }, [updateUser, batchPasswordReset, confirm, canManageUsers, canManageRbac, canManageEntities])

  const filterDefs: DataTableFilterDef[] = useMemo(() => [
    {
      id: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous', count: data?.total },
        { value: 'active', label: 'Actifs' },
        { value: 'archived', label: 'Archivés' },
      ],
    },
    {
      id: 'user_type',
      label: 'Type',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous' },
        { value: 'internal', label: 'Interne' },
        { value: 'external', label: 'Externe' },
      ],
    },
    {
      id: 'mfa',
      label: 'MFA',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous' },
        { value: 'enabled', label: 'Activé' },
        { value: 'disabled', label: 'Désactivé' },
      ],
    },
  ], [data])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && (dynamicPanel.module === 'users' || dynamicPanel.module === 'groups' || dynamicPanel.module === 'roles')

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader
            icon={Users}
            title={t('nav.accounts', 'Comptes')}
            subtitle={
              activeTab === 'overview' ? 'Vue d\'ensemble des comptes'
              : activeTab === 'users' ? t('users.subtitle')
              : activeTab === 'groups' ? 'Gestion des groupes utilisateurs'
              : 'Gestion des rôles et permissions associées'
            }
          >
            {activeTab === 'users' && canCreateUser && (
              <ToolbarButton
                icon={Plus}
                label={t('users.create')}
                variant="primary"
                onClick={() => openDynamicPanel({ type: 'create', module: 'users' })}
              />
            )}
            {activeTab === 'groups' && (
              <ToolbarButton
                icon={Plus}
                label="Nouveau groupe"
                variant="primary"
                onClick={() => setCreateTrigger((c) => c + 1)}
              />
            )}
            {activeTab === 'roles' && (
              <ToolbarButton
                icon={Plus}
                label="Nouveau rôle"
                variant="primary"
                onClick={() => setCreateTrigger((c) => c + 1)}
              />
            )}
          </PanelHeader>

          {/* Tab bar */}
          <PageNavBar
            items={[
              { id: 'overview' as const, label: 'Vue d\'ensemble', icon: LayoutDashboard },
              { id: 'users' as const, label: t('users.title'), icon: Users },
              { id: 'groups' as const, label: 'Groupes', icon: KeyRound },
              { id: 'roles' as const, label: 'Rôles', icon: Shield },
            ]}
            activeId={activeTab}
            onTabChange={setActiveTab}
          />

          <div className="flex-1 min-h-0">
          {activeTab === 'overview' ? (
              <ModuleDashboard module="users" />
          ) : activeTab === 'groups' ? (
              <GroupsTab
                externalSearch={search || ''}
                createTrigger={createTrigger}
                onOpenPanel={openDynamicPanel as (view: { type: string; module: string; id?: string }) => void}
              />
          ) : activeTab === 'roles' ? (
              <RolesTab
                externalSearch={search || ''}
                createTrigger={createTrigger}
                onOpenPanel={openDynamicPanel as (view: { type: string; module: string; id?: string }) => void}
              />
          ) : (
          <>

          <DataTable<UserRead>
            columns={userColumns}
            data={items}
            isLoading={isLoading}
            getRowId={(row) => row.id}
            storageKey="users"

            searchValue={search || ''}
            onSearchChange={(v) => { setGlobalSearch(v); setPage(1) }}

            pagination={data ? {
              page: data.page,
              pageSize: data.page_size,
              total: data.total,
              pages: data.pages,
            } : undefined}
            onPaginationChange={(p, size) => {
              setPage(p)
              setPageSize(size)
            }}

            sortable
            filters={filterDefs}
            activeFilters={{ status: statusFilterValue, user_type: userTypeFilter, mfa: mfaFilter }}
            onFilterChange={(id, value) => {
              if (id === 'status') { setStatusFilterValue(value as string | undefined); setPage(1) }
              if (id === 'user_type') { setUserTypeFilter(value as string | undefined); setPage(1) }
              if (id === 'mfa') { setMfaFilter(value as string | undefined); setPage(1) }
            }}
            autoColumnFilters

            columnVisibility
            defaultHiddenColumns={defaultHiddenUserColumns}

            selectable
            batchActions={batchActions}

            viewModes={['table', 'grid']}
            defaultViewMode="table"
            cardRenderer={(props) => <UserCard {...props} />}

            importExport={{
              exportFormats: ['csv', 'xlsx', 'pdf'],
              advancedExport: true,
              filenamePrefix: 'utilisateurs',
              importWizardTarget: 'user',
              exportHeaders: {
                name: 'Nom',
                email: 'Email',
                intranet_id: 'ID Intranet',
                auth_type: 'Authentification',
                mfa: 'MFA',
                language: 'Langue',
                active: 'Statut',
                user_type: 'Type (Interne/Externe)',
                created_at: 'Créé le',
                last_login_at: 'Dernière connexion',
                passport_name: 'Nom passeport',
                gender: 'Genre',
                nationality: 'Nationalité',
                birth_country: 'Pays de naissance',
                birth_city: 'Ville de naissance',
                birth_date: 'Date de naissance',
                contractual_airport: 'Aéroport contractuel',
                nearest_airport: 'Aéroport proche',
                nearest_station: 'Gare la plus proche',
                loyalty_program: 'Programme fidélité',
                last_medical_check: 'Visite médicale',
                last_international_medical_check: 'Visite méd. internationale',
                last_subsidiary_medical_check: 'Visite méd. filiale',
                height: 'Taille (cm)',
                weight: 'Poids (kg)',
                ppe_clothing_size: 'Taille vêtement haut',
                ppe_clothing_size_bottom: 'Taille vêtement bas',
                ppe_shoe_size: 'Pointure',
                retirement_date: 'Date retraite',
                vantage_number: 'N° Vantage',
                extension_number: 'N° Poste',
                last_login_ip: 'Dernière IP',
                failed_login_count: 'Échecs connexion',
                password_changed_at: 'Mot de passe modifié',
                account_expires_at: 'Expiration compte',
                updated_at: 'Modifié le',
              },
              importTemplate: {
                filename: 'modele_utilisateurs',
                includeExamples: true,
                columns: [
                  { key: 'email', label: 'Email', required: true, example: 'john.doe@company.com' },
                  { key: 'first_name', label: 'Prénom', required: true, example: 'John' },
                  { key: 'last_name', label: 'Nom', required: true, example: 'DOE' },
                  { key: 'password', label: 'Mot de passe', example: 'MotDePasse@2026!' },
                  { key: 'intranet_id', label: 'ID Intranet', example: 'JD1234' },
                  { key: 'language', label: 'Langue (fr/en)', example: 'fr' },
                  { key: 'passport_name', label: 'Nom passeport', example: 'DOE John' },
                  { key: 'gender', label: 'Genre (M/F/X)', example: 'M' },
                  { key: 'nationality', label: 'Nationalité', example: 'Française' },
                  { key: 'birth_country', label: 'Pays de naissance', example: 'France' },
                  { key: 'birth_city', label: 'Ville de naissance', example: 'Paris' },
                  { key: 'birth_date', label: 'Date de naissance (YYYY-MM-DD)', example: '1985-06-15' },
                  { key: 'contractual_airport', label: 'Aéroport contractuel', example: 'DLA' },
                  { key: 'nearest_airport', label: 'Aéroport proche', example: 'CDG' },
                  { key: 'nearest_station', label: 'Gare la plus proche', example: 'Gare du Nord' },
                  { key: 'loyalty_program', label: 'Programme fidélité', example: 'AF-123456' },
                  { key: 'height', label: 'Taille (cm)', example: '178' },
                  { key: 'weight', label: 'Poids (kg)', example: '75' },
                  { key: 'ppe_clothing_size', label: 'Taille vêtement haut', example: 'L' },
                  { key: 'ppe_clothing_size_bottom', label: 'Taille vêtement bas', example: 'M' },
                  { key: 'ppe_shoe_size', label: 'Pointure', example: '43' },
                  { key: 'retirement_date', label: 'Date retraite (YYYY-MM-DD)', example: '2045-12-31' },
                  { key: 'vantage_number', label: 'N° Vantage', example: 'V-12345' },
                  { key: 'extension_number', label: 'N° Poste', example: '4567' },
                ],
              },
            }}

            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'users', id: row.id })}

            columnResizing
            columnPinning
            defaultPinnedColumns={{ left: ['name'] }}

            emptyIcon={Users}
            emptyTitle={t('common.no_results')}
          />
          </>
          )}
          </div>
        </div>
      )}

      {dynamicPanel?.module === 'users' && dynamicPanel.type === 'create' && <CreateUserPanel />}
      {dynamicPanel?.module === 'users' && dynamicPanel.type === 'detail' && <UserDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'groups' && dynamicPanel.type === 'create' && <GroupCreatePanelWrapper />}
      {dynamicPanel?.module === 'groups' && dynamicPanel.type === 'detail' && <GroupDetailPanelWrapper id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'roles' && dynamicPanel.type === 'detail' && <RoleDetailPanelWrapper code={dynamicPanel.id} />}

      {/* Batch group assignment modal */}
      {batchGroupUserIds && (
        <BatchAssignModal
          title="Affecter à un groupe"
          subtitle={`${batchGroupUserIds.length} utilisateur${batchGroupUserIds.length > 1 ? 's' : ''} sélectionné${batchGroupUserIds.length > 1 ? 's' : ''}`}
          searchPlaceholder="Rechercher un groupe..."
          items={(allGroupsForPicker?.items ?? []).map((g) => ({
            id: g.id,
            label: g.name,
            sublabel: g.role_names.join(', ') || g.role_codes.join(', ') || 'Aucun rôle',
            meta: `${g.member_count} membre${g.member_count !== 1 ? 's' : ''}`,
            badge: g.entity_name || undefined,
            icon: Users,
            iconClassName: 'text-violet-500',
          }))}
          isPending={addGroupMembers.isPending}
          onSelect={(groupId) => {
            addGroupMembers.mutate(
              { groupId, userIds: batchGroupUserIds },
              { onSuccess: () => setBatchGroupUserIds(null) },
            )
          }}
          onClose={() => setBatchGroupUserIds(null)}
        />
      )}

      {/* Batch entity assignment modal */}
      {batchEntityUserIds && (
        <BatchAssignModal
          title="Affecter à une entité"
          subtitle={`${batchEntityUserIds.length} utilisateur${batchEntityUserIds.length > 1 ? 's' : ''} sélectionné${batchEntityUserIds.length > 1 ? 's' : ''}`}
          searchPlaceholder="Rechercher une entité..."
          items={(allEntitiesForPicker?.items ?? []).filter((e) => e.active).map((e) => ({
            id: e.id,
            label: e.name,
            sublabel: e.code,
            meta: `${e.user_count} utilisateur${e.user_count !== 1 ? 's' : ''}`,
            badge: e.country || undefined,
            icon: Building2,
            iconClassName: 'text-blue-500',
          }))}
          isPending={assignToEntity.isPending}
          onSelect={async (entityId) => {
            await Promise.all(batchEntityUserIds.map((uid) => assignToEntity.mutateAsync({ userId: uid, entityId })))
            setBatchEntityUserIds(null)
          }}
          onClose={() => setBatchEntityUserIds(null)}
        />
      )}
    </div>
  )
}

// ── Group DynamicPanel wrappers ───────────────────────────────
function GroupCreatePanelWrapper() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  return (
    <DynamicPanelShell title="Nouveau groupe" onClose={closeDynamicPanel}>
      <CreateGroupForm onClose={closeDynamicPanel} />
    </DynamicPanelShell>
  )
}

function GroupDetailPanelWrapper({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  return <GroupDetailPanel groupId={id} onClose={closeDynamicPanel} inline={false} />
}

function RoleDetailPanelWrapper({ code }: { code: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  return <RoleDetailPanel code={code} onClose={closeDynamicPanel} inline={false} />
}

// ── Module-level renderer registration ─────────────────────
registerPanelRenderer('users', (view) => {
  if (view.type === 'create') return <CreateUserPanel />
  if (view.type === 'detail' && 'id' in view) return <UserDetailPanel id={view.id} />
  return null
})

registerPanelRenderer('groups', (view) => {
  if (view.type === 'create') return <GroupCreatePanelWrapper />
  if (view.type === 'detail' && 'id' in view) return <GroupDetailPanelWrapper id={view.id} />
  return null
})

registerPanelRenderer('roles', (view) => {
  if (view.type === 'detail' && 'id' in view) return <RoleDetailPanelWrapper code={view.id} />
  return null
})
