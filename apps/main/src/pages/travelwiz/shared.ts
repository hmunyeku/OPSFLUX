/**
 * TravelWiz — shared types, constants and helpers used across tabs and panels.
 */
import { Plane, Ship, Truck, Anchor } from 'lucide-react'

export type TravelWizTab =
  | 'dashboard'
  | 'voyages'
  | 'manifests'
  | 'vectors'
  | 'rotations'
  | 'cargo'
  | 'fleet_map'
  | 'pickup'
  | 'weather'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRow = any

// ── Voyage status ─────────────────────────────────────────────

export const VOYAGE_STATUS_LABELS_FALLBACK: Record<string, string> = {
  planned: 'Planifié',
  confirmed: 'Confirmé',
  boarding: 'Embarquement',
  departed: 'En route',
  arrived: 'Arrivé',
  closed: 'Clôturé',
  cancelled: 'Annulé',
  delayed: 'Retardé',
}

export const VOYAGE_STATUS_BADGES: Record<string, string> = {
  planned: 'gl-badge-neutral',
  confirmed: 'gl-badge-info',
  boarding: 'gl-badge-warning',
  departed: 'gl-badge-warning',
  arrived: 'gl-badge-success',
  closed: 'gl-badge-success',
  cancelled: 'gl-badge-danger',
  delayed: 'gl-badge-danger',
}

// ── Manifest status ───────────────────────────────────────────

export const MANIFEST_STATUS_LABELS_FALLBACK: Record<string, string> = {
  draft: 'Brouillon',
  pending_validation: 'En validation',
  validated: 'Validé',
  requires_review: 'À revoir',
  closed: 'Clôturé',
}

export const MANIFEST_STATUS_BADGES: Record<string, string> = {
  draft: 'gl-badge-neutral',
  pending_validation: 'gl-badge-warning',
  validated: 'gl-badge-success',
  requires_review: 'gl-badge-danger',
  closed: 'gl-badge-success',
}

// ── Vector type ───────────────────────────────────────────────

export const VECTOR_TYPE_MAP: Record<string, { label: string; badge: string; icon: typeof Plane }> = {
  helicopter:        { label: 'Hélicoptère',   badge: 'gl-badge-info', icon: Plane },
  boat:              { label: 'Bateau',        badge: 'gl-badge-success', icon: Ship },
  surfer:            { label: 'Surfer',        badge: 'gl-badge-info', icon: Ship },
  bus:               { label: 'Bus',           badge: 'gl-badge-warning', icon: Truck },
  '4x4':             { label: '4x4',           badge: 'gl-badge-neutral', icon: Truck },
  commercial_flight: { label: 'Vol commercial', badge: 'gl-badge-warning', icon: Plane },
  barge:             { label: 'Barge',         badge: 'gl-badge-info', icon: Anchor },
  tug:               { label: 'Remorqueur',    badge: 'gl-badge-neutral', icon: Anchor },
  ship:              { label: 'Navire',        badge: 'gl-badge-success', icon: Ship },
  vehicle:           { label: 'Véhicule',      badge: 'gl-badge-neutral', icon: Truck },
}

// ── Cargo status ──────────────────────────────────────────────

export const CARGO_STATUS_LABELS_FALLBACK: Record<string, string> = {
  registered: 'Enregistré',
  ready: 'Prêt',
  ready_for_loading: 'Prêt au chargement',
  loaded: 'Chargé',
  in_transit: 'En transit',
  delivered: 'Livré',
  delivered_intermediate: 'Livré (inter.)',
  delivered_final: 'Livré (final)',
  return_declared: 'Retour déclaré',
  return_in_transit: 'Retour en transit',
  returned: 'Retourné',
  reintegrated: 'Réintégré',
  scrapped: 'Mis au rebut',
  damaged: 'Endommagé',
  missing: 'Manquant',
}

export const CARGO_STATUS_BADGES: Record<string, string> = {
  registered: 'gl-badge-neutral',
  ready: 'gl-badge-info',
  ready_for_loading: 'gl-badge-info',
  loaded: 'gl-badge-warning',
  in_transit: 'gl-badge-warning',
  delivered: 'gl-badge-success',
  delivered_intermediate: 'gl-badge-info',
  delivered_final: 'gl-badge-success',
  return_declared: 'gl-badge-warning',
  return_in_transit: 'gl-badge-warning',
  returned: 'gl-badge-success',
  reintegrated: 'gl-badge-success',
  scrapped: 'gl-badge-danger',
  damaged: 'gl-badge-danger',
  missing: 'gl-badge-danger',
}

// ── Pickup status ─────────────────────────────────────────────

export const PICKUP_STATUS_LABELS_FALLBACK: Record<string, string> = {
  planned: 'Planifié',
  in_progress: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

export const PICKUP_STATUS_BADGES: Record<string, string> = {
  planned: 'gl-badge-neutral',
  in_progress: 'gl-badge-warning',
  completed: 'gl-badge-success',
  cancelled: 'gl-badge-danger',
}

// ── Weather / flight status ──────────────────────────────────

export const FLIGHT_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  green: { label: 'Vol autorise', badge: 'gl-badge-success' },
  amber: { label: 'Vol restreint', badge: 'gl-badge-warning' },
  red:   { label: 'Vol interdit',  badge: 'gl-badge-danger' },
}

// ── Helpers ───────────────────────────────────────────────────

export function formatDateShort(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export function formatDateTime(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function buildStatusOptions(labels: Record<string, string>, values: string[]) {
  return [
    { value: '', label: 'Tous' },
    ...values.map((value) => ({ value, label: labels[value] ?? value })),
  ]
}

/** Derive transport mode from vector type. */
export function deriveModeFromType(type: string): string {
  switch (type) {
    case 'helicopter':
    case 'commercial_flight':
      return 'air'
    case 'boat':
    case 'ship':
    case 'surfer':
    case 'barge':
    case 'tug':
      return 'sea'
    case 'bus':
    case '4x4':
    case 'vehicle':
      return 'road'
    default:
      return 'road'
  }
}

export function getAggregateReturnStatusLabel(status: string): string {
  switch (status) {
    case 'no_elements':
      return 'Aucun élément détaillé'
    case 'not_started':
      return 'Aucun retour saisi'
    case 'partial_return':
      return 'Retour partiel en cours'
    case 'fully_returned':
      return 'Retour complet déclaré'
    default:
      return status
  }
}
