/**
 * MtoStatStrip — bande de stats COMPACTE (une seule ligne) pour le module MTO.
 *
 * Remplace les grosses tuiles `kpi-pp` (≈130px de haut, beaucoup de vide) par
 * une bande horizontale dense (~36px) : pastille tokenisée + valeur
 * (font-semibold) + libellé court (text-xs muted), segments séparés par des
 * traits verticaux fins. C'est un OUTIL DENSE de rapprochement : la densité
 * prime sur la décoration.
 *
 * Aucune couleur hex : tokens sémantiques uniquement
 * (`bg-success` / `bg-warning` / `bg-destructive`).
 *
 * Usage : en tête de la vue rapprochement ET de la liste des MTO du projet
 * (couverture agrégée). Les compteurs sont fournis par l'appelant.
 *
 * `MtoCoverageKpis` est conservé comme alias rétro-compatible.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { CoverageCounts } from './CoverageBar'

export interface MtoStatStripProps {
  /** Nombre total de groupes consolidés. */
  total: number
  /** Comptes par statut métier (en stock / partiel / à commander). */
  counts: CoverageCounts
  /**
   * Libellé du 1ᵉʳ segment (« groupes » en vue rapprochement, « items » /
   * « groupes (tous MTO) » côté liste selon le contexte d'agrégation).
   */
  totalLabel?: string
  /** État chargement : rend une bande en skeleton. */
  isLoading?: boolean
  className?: string
}

/** Pourcentage compact « N% » d'une part sur un total (— si total nul). */
function pctOf(part: number, total: number): string {
  if (total <= 0) return '—'
  return `${Math.round((part / total) * 100)}%`
}

/** Séparateur vertical fin entre deux segments de stat. */
function Sep() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
}

/**
 * Un segment de stat : [pastille] valeur libellé (pct).
 * La pastille est omise pour le segment « total » (dot = null).
 */
function Stat({
  dot,
  value,
  label,
  pct,
}: {
  dot: string | null
  value: number
  label: string
  pct?: string
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
      {dot && (
        <span className={cn('mb-0.5 h-2 w-2 shrink-0 self-center rounded-full', dot)} />
      )}
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {pct && <span className="text-xs tabular-nums text-muted-foreground/70">{pct}</span>}
    </span>
  )
}

/**
 * Bande de stats compacte (une ligne) : total + 3 statuts métier.
 * Hauteur cible ~28-36px (sans border/bg-card/padding épais).
 */
export function MtoStatStrip({
  total,
  counts,
  totalLabel,
  isLoading = false,
  className,
}: MtoStatStripProps) {
  const { t } = useTranslation()
  const inStock = counts['en stock'] ?? 0
  const partiel = counts['partiel'] ?? 0
  const aCommander = counts['à commander'] ?? 0
  const foundPct = total > 0 ? Math.round(((inStock + partiel) / total) * 100) : 0
  const resolvedTotalLabel = totalLabel ?? t('mto.matching.total_label')

  if (isLoading) {
    return (
      <div
        className={cn('flex h-6 items-center gap-3', className)}
        aria-hidden
      >
        <span className="h-3.5 w-28 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-20 animate-pulse rounded bg-muted" />
        <span className="h-3.5 w-24 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1',
        className,
      )}
    >
      <Stat
        dot={null}
        value={total}
        label={resolvedTotalLabel}
        pct={t('mto.matching.found_pct_paren', { pct: foundPct })}
      />
      <Sep />
      <Stat dot="bg-success" value={inStock} label={t('mto.status.en_stock').toLowerCase()} pct={pctOf(inStock, total)} />
      <Sep />
      <Stat dot="bg-warning" value={partiel} label={t('mto.status.partiel').toLowerCase()} pct={pctOf(partiel, total)} />
      <Sep />
      <Stat
        dot="bg-destructive"
        value={aCommander}
        label={t('mto.status.a_commander').toLowerCase()}
        pct={pctOf(aCommander, total)}
      />
    </div>
  )
}

/** Alias rétro-compatible (ancien nom). */
export const MtoCoverageKpis = MtoStatStrip
export type MtoCoverageKpisProps = MtoStatStripProps

export default MtoStatStrip
