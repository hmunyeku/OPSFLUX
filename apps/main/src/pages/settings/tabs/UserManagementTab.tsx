/**
 * User Management admin tab — list users, unlock, force reset, deactivate/reactivate.
 *
 * Sections: #admin-users-list
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Search, LockOpen, KeyRound, UserX, UserCheck,
  MoreHorizontal, Shield, ShieldAlert, ShieldOff, Clock,
} from 'lucide-react'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

interface AdminUser {
  id: string
  email: string
  first_name: string
  last_name: string
  active: boolean
  avatar_url: string | null
  auth_type: string
  mfa_enabled: boolean
  failed_login_count: number
  locked_until: string | null
  is_locked: boolean
  lock_remaining_minutes: number | null
  last_login_at: string | null
  last_login_ip: string | null
  account_expires_at: string | null
  created_at: string
}

interface UsersResponse {
  items: AdminUser[]
  total: number
  page: number
  page_size: number
}

type StatusFilter = 'all' | 'locked' | 'inactive' | 'expired' | 'active'

const STATUS_FILTERS: { value: StatusFilter; label: string; icon: typeof Shield }[] = [
  { value: 'all', label: 'Tous', icon: Shield },
  { value: 'active', label: 'Actifs', icon: UserCheck },
  { value: 'locked', label: 'Verrouillés', icon: ShieldAlert },
  { value: 'inactive', label: 'Désactivés', icon: ShieldOff },
  { value: 'expired', label: 'Expirés', icon: Clock },
]

function StatusBadge({ user }: { user: AdminUser }) {
  if (user.is_locked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
        <ShieldAlert size={11} />
        Verrouillé
        {user.lock_remaining_minutes != null && ` (${user.lock_remaining_minutes}min)`}
      </span>
    )
  }
  if (!user.active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
        <ShieldOff size={11} />
        Désactivé
      </span>
    )
  }
  if (user.account_expires_at && new Date(user.account_expires_at) < new Date()) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        <Clock size={11} />
        Expiré
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
      <Shield size={11} />
      Actif
    </span>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "À l'instant"
  if (min < 60) return `Il y a ${min}min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Il y a ${days}j`
  return new Date(iso).toLocaleDateString('fr-FR')
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  variant = 'default',
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg">
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={loading} className="gl-button gl-button-default h-8 text-xs">
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'gl-button h-8 text-xs',
              variant === 'danger' ? 'gl-button-danger' : 'gl-button-confirm'
            )}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function UserManagementTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [actionMenu, setActionMenu] = useState<string | null>(null)

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState<{
    type: 'unlock' | 'reset' | 'deactivate' | 'reactivate'
    user: AdminUser
  } | null>(null)

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ['admin', 'users', filter, search, page],
    queryFn: () => api.get('/api/v1/admin/users', {
      params: {
        status_filter: filter === 'all' ? undefined : filter,
        search: search || undefined,
        page,
        page_size: 50,
      },
    }).then(r => r.data),
  })

  const unlockMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/api/v1/admin/users/${userId}/unlock`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast({ title: 'Compte déverrouillé', variant: 'success' })
      setConfirmAction(null)
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de déverrouiller le compte.', variant: 'error' })
    },
  })

  const resetMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/api/v1/admin/users/${userId}/force-password-reset`),
    onSuccess: () => {
      toast({ title: 'Email de réinitialisation envoyé', variant: 'success' })
      setConfirmAction(null)
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible d\'envoyer l\'email.', variant: 'error' })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/api/v1/admin/users/${userId}/deactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast({ title: 'Compte désactivé', variant: 'success' })
      setConfirmAction(null)
    },
    onError: (err: any) => {
      toast({ title: 'Erreur', description: err?.response?.data?.detail || 'Impossible de désactiver le compte.', variant: 'error' })
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/api/v1/admin/users/${userId}/reactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast({ title: 'Compte réactivé', variant: 'success' })
      setConfirmAction(null)
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de réactiver le compte.', variant: 'error' })
    },
  })

  const handleConfirm = useCallback(() => {
    if (!confirmAction) return
    const { type, user } = confirmAction
    switch (type) {
      case 'unlock': unlockMutation.mutate(user.id); break
      case 'reset': resetMutation.mutate(user.id); break
      case 'deactivate': deactivateMutation.mutate(user.id); break
      case 'reactivate': reactivateMutation.mutate(user.id); break
    }
  }, [confirmAction, unlockMutation, resetMutation, deactivateMutation, reactivateMutation])

  const isActionLoading = unlockMutation.isPending || resetMutation.isPending || deactivateMutation.isPending || reactivateMutation.isPending

  const users = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 50)

  const confirmMessages: Record<string, { title: string; message: string; label: string; variant: 'default' | 'danger' }> = {
    unlock: {
      title: 'Déverrouiller le compte',
      message: `Déverrouiller le compte de ${confirmAction?.user.first_name} ${confirmAction?.user.last_name} (${confirmAction?.user.email}) ? Le compteur de tentatives échouées sera remis à zéro.`,
      label: 'Déverrouiller',
      variant: 'default',
    },
    reset: {
      title: 'Réinitialiser le mot de passe',
      message: `Envoyer un email de réinitialisation de mot de passe à ${confirmAction?.user.email} ?`,
      label: 'Envoyer',
      variant: 'default',
    },
    deactivate: {
      title: 'Désactiver le compte',
      message: `Désactiver le compte de ${confirmAction?.user.first_name} ${confirmAction?.user.last_name} ? L'utilisateur ne pourra plus se connecter et toutes ses sessions seront révoquées.`,
      label: 'Désactiver',
      variant: 'danger',
    },
    reactivate: {
      title: 'Réactiver le compte',
      message: `Réactiver le compte de ${confirmAction?.user.first_name} ${confirmAction?.user.last_name} ?`,
      label: 'Réactiver',
      variant: 'default',
    },
  }

  const cm = confirmAction ? confirmMessages[confirmAction.type] : null

  return (
    <div>
      {/* ── Stats bar ── */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm text-muted-foreground">{total} utilisateur{total !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setPage(1) }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:bg-accent border border-transparent'
            )}
          >
            <f.icon size={12} />
            {f.label}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher..."
            className="gl-form-input h-7 pl-8 w-52 text-xs"
          />
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Aucun utilisateur trouvé.
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Utilisateur</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Statut</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Dernière connexion</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Échecs</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge user={user} /></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{relativeTime(user.last_login_at)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn(
                      'text-xs font-mono',
                      user.failed_login_count > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'
                    )}>
                      {user.failed_login_count}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="relative inline-block">
                      <button
                        onClick={() => setActionMenu(actionMenu === user.id ? null : user.id)}
                        className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {actionMenu === user.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setActionMenu(null)} />
                          <div className="absolute right-0 top-full mt-1 z-40 w-52 rounded-md border border-border bg-popover shadow-md py-1">
                            {user.is_locked && (
                              <button
                                onClick={() => { setConfirmAction({ type: 'unlock', user }); setActionMenu(null) }}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
                              >
                                <LockOpen size={13} />
                                Déverrouiller le compte
                              </button>
                            )}
                            <button
                              onClick={() => { setConfirmAction({ type: 'reset', user }); setActionMenu(null) }}
                              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
                            >
                              <KeyRound size={13} />
                              Réinitialiser le mot de passe
                            </button>
                            {user.active ? (
                              <button
                                onClick={() => { setConfirmAction({ type: 'deactivate', user }); setActionMenu(null) }}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left text-destructive hover:bg-destructive/5 transition-colors"
                              >
                                <UserX size={13} />
                                Désactiver le compte
                              </button>
                            ) : (
                              <button
                                onClick={() => { setConfirmAction({ type: 'reactivate', user }); setActionMenu(null) }}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
                              >
                                <UserCheck size={13} />
                                Réactiver le compte
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="gl-button gl-button-default h-7 text-xs px-2"
            >
              Précédent
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="gl-button gl-button-default h-7 text-xs px-2"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirmAction && cm && (
        <ConfirmDialog
          open
          title={cm.title}
          message={cm.message}
          confirmLabel={cm.label}
          variant={cm.variant}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
          loading={isActionLoading}
        />
      )}
    </div>
  )
}
