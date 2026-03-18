/**
 * Roles & Permissions tab — read-only view of user's roles, groups, permissions.
 *
 * API-backed: GET /api/v1/users/me/roles, /groups, /permissions
 */
import { Shield, Users, Lock, Loader2 } from 'lucide-react'
import { useUserRoles, useUserGroups, useUserPermissions } from '@/hooks/useSettings'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function RolesTab() {
  const { data: roles, isLoading: rolesLoading } = useUserRoles()
  const { data: groups, isLoading: groupsLoading } = useUserGroups()
  const { data: permissions, isLoading: permsLoading } = useUserPermissions()

  const isLoading = rolesLoading || groupsLoading || permsLoading

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
        <div className="mt-2 space-y-2">
          {roles && roles.length > 0 ? (
            roles.map((role) => (
              <div key={role.code} className="flex items-center gap-3 py-3 border-b border-border/50">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <Shield size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{role.name}</p>
                  {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
                </div>
                <span className="gl-badge gl-badge-info shrink-0">
                  {role.module ? role.module : 'Système'}
                </span>
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Aucun rôle attribué.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* Section: Groups */}
      <CollapsibleSection id="groups-list" title="Groupes" description="Les groupes auxquels vous appartenez et votre rôle dans chacun." storageKey="settings.roles.collapse">
        <div className="mt-2">
          {groups && groups.length > 0 ? (
            <table className="w-full text-sm max-w-2xl">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2.5 pr-3 text-sm font-semibold text-foreground">Groupe</th>
                  <th className="py-2.5 pr-3 text-sm font-semibold text-foreground">Membres</th>
                  <th className="py-2.5 text-sm font-semibold text-foreground">Rôle</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{group.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{group.member_count} membres</td>
                    <td className="py-2.5">
                      <span className="gl-badge gl-badge-neutral">{group.role_code}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Vous n'appartenez à aucun groupe.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* Section: Permissions */}
      <CollapsibleSection id="permissions-list" title="Permissions par module" description="Récapitulatif de vos permissions effectives par module." storageKey="settings.roles.collapse" showSeparator={false}>
        <div className="mt-2">
          {permissions && permissions.length > 0 ? (
            <table className="w-full text-sm max-w-2xl">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2.5 pr-3 text-sm font-semibold text-foreground">Module</th>
                  <th className="py-2.5 text-sm font-semibold text-foreground">Permissions</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm) => (
                  <tr key={perm.module} className="border-b border-border/50">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <Lock size={12} className="text-muted-foreground" />
                        <span className="font-medium text-foreground">{perm.module}</span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {perm.permissions.map((p) => (
                          <span key={p} className="gl-badge gl-badge-neutral">{p}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Aucune permission effective.</p>
          )}
        </div>
      </CollapsibleSection>
    </>
  )
}
