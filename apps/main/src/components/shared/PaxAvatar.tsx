/**
 * PaxAvatar — avatar circulaire pour un utilisateur ou un contact externe.
 *
 * Bastien (SUP-0039, mai 2026): "il ne faut pas oublier que chaque nom d'un
 * contact ou d'un utilisateur doit apparaître toujours avec l'avatar ou la
 * photo de profil à côté". Composant shared pour respecter cette règle dans
 * toutes les listes/cards où on affiche un nom de pax.
 *
 * Render :
 *   - <img> avec `avatarUrl` si fournie (object-cover)
 *   - sinon initiales sur fond colore deterministe (hash du nom -> couleur)
 *
 * Taille en pixels (h+w identiques), défaut 32px.
 */
import { cn } from '@/lib/utils'

interface PaxAvatarProps {
  avatarUrl?: string | null
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  size?: number
  className?: string
  /** Tag HTML wrapper. Defaut: 'span' inline pour s'inserer dans du texte. */
  as?: 'span' | 'div'
}

// Palette HSL stable — 8 couleurs distinctes en luminosite/saturation
// uniformes pour eviter qu'une initiale paraisse plus "criarde" qu'une autre.
const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-rose-500',
] as const

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i)
    h |= 0 // 32-bit int
  }
  return Math.abs(h)
}

function getInitials(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function PaxAvatar({
  avatarUrl,
  fullName,
  firstName,
  lastName,
  size = 32,
  className,
  as: Tag = 'span',
}: PaxAvatarProps) {
  const computedName =
    fullName?.trim() ||
    `${lastName ?? ''} ${firstName ?? ''}`.trim() ||
    '?'
  const initials = getInitials(computedName)
  const bgColor = AVATAR_COLORS[hashName(computedName) % AVATAR_COLORS.length]
  // Taille de police 40% de la taille de l'avatar avec borne min 9px.
  const fontSize = Math.max(9, Math.round(size * 0.4))

  if (avatarUrl) {
    return (
      <Tag
        className={cn(
          'inline-flex shrink-0 rounded-full overflow-hidden bg-muted',
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={computedName}
      >
        <img
          src={avatarUrl}
          alt={computedName}
          className="h-full w-full object-cover"
          // Si l'image 404 (ex. URL stale), on ne re-render pas en initiales
          // automatiquement — c'est plus simple et le browser affiche son
          // placeholder natif. Si besoin un jour: useState onError -> fallback.
        />
      </Tag>
    )
  }

  return (
    <Tag
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white tracking-wide',
        bgColor,
        className,
      )}
      style={{ width: size, height: size, fontSize }}
      aria-label={computedName}
      title={computedName}
    >
      {initials}
    </Tag>
  )
}
