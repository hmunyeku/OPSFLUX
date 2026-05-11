/**
 * UserBadge — affiche un utilisateur a partir de son UUID.
 *
 * Resout le UUID via useUser() + rendu sous forme de lien CrossModule
 * vers la fiche du user (drill-down au clic). Loading state propre,
 * fallback gracieux si le user est introuvable (supprime, manque de
 * permission, etc).
 *
 * Cree apres signalement Bastien (TransferDetailPanel, mai 2026):
 * "enregistre par, je vois un uid au lieu du lien objet". Generalise
 * en composant reutilisable pour TOUS les usages 'created_by /
 * updated_by / transferred_by / deleted_by / approved_by / resolved_by'.
 */
import { User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { useUser } from '@/hooks/useUsers'

interface UserBadgeProps {
  /** UUID de l'utilisateur (peut etre null/undefined). */
  userId: string | null | undefined
  /** Si null/undefined affiche '—'. Surcharger pour personnaliser le placeholder. */
  fallback?: string
  /** Icone affichee avant le nom. Defaut: User. Mettre null pour cacher. */
  icon?: LucideIcon | null
  /** Tronquer le UUID a N caracteres si user introuvable. Defaut: 8. */
  uidPreviewChars?: number
  /** Desactive le drill-down (juste le texte, pas de lien). */
  static_?: boolean
  /** Classes CSS supplementaires sur le span racine. */
  className?: string
}

export function UserBadge({
  userId,
  fallback = '—',
  icon: Icon = User,
  uidPreviewChars = 8,
  static_ = false,
  className,
}: UserBadgeProps) {
  const { t } = useTranslation()
  const { data: user, isLoading } = useUser(userId || '')

  if (!userId) {
    return <span className={cn('text-xs text-muted-foreground', className)}>{fallback}</span>
  }

  if (isLoading) {
    return (
      <span className={cn('text-xs text-muted-foreground/60 tabular-nums', className)} title={userId}>
        {userId.slice(0, uidPreviewChars)}…
      </span>
    )
  }

  if (!user) {
    // User supprime ou pas accessible — on garde le UUID tronque pour
    // que l'utilisateur puisse au moins le chercher manuellement.
    return (
      <span
        className={cn('text-xs text-muted-foreground font-mono', className)}
        title={t('common.user_unavailable', { uid: userId }) as string || userId}
      >
        {userId.slice(0, uidPreviewChars)}…
      </span>
    )
  }

  const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email || userId

  if (static_) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
        {Icon && <Icon size={11} className="text-muted-foreground" />}
        <span>{fullName}</span>
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      {Icon && <Icon size={11} className="text-muted-foreground" />}
      <CrossModuleLink module="users" id={userId} label={fullName} showIcon={false} />
    </span>
  )
}
