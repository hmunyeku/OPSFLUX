/**
 * Audit-log timeline shared helpers.
 *
 * Centralise les concepts qui se repetent dans les 4 timelines
 * (Tier / Project / Task / Activity) :
 * - Presets de periode (24h, 7j, 30j, 90j, Tout)
 * - Conversion preset -> ISO timestamp pour le query param `since`
 * - Labels FR par defaut (peut etre override via i18n)
 *
 * Sans ce module, chaque timeline dupliquait la meme fonction
 * periodToSince et le meme tableau PERIOD_PRESETS. Maintenant un
 * seul endroit pour evoluer (ex. : ajouter "Cette semaine ISO"
 * profiterait aux 4 timelines).
 */

export const HISTORY_PERIOD_PRESETS = ['1d', '7d', '30d', '90d', 'all'] as const
export type HistoryPeriodPreset = (typeof HISTORY_PERIOD_PRESETS)[number]

/** Labels FR par defaut. Override via i18n key {namespace}.history.period_{preset}. */
export const HISTORY_PERIOD_LABELS_FR: Record<HistoryPeriodPreset, string> = {
  '1d': '24h',
  '7d': '7j',
  '30d': '30j',
  '90d': '90j',
  all: 'Tout',
}

/**
 * Convertit un preset en ISO timestamp pour le query param backend `since`.
 * Retourne undefined si preset === 'all' (pas de filtre temporel).
 */
export function periodToSince(period: HistoryPeriodPreset): string | undefined {
  if (period === 'all') return undefined
  const days = parseInt(period.replace('d', ''), 10)
  if (!Number.isFinite(days)) return undefined
  const d = new Date(Date.now() - days * 86400000)
  return d.toISOString()
}
