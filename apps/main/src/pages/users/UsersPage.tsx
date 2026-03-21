/**
 * Users page — powered by DataTable universal component.
 *
 * Features:
 * - Table & Grid views via DataTable viewModes
 * - Sorting, filtering, pagination, column visibility
 * - Row selection with batch actions
 * - Avatar cells
 * - CSV export
 * - Rich create & detail panels
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users, Plus, Loader2,
  UserCheck, UserX, Calendar, Clock,
  CheckSquare, Square, Shield, KeyRound, LogOut,
  Building2, Trash2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  SectionColumns,
  InlineEditableRow,
  InlineEditableTags,
  ReadOnlyRow,
  PanelActionButton,
  SectionHeader,
  TagSelector,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useUsers, useUser, useCreateUser, useUpdateUser, useRevokeAllSessions, useUserEntities, useAssignUserToEntity, useRemoveUserFromEntity } from '@/hooks/useUsers'
import { useAllEntities } from '@/hooks/useEntities'
import { usePageSize } from '@/hooks/usePageSize'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { RolesTab, GroupsTab, PermissionsTab, GroupDetailPanel, CreateGroupForm } from '@/pages/settings/tabs/RbacAdminTab'
import { useUserRoles, useUserGroups } from '@/hooks/useSettings'
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

const LANGUAGE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
]

// ── Column definitions ─────────────────────────────────────
const userColumns: ColumnDef<UserRead, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Nom',
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
    header: 'Email',
    cell: ({ getValue }) => (
      <span className="text-muted-foreground truncate max-w-[200px] block">
        {getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: 'language',
    header: 'Langue',
    cell: ({ getValue }) => (
      <span className="uppercase text-xs text-muted-foreground font-medium">
        {getValue() as string}
      </span>
    ),
    size: 80,
  },
  {
    accessorKey: 'active',
    header: 'Statut',
    cell: ({ getValue }) => {
      const active = getValue() as boolean
      return <BadgeCell value={active ? 'Actif' : 'Archivé'} variant={active ? 'success' : 'neutral'} />
    },
    size: 90,
  },
  {
    accessorKey: 'created_at',
    header: 'Créé le',
    cell: ({ getValue }) => <DateCell value={getValue() as string} />,
    size: 110,
  },
  {
    accessorKey: 'last_login_at',
    header: 'Dernière connexion',
    cell: ({ getValue }) => <DateCell value={getValue() as string | null} relative />,
    size: 140,
  },
]

// ── User Card (for grid view) ──────────────────────────────
function UserCard({ row: user, selected, onSelect, onClick }: CardRendererProps<UserRead>) {
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`
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

      <div className="flex items-center justify-center gap-2 mt-3">
        <span className={cn('gl-badge', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
          {user.active ? 'Actif' : 'Archivé'}
        </span>
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
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const [form, setForm] = useState<UserCreate>({
    email: '', first_name: '', last_name: '', password: '', language: 'fr',
  })
  const [sendInvite, setSendInvite] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createUser.mutateAsync(normalizeNames(form))
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('users.create')}
      subtitle={t('users.title')}
      icon={<Users size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createUser.isPending}
            onClick={() => (document.getElementById('create-user-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createUser.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-user-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <SectionColumns>
          {/* Column 1: Identity + Language */}
          <div className="@container space-y-5">
            <FormSection title={t('common.details')}>
              <FormGrid>
                <DynamicPanelField label={t('users.first_name')} required>
                  <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} placeholder="Jean" />
                </DynamicPanelField>
                <DynamicPanelField label={t('users.last_name')} required>
                  <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} placeholder="Dupont" />
                </DynamicPanelField>
              </FormGrid>
              <DynamicPanelField label="Email" required>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={panelInputClass} placeholder="jean.dupont@perenco.com" />
              </DynamicPanelField>
            </FormSection>

            <FormSection title={t('settings.language')}>
              <TagSelector options={LANGUAGE_OPTIONS} value={form.language || 'fr'} onChange={(v) => setForm({ ...form, language: v })} />
            </FormSection>
          </div>

          {/* Column 2: Invitation + Auth + Access */}
          <div className="@container space-y-5">
            <FormSection title="Invitation" collapsible storageKey="panel.user.sections" id="user-invitation">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <div>
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">Envoyer un email d'invitation</span>
                  <p className="text-xs text-muted-foreground mt-0.5">L'utilisateur recevra un lien pour définir son mot de passe.</p>
                </div>
              </label>
            </FormSection>

            <FormSection title="Authentification" collapsible defaultExpanded={false} storageKey="panel.user.sections" id="user-auth">
              <DynamicPanelField label={t('auth.password')}>
                <input type="password" minLength={8} value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} className={panelInputClass} placeholder="Min. 8 caractères (auto-généré si vide)" />
                <p className="text-xs text-muted-foreground mt-1">Laissez vide pour générer automatiquement un mot de passe temporaire.</p>
              </DynamicPanelField>
            </FormSection>

            <FormSection title="Accès" collapsible defaultExpanded={false} storageKey="panel.user.sections" id="user-access">
              <p className="text-xs text-muted-foreground">Les rôles et groupes pourront être configurés après la création de l'utilisateur.</p>
            </FormSection>
          </div>
        </SectionColumns>
      </form>
    </DynamicPanelShell>
  )
}

// ── User Entities Tab ───────────────────────────────────────
type UserDetailTab = 'infos' | 'entities'

function UserEntitiesTab({ userId }: { userId: string }) {
  const { data: entities, isLoading } = useUserEntities(userId)
  const assignToEntity = useAssignUserToEntity()
  const removeFromEntity = useRemoveUserFromEntity()
  const confirm = useConfirm()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const { data: allEntitiesData } = useAllEntities({ page: 1, page_size: 200 })

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
            <span className="text-xs font-medium text-foreground">Ajouter a une entite</span>
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
            placeholder="Rechercher une entite..."
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filteredAvailable.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                {availableEntities.length === 0 ? 'Aucune entite disponible' : 'Aucun resultat'}
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
          <Plus size={12} /> Ajouter a une entite
        </button>
      )}

      {/* Entity cards */}
      {!entities || entities.length === 0 ? (
        <div className="text-center py-6">
          <Building2 size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aucune entite assignee</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ajoutez cet utilisateur a une entite pour lui donner acces.
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
                  <h4 className="text-sm font-semibold text-foreground truncate">{entity.entity_name}</h4>
                  <span className="text-[10px] text-muted-foreground font-mono">{entity.entity_code}</span>
                </div>
              </div>
              <button
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Retirer de cette entite"
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
                    <span
                      key={g.group_id}
                      className="inline-flex items-center gap-1 gl-badge gl-badge-neutral text-[10px]"
                      title={`Groupe: ${g.group_name} | Role: ${g.role_name ?? g.role_code}`}
                    >
                      <KeyRound size={9} className="shrink-0" />
                      {g.group_name}
                      <span className="text-primary/80 font-semibold">
                        {g.role_name ?? g.role_code}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── User Detail Panel (with inline editing) ────────────────
function UserDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: user } = useUser(id)
  const updateUser = useUpdateUser()
  const revokeAllSessions = useRevokeAllSessions()
  const { data: roles } = useUserRoles()
  const { data: groups } = useUserGroups()
  const { data: userEntities } = useUserEntities(id)
  const [detailTab, setDetailTab] = useState<UserDetailTab>('infos')

  const handleInlineSave = useCallback((field: string, value: string) => {
    updateUser.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateUser])

  const handleToggleActive = useCallback(() => {
    if (!user) return
    updateUser.mutate({ id, payload: { active: !user.active } })
  }, [id, user, updateUser])

  const handleRevokeSessions = useCallback(() => {
    revokeAllSessions.mutate()
  }, [revokeAllSessions])

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

  return (
    <DynamicPanelShell
      title={`${user.first_name} ${user.last_name}`}
      subtitle={user.email}
      icon={
        user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className={cn('h-7 w-7 flex items-center justify-center rounded-full font-semibold text-white text-[10px]', getAvatarColor(`${user.first_name}${user.last_name}`))}>
            {`${user.first_name[0] || ''}${user.last_name[0] || ''}`}
          </div>
        )
      }
      actions={
        <>
          <PanelActionButton
            variant={user.active ? 'danger' : 'primary'}
            onClick={handleToggleActive}
            disabled={updateUser.isPending}
          >
            {user.active ? (
              <><UserX size={12} className="mr-1" /> Désactiver</>
            ) : (
              <><UserCheck size={12} className="mr-1" /> Activer</>
            )}
          </PanelActionButton>
        </>
      }
    >
      <div className="p-4 space-y-5">
        {/* Profile header */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/50">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover shrink-0" />
          ) : (
            <div className={cn('h-14 w-14 flex items-center justify-center rounded-full font-semibold text-white text-lg shrink-0', getAvatarColor(`${user.first_name}${user.last_name}`))}>
              {`${user.first_name[0] || ''}${user.last_name[0] || ''}`}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate">{user.first_name} {user.last_name}</h3>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={cn('gl-badge', user.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                {user.active ? 'Actif' : 'Archivé'}
              </span>
              <span className="text-xs text-muted-foreground uppercase font-medium">{user.language}</span>
            </div>
          </div>
        </div>

        {/* Detail tabs */}
        <div className="border-b border-border -mx-4 px-4">
          <div className="flex items-center gap-1">
            {([
              { key: 'infos' as const, label: 'Infos', icon: Users },
              { key: 'entities' as const, label: 'Entites & Roles', icon: Building2 },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setDetailTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  detailTab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={13} />
                {label}
                {key === 'entities' && entitiesCount > 0 && (
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
                    detailTab === 'entities'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-accent text-muted-foreground',
                  )}>
                    {entitiesCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {detailTab === 'infos' ? (
          <>
            {/* Editable fields */}
            <FormSection title={t('common.details')}>
              <InlineEditableRow label={t('users.first_name')} value={user.first_name} onSave={(v) => handleInlineSave('first_name', v)} />
              <InlineEditableRow label={t('users.last_name')} value={user.last_name} onSave={(v) => handleInlineSave('last_name', v)} />
              <InlineEditableRow label="Email" value={user.email} onSave={(v) => handleInlineSave('email', v)} type="email" />
              <InlineEditableTags label={t('settings.language')} value={user.language} options={LANGUAGE_OPTIONS} onSave={(v) => handleInlineSave('language', v)} />
            </FormSection>

            {/* Roles & Groups */}
            <FormSection title="Roles & Groupes" collapsible storageKey="panel.user.sections" id="user-roles-groups">
              {/* Roles */}
              <SectionHeader>
                <span className="flex items-center gap-1.5"><Shield size={12} /> Roles attribues</span>
              </SectionHeader>
              {roles && roles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {roles.map((role) => (
                    <span key={role.code} className="gl-badge gl-badge-info text-[10px]">
                      {role.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Aucun role attribue</p>
              )}

              {/* Groups */}
              <SectionHeader>
                <span className="flex items-center gap-1.5 mt-3"><KeyRound size={12} /> Groupes</span>
              </SectionHeader>
              {groups && groups.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {groups.map((group) => (
                    <span key={group.id} className="gl-badge gl-badge-neutral text-[10px]">
                      {group.name} ({group.role_code})
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Aucun groupe</p>
              )}
            </FormSection>

            {/* Timestamps */}
            <SectionHeader>Activite</SectionHeader>
            <div className="space-y-0">
              <ReadOnlyRow
                label="Derniere connexion"
                value={
                  <span className="flex items-center gap-1.5 text-sm">
                    <Clock size={12} className="text-muted-foreground" />
                    {user.last_login_at ? (
                      <span title={new Date(user.last_login_at).toLocaleString()}>{relativeTime(user.last_login_at)}</span>
                    ) : '\u2014'}
                  </span>
                }
              />
              <ReadOnlyRow
                label="Cree le"
                value={
                  <span className="flex items-center gap-1.5 text-sm">
                    <Calendar size={12} className="text-muted-foreground" />
                    {user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014'}
                  </span>
                }
              />
            </div>

            {/* Security actions */}
            <FormSection title="Securite" collapsible storageKey="panel.user.sections" id="user-security-actions">
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
                Revoquer toutes les sessions
              </button>
              <p className="text-xs text-muted-foreground mt-1.5">
                Deconnecte l'utilisateur de tous les appareils (sauf la session courante).
              </p>
            </FormSection>
          </>
        ) : (
          <UserEntitiesTab userId={id} />
        )}
      </div>
    </DynamicPanelShell>
  )
}

// ── Main Page ──────────────────────────────────────────────
type AccountsTab = 'users' | 'groups' | 'roles' | 'permissions'

export function UsersPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<AccountsTab>('users')
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [statusFilterValue, setStatusFilterValue] = useState<string | undefined>(undefined)
  // Counter to trigger create in child Roles/Groups tabs
  const [createTrigger, setCreateTrigger] = useState(0)

  const search = useUIStore((s) => s.globalSearch)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  const { data, isLoading } = useUsers({ page, page_size: pageSize, search: search || undefined })

  // Deep link: /users#create
  useEffect(() => {
    if (window.location.hash === '#create') {
      openDynamicPanel({ type: 'create', module: 'users' })
    }
  }, [openDynamicPanel])

  // Client-side status filter
  const filteredData = useMemo(() => {
    if (!data) return []
    if (!statusFilterValue || statusFilterValue === 'all') return data.items
    if (statusFilterValue === 'active') return data.items.filter((u) => u.active)
    if (statusFilterValue === 'archived') return data.items.filter((u) => !u.active)
    return data.items
  }, [data, statusFilterValue])

  // Set navigation items for the dynamic panel
  useEffect(() => {
    if (filteredData.length > 0) {
      setNavItems(filteredData.map((u) => u.id))
    }
    return () => setNavItems([])
  }, [filteredData, setNavItems])

  // Batch actions
  const updateUser = useUpdateUser()
  const confirm = useConfirm()
  const batchActions: DataTableBatchAction<UserRead>[] = useMemo(() => [
    {
      id: 'deactivate',
      label: 'Désactiver',
      icon: <UserX size={12} className="mr-1" />,
      variant: 'danger',
      onAction: async (rows) => {
        const activeRows = rows.filter((r) => r.active)
        if (activeRows.length === 0) return
        const ok = await confirm({
          title: `Désactiver ${activeRows.length} utilisateur${activeRows.length > 1 ? 's' : ''} ?`,
          message: `Les utilisateurs sélectionnés seront archivés et ne pourront plus se connecter.`,
          confirmLabel: 'Désactiver',
          variant: 'danger',
        })
        if (!ok) return
        await Promise.all(
          activeRows.map((r) => updateUser.mutateAsync({ id: r.id, payload: { active: false } }))
        )
      },
    },
  ], [updateUser, confirm])

  // Update filter definitions with counts
  const filterDefs: DataTableFilterDef[] = useMemo(() => {
    const activeCount = data?.items.filter((u) => u.active).length ?? 0
    const archivedCount = data?.items.filter((u) => !u.active).length ?? 0
    return [{
      id: 'status',
      label: 'Statut',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'Tous', count: data?.total },
        { value: 'active', label: 'Actifs', count: activeCount },
        { value: 'archived', label: 'Archivés', count: archivedCount },
      ],
    }]
  }, [data])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && (dynamicPanel.module === 'users' || dynamicPanel.module === 'groups')

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader
            icon={Users}
            title={t('nav.accounts', 'Comptes')}
            subtitle={
              activeTab === 'users' ? t('users.subtitle')
              : activeTab === 'groups' ? 'Gestion des groupes utilisateurs'
              : activeTab === 'roles' ? 'Gestion des rôles et permissions associées'
              : 'Matrice des permissions par module'
            }
          >
            {activeTab === 'users' && (
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
          <div className="flex items-center gap-1 border-b border-border px-4">
            {([
              { key: 'users' as const, label: t('users.title'), icon: Users },
              { key: 'groups' as const, label: 'Groupes', icon: Users },
              { key: 'roles' as const, label: 'Roles', icon: Shield },
              { key: 'permissions' as const, label: 'Permissions', icon: KeyRound },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={14} className="inline mr-1.5 -mt-0.5" />
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'groups' ? (
              <GroupsTab
                externalSearch={search || ''}
                createTrigger={createTrigger}
                onOpenPanel={(view) => openDynamicPanel(view as Parameters<typeof openDynamicPanel>[0])}
              />
          ) : activeTab === 'roles' ? (
            <div className="flex-1 min-h-0 overflow-auto px-4 pt-3 pb-4">
              <RolesTab externalSearch={search || ''} createTrigger={createTrigger} />
            </div>
          ) : activeTab === 'permissions' ? (
            <div className="flex-1 min-h-0 overflow-auto px-4 pt-3 pb-4">
              <PermissionsTab externalSearch={search || ''} />
            </div>
          ) : (
          <>

          <DataTable<UserRead>
            columns={userColumns}
            data={filteredData}
            isLoading={isLoading}
            getRowId={(row) => row.id}
            storageKey="users"

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
            activeFilters={{ status: statusFilterValue }}
            onFilterChange={(id, value) => {
              if (id === 'status') setStatusFilterValue(value as string | undefined)
            }}

            columnVisibility
            defaultHiddenColumns={['language']}

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
                language: 'Langue',
                active: 'Statut',
                created_at: 'Créé le',
                last_login_at: 'Dernière connexion',
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
      )}

      {dynamicPanel?.module === 'users' && dynamicPanel.type === 'create' && <CreateUserPanel />}
      {dynamicPanel?.module === 'users' && dynamicPanel.type === 'detail' && <UserDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'groups' && dynamicPanel.type === 'create' && <GroupCreatePanelWrapper />}
      {dynamicPanel?.module === 'groups' && dynamicPanel.type === 'detail' && <GroupDetailPanelWrapper id={dynamicPanel.id} />}
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
  return <GroupDetailPanel groupId={id} onClose={closeDynamicPanel} />
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
