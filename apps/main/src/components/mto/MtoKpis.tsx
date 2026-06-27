/**
 * MtoKpis — bandeau de cartes KPI pour le module MTO (DS OpsFlux).
 *
 * Réutilise les tuiles KPI canoniques du design system (classes `kpi-pp`
 * de styles/cards-pp.css, déjà employées par le module Tiers) + la
 * CoverageBar segmentée. Aucune couleur hex : tokens uniquement.
 *
 * Deux usages :
 *   - <MtoCoverageKpis> : total groupes / en stock / partiel / à commander
 *     + barre de couverture. En tête de la vue rapprochement ET de la liste
 *     des MTO du projet (couverture agrégée).
 *
 * Les compteurs sont fournis par l'appelant (déjà calculés depuis les
 * groupes ou agrégés depuis les stats batch).
 */
import { CoverageBar, type CoverageCounts } from './CoverageBar'

export interface MtoCoverageKpisProps {
  /** Nombre total de groupes consolidés. */
  total: number
  /** Comptes par statut métier (en stock / partiel / à commander). */
  counts: CoverageCounts
  /**
   * Libellé de la 1ʳᵉ tuile (« Groupes » en vue rapprochement, « Items »
   * ou « MTO » côté liste selon le contexte d'agrégation).
   */
  totalLabel?: string
  /** État chargement : rend des tuiles en skeleton (data-state=loading). */
  isLoading?: boolean
}

/** Pourcentage compact « N% » d'une part sur un total (— si total nul). */
function pctOf(part: number, total: number): string {
  if (total <= 0) return '—'
  return `${Math.round((part / total) * 100)}%`
}

/** Skeleton d'une tuile KPI — réutilise l'état `data-state="loading"` du DS. */
function KpiSkeletonTile() {
  return (
    <div className="kpi-pp" data-state="loading" aria-hidden>
      <div className="kpi-pp__label">—</div>
      <div className="kpi-pp__value-row">
        <span className="kpi-pp__value">00</span>
      </div>
    </div>
  )
}

/**
 * Strip de 4 KPI + barre de couverture. La barre occupe la pleine largeur
 * sous la grille de tuiles, alignée sur le gabarit `kpi-pp-grid`.
 */
export function MtoCoverageKpis({
  total,
  counts,
  totalLabel = 'Groupes',
  isLoading = false,
}: MtoCoverageKpisProps) {
  const inStock = counts['en stock'] ?? 0
  const partiel = counts['partiel'] ?? 0
  const aCommander = counts['à commander'] ?? 0
  const foundPct = total > 0 ? Math.round(((inStock + partiel) / total) * 100) : 0

  if (isLoading) {
    return (
      <div className="kpi-pp-grid" data-cols="4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeletonTile key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="kpi-pp-grid" data-cols="4">
        <div className="kpi-pp">
          <div className="kpi-pp__label">{totalLabel}</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{total}</span>
          </div>
          <div className="kpi-pp__caption">{foundPct}% trouvés</div>
        </div>

        <div className="kpi-pp">
          <div className="kpi-pp__label">
            <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
            En stock
          </div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{inStock}</span>
            <span className="kpi-pp__unit">{pctOf(inStock, total)}</span>
          </div>
        </div>

        <div className="kpi-pp">
          <div className="kpi-pp__label">
            <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
            Partiel
          </div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{partiel}</span>
            <span className="kpi-pp__unit">{pctOf(partiel, total)}</span>
          </div>
        </div>

        <div className="kpi-pp">
          <div className="kpi-pp__label">
            <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
            À commander
          </div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{aCommander}</span>
            <span className="kpi-pp__unit">{pctOf(aCommander, total)}</span>
          </div>
        </div>
      </div>

      <CoverageBar counts={counts} size="md" />
    </div>
  )
}

export default MtoCoverageKpis
