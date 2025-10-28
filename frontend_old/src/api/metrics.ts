/**
 * API Client pour le Metrics Service
 */

import { apiClient } from './client'

export interface MetricValue {
  type: 'counter' | 'gauge' | 'histogram'
  values?: Record<string, number>
  stats?: Record<string, {
    count: number
    sum: number
    buckets: Record<number, number>
  }>
}

export interface MetricsStats {
  [metricName: string]: MetricValue
}

/**
 * Récupère les métriques au format Prometheus
 */
export async function getPrometheusMetrics() {
  const response = await apiClient.get<string>('/metrics', {
    headers: {
      'Accept': 'text/plain',
    },
  })
  return response.data
}

/**
 * Récupère les statistiques de toutes les métriques
 */
export async function getMetricsStats() {
  const response = await apiClient.get<MetricsStats>('/metrics/stats')
  return response.data
}

/**
 * Réinitialise toutes les métriques
 */
export async function resetMetrics() {
  const response = await apiClient.post<{
    success: boolean
    message: string
  }>('/metrics/reset')

  return response.data
}
