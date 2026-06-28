/**
 * CoverageBar — barre de couverture MTO segmentée (DS OpsFlux).
 *
 * UNE seule barre divisée en 3 segments proportionnels :
 *   en stock (success) · partiel (warning) · à commander (destructive)
 *
 * Les couleurs viennent exclusivement des tokens sémantiques
 * (`bg-success` / `bg-warning` / `bg-destructive`) — aucune couleur hex.
 * Le SEUL style inline toléré est la largeur dynamique de chaque segment
 * (impossible à exprimer en classe Tailwind car calculée à l'exécution).
 *
 * Réutilisée :
 *   - cellule « Couverture » de la liste des MTO d'un projet,
 *   - cartes KPI (vue rapprochement + liste des MTO).
 *
 * Le composant lit un mapping statut→nombre (clés métier de mtoService :
 * "en stock" / "partiel" / "à commander"), exactement la forme de
 * `MtoBatchStats.couverture`.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { mtoStatusLabel } from '@/services/mtoService'

/** Comptes par statut métier — superset de `MtoBatchStats.couverture`. */
export interface CoverageCounts {
  'en stock'?: number
  partiel?: number
  'à commander'?: number
  [key: string]: number | undefined
}

interface Segment {
  key: 'en stock' | 'partiel' | 'à commander'
  /** Classe de remplissage tokenisée (segment de barre). */
  bar: string
  /** Classe de pastille tokenisée (légende). */
  dot: string
  /** Classe texte tokenisée (compteur de légende). */
  text: string
}

/** Ordre + mapping token de chaque segment (success → warning → destructive). */
const SEGMENTS: Segment[] = [
  { key: 'en stock', bar: 'bg-success', dot: 'bg-success', text: 'text-success' },
  { key: 'partiel', bar: 'bg-warning', dot: 'bg-warning', text: 'text-warning' },
  { key: 'à commander', bar: 'bg-destructive', dot: 'bg-destructive', text: 'text-destructive' },
]

export interface CoverageBarProps {
  counts: CoverageCounts
  /** Hauteur de la barre. `sm` pour les cellules de table, `md` pour les KPI. */
  size?: 'sm' | 'md'
  /** Affiche la légende (pastille + libellé + compteur) sous la barre. */
  showLegend?: boolean
  /** Affiche le % « trouvés » (en stock + partiel) en tête de légende. */
  showFoundPct?: boolean
  className?: string
}

/**
 * Barre segmentée de couverture. Si tous les comptes sont nuls, rend une
 * piste vide (muted) pour éviter une barre fantôme.
 */
export function CoverageBar({
  counts,
  size = 'sm',
  showLegend = false,
  showFoundPct = false,
  className,
}: CoverageBarProps) {
  const { t } = useTranslation()
  const values = SEGMENTS.map((s) => Math.max(0, counts[s.key] ?? 0))
  const total = values.reduce((a, b) => a + b, 0)
  // « Trouvés » = en stock + partiel (tout sauf à commander).
  const foundPct = total > 0 ? Math.round(((values[0] + values[1]) / total) * 100) : 0

  const barH = size === 'md' ? 'h-2.5' : 'h-1.5'

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div
        className={cn('flex w-full overflow-hidden rounded-full bg-muted', barH)}
        role="img"
        aria-label={SEGMENTS.map((s) => `${mtoStatusLabel(s.key)} ${counts[s.key] ?? 0}`).join(', ')}
      >
        {total > 0 &&
          SEGMENTS.map((s, i) =>
            values[i] > 0 ? (
              <div
                key={s.key}
                className={cn('h-full first:rounded-l-full last:rounded-r-full', s.bar)}
                // Seul style inline toléré : largeur proportionnelle dynamique.
                style={{ width: `${(values[i] / total) * 100}%` }}
                title={`${mtoStatusLabel(s.key)} : ${values[i]}`}
              />
            ) : null,
          )}
      </div>

      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {showFoundPct && (
            <span className="text-[11px] font-semibold tabular-nums text-foreground">
              {t('mto.matching.found_pct', { pct: foundPct })}
            </span>
          )}
          {SEGMENTS.map((s, i) => (
            <span
              key={s.key}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
              title={mtoStatusLabel(s.key)}
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} />
              <b className={cn('tabular-nums', s.text)}>{values[i]}</b>
              <span className="hidden sm:inline">{mtoStatusLabel(s.key).toLowerCase()}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default CoverageBar
