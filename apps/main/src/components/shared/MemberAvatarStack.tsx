/**
 * MemberAvatarStack — stack compact d'avatars circulaires.
 *
 * Affichage des membres d'une equipe en mode compact (card équipe, ligne
 * projet, etc.). Au-delà de `max` membres, on rend une pastille "+N" en
 * dernière position.
 *
 * Réutilisé par TeamPicker, TeamCard, ProjectTeamsSection, etc.
 */
import { cn } from '@/lib/utils'
import { PaxAvatar } from '@/components/shared/PaxAvatar'

interface MemberAvatarStackMember {
  user_id?: string | null
  contact_id?: string | null
  first_name?: string | null
  last_name?: string | null
  avatar_url?: string | null
}

interface MemberAvatarStackProps {
  members: MemberAvatarStackMember[]
  max?: number
  size?: number
  className?: string
  /** Si fourni, affiche le total après le stack (e.g. "+12 membres"). */
  showCount?: boolean
}

export function MemberAvatarStack({
  members,
  max = 5,
  size = 24,
  className,
  showCount = false,
}: MemberAvatarStackProps) {
  if (!members || members.length === 0) {
    return (
      <span className={cn('text-[10px] text-muted-foreground italic', className)}>
        Aucun membre
      </span>
    )
  }

  const visible = members.slice(0, max)
  const overflow = members.length - visible.length
  // Overlap visuel : chaque avatar mord sur le précédent de ~25% de sa taille.
  const overlap = Math.round(size * 0.35)

  return (
    <span className={cn('inline-flex items-center', className)}>
      <span className="inline-flex items-center">
        {visible.map((m, i) => {
          const fullName = `${m.last_name ?? ''} ${m.first_name ?? ''}`.trim()
          return (
            <span
              key={`${m.user_id || m.contact_id || i}`}
              style={{ marginLeft: i === 0 ? 0 : -overlap }}
              className="ring-1 ring-background rounded-full"
            >
              <PaxAvatar
                avatarUrl={m.avatar_url}
                fullName={fullName || '?'}
                size={size}
              />
            </span>
          )
        })}
        {overflow > 0 && (
          <span
            style={{
              marginLeft: -overlap,
              width: size,
              height: size,
              fontSize: Math.max(9, Math.round(size * 0.36)),
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-full ring-1 ring-background bg-muted text-muted-foreground font-semibold"
            title={`+${overflow} autres membres`}
          >
            +{overflow}
          </span>
        )}
      </span>
      {showCount && (
        <span className="ml-2 text-[11px] text-muted-foreground">
          {members.length} {members.length === 1 ? 'membre' : 'membres'}
        </span>
      )}
    </span>
  )
}
