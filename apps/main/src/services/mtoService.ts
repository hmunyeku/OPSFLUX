/**
 * MTO (rapprochement MTO <-> catalogue/stock SAP) — présentation.
 *
 * Helpers de présentation purs (labels + classes Tailwind/tokens) pour la
 * page MtoPage et le panneau de détail. Le client HTTP + les types vivent
 * dans `@/hooks/useMto` (React Query). On garde ici tout ce qui est
 * "comment on AFFICHE un statut MTO" pour éviter de disperser des couleurs
 * en dur dans les composants.
 *
 * Aucune couleur hex en dur : on s'appuie sur les variantes `BadgeCell`
 * (chips Pajamas, avec dark: intégré) et sur les tokens texte
 * (`text-success` / `text-warning` / `text-destructive`).
 *
 * i18n : les LIBELLÉS affichés passent par i18n (namespace `mto.status.*`).
 * Les CLÉS de ces maps restent les valeurs métier brutes du backend
 * ("en stock" / "partiel" / "à commander") — on ne traduit jamais la valeur,
 * seulement son affichage.
 */
import i18n from '@/lib/i18n'

/** Les trois statuts métier renvoyés par le moteur de consolidation. */
export type MtoStatut = 'en stock' | 'partiel' | 'à commander'

/**
 * Variantes de chip exposées par `<BadgeCell>` (cf.
 * components/ui/DataTable/cells.tsx). On redéclare le type ici car
 * `BadgeCellProps` n'est pas ré-exporté par le barrel DataTable.
 */
export type MtoBadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

/**
 * Mapping valeur backend `statut` → clé i18n du libellé affiché.
 * (Le libellé lui-même vit dans les catalogues `mto.status.*`.)
 */
export const MTO_STATUS_LABEL_KEYS: Record<string, string> = {
  'en stock': 'mto.status.en_stock',
  partiel: 'mto.status.partiel',
  'à commander': 'mto.status.a_commander',
}

/**
 * Variante de badge (chip Pajamas) par statut — alimente `<BadgeCell>`.
 * success = couvert, warning = partiel, danger = à commander.
 */
export const MTO_STATUS_VARIANTS: Record<string, MtoBadgeVariant> = {
  'en stock': 'success',
  partiel: 'warning',
  'à commander': 'danger',
}

/**
 * Classes Tailwind (tokens) par statut, pour les cas où l'on veut juste
 * teinter du texte/une surface sans passer par un chip complet (ex. KPIs,
 * pastilles inline). Toujours avec une variante `dark:` explicite.
 */
export const MTO_STATUS_CLASSES: Record<string, { text: string; dot: string }> = {
  'en stock': {
    text: 'text-success',
    dot: 'bg-success',
  },
  partiel: {
    text: 'text-warning',
    dot: 'bg-warning',
  },
  'à commander': {
    text: 'text-destructive',
    dot: 'bg-destructive',
  },
}

/** Libellé i18n d'un statut (fallback = la valeur brute si inconnue). */
export function mtoStatusLabel(statut: string | null | undefined): string {
  if (!statut) return '—'
  const key = MTO_STATUS_LABEL_KEYS[statut]
  return key ? i18n.t(key) : statut
}

/** Variante de chip pour un statut (fallback neutre). */
export function mtoStatusVariant(statut: string | null | undefined): MtoBadgeVariant {
  if (!statut) return 'neutral'
  return MTO_STATUS_VARIANTS[statut] ?? 'neutral'
}

/** Classe texte token pour un statut (fallback muted). */
export function mtoStatusTextClass(statut: string | null | undefined): string {
  if (!statut) return 'text-muted-foreground'
  return MTO_STATUS_CLASSES[statut]?.text ?? 'text-muted-foreground'
}

/** Libellé court et stable pour un batch (label > fichier > id tronqué). */
export function mtoBatchLabel(batch: {
  id: string
  label: string | null
  filename: string | null
}): string {
  return batch.label || batch.filename || batch.id.slice(0, 8)
}
