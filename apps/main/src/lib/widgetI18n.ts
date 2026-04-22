/**
 * Widget i18n helpers.
 *
 * Backend widget catalog entries (in dashboard_service.py's
 * PREDEFINED_WIDGETS) hardcode their titles in French. Rather than
 * mirroring every widget title as a database column with a
 * translation relation, we translate client-side using the widget's
 * catalog id as the i18n key.
 *
 * The catalog id lives in `widget.config.widget_id` (the frontend
 * `widget.id` is the instance UUID, not the catalog key). If the
 * catalog id is missing or the translation key is absent, we fall
 * back to the raw `widget.title` served by the backend — so an
 * unknown widget never renders as a raw key.
 */
import type { TFunction } from 'i18next'
import type { DashboardWidget } from '@/services/dashboardService'

/** Pull the catalog id from a placed widget payload. */
export function getWidgetCatalogId(widget: DashboardWidget): string | null {
  const fromConfig = (widget.config as Record<string, unknown> | undefined)?.widget_id
  if (typeof fromConfig === 'string' && fromConfig) return fromConfig
  // Legacy placements may store widget_id at the top level.
  const top = (widget as unknown as { widget_id?: unknown }).widget_id
  if (typeof top === 'string' && top) return top
  return null
}

/** Resolve a widget's displayable title, preferring i18n over raw FR. */
export function resolveWidgetTitle(widget: DashboardWidget, t: TFunction): string {
  const id = getWidgetCatalogId(widget)
  if (id) {
    // `t()` returns the key literal when the key is missing, so we
    // compare and fall back to the backend-served title.
    const key = `widgets.${id}.title`
    const translated = t(key)
    if (translated && translated !== key) return translated
  }
  return widget.title
}

/** Resolve a widget's description, preferring i18n over raw FR. */
export function resolveWidgetDescription(widget: DashboardWidget, t: TFunction): string | null {
  const id = getWidgetCatalogId(widget)
  if (id) {
    const key = `widgets.${id}.description`
    const translated = t(key)
    if (translated && translated !== key) return translated
  }
  return widget.description ?? null
}
