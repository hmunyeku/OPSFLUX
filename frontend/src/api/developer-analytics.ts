/**
 * API client pour les analytics développeurs
 */

import { apiClient } from "./client"

// ==================== TYPES ====================

export interface ApiRequestsStats {
  successful: number
  failed: number
  total: number
  chart_data: Array<{
    period: string
    count: number
  }>
  period_type: "day" | "week" | "month"
}

export interface ApiResponseTimeStats {
  min: number  // milliseconds
  avg: number
  max: number
  chart_data: Array<{
    period: string
    time: number  // milliseconds
  }>
  period_type: "day" | "week" | "month"
}

export interface VisitorsStats {
  total_desktop: number
  total_mobile: number
  chart_data: Array<{
    date: string
    desktop: number
    mobile: number
  }>
}

export interface Activity {
  id: number
  type: "pull-request" | "issue-opened" | "commit" | "issue-closed"
  title: string
  description: string
  user: {
    name: string
    avatar: string
  }
  time: string
  status: "open" | "closed" | "merged"
}

export interface RecentActivityResponse {
  activities: Activity[]
}

// ==================== API FUNCTIONS ====================

/**
 * Récupère les statistiques des requêtes API
 */
export async function getApiRequestsStats(params?: {
  period?: "day" | "week" | "month"
  start_date?: string
  end_date?: string
}): Promise<ApiRequestsStats> {
  const response = await apiClient.get("/developer-analytics/api-requests", {
    params,
  })
  return response.data
}

/**
 * Récupère les statistiques des temps de réponse API
 */
export async function getApiResponseTimeStats(params?: {
  period?: "day" | "week" | "month"
  start_date?: string
  end_date?: string
}): Promise<ApiResponseTimeStats> {
  const response = await apiClient.get("/developer-analytics/api-response-time", {
    params,
  })
  return response.data
}

/**
 * Récupère les statistiques des visiteurs (desktop vs mobile)
 */
export async function getVisitorsStats(params?: {
  start_date?: string
  end_date?: string
}): Promise<VisitorsStats> {
  const response = await apiClient.get("/developer-analytics/visitors", {
    params,
  })
  return response.data
}

/**
 * Récupère l'activité récente
 */
export async function getRecentActivity(params?: {
  limit?: number
}): Promise<RecentActivityResponse> {
  const response = await apiClient.get("/developer-analytics/recent-activity", {
    params,
  })
  return response.data
}
