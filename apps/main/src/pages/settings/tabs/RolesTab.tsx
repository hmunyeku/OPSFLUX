/**
 * Roles & Permissions tab — read-only view of user's roles, groups, permissions.
 *
 * API-backed: GET /api/v1/users/me/roles, /groups, /permissions
 */
import { Shield, Users, Loader2 } from 'lucide-react'
import { useUserRoles, useUserGroups } from '@/hooks/useSettings'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { PermissionMatrix } from '@/components/shared/PermissionMatrix'
import { useAuthStore } from '@/stores/authStore'

export function RolesTab() {
  const { user } = useAuthStore()
  const { data: roles, isLoading: rolesLoading } = useUserRoles()
  const { data: groups, isLoading: groupsLoading } = useUserGroups()

  const isLoading = rolesLoading || groupsLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      {/* Section: Roles */}
      <CollapsibleSection id="roles-list" title="Rôles" description="Les rôles attribués à votre compte déterminent vos permissions dans l'application." storageKey="settings.roles.collapse">
        {roles && roles.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {roles.map((role) => (
              <div key={role.code} className="border border-border/60 rounded-lg bg-card p-4">
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <Shield size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{role.name}</p>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 mt-1">
                      {role.module ? role.module : 'Système'}
                    </span>
                  </div>
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{role.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">Aucun rôle attribué.</p>
        )}
      </CollapsibleSection>

      {/* Section: Groups */}
      <CollapsibleSection id="groups-list" title="Groupes" description="Les groupes auxquels vous appartenez et votre rôle dans chacun." storageKey="settings.roles.collapse">
        {groups && groups.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {groups.map((group) => (
              <div key={group.id} className="border border-border/60 rounded-lg bg-card p-4">
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50 shrink-0">
                    <Users size={18} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{group.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
                        {group.member_count} membres
                      </span>
                      <span className="gl-badge gl-badge-neutral">{group.role_codes?.join(', ') || 'Aucun rôle'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">Vous n'appartenez à aucun groupe.</p>
        )}
      </CollapsibleSection>

      {/* Section: Permissions */}
      <CollapsibleSection id="permissions-list" title="Permissions par module" description="Récapitulatif de vos permissions effectives par module." storageKey="settings.roles.collapse" showSeparator={false}>
        {user && (
          <div className="mt-3">
            <PermissionMatrix userId={user.id} compact />
          </div>
        )}
      </CollapsibleSection>
    </>
  )
}
