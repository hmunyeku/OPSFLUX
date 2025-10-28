/**
 * API client pour le System Health monitoring
 */

import { apiClient } from "./client"

// ==================== TYPES ====================

export interface ConnectionStats {
  total: number
  active: number
  idle: number
  max: number
}

export interface DatabaseHealth {
  status: "healthy" | "unhealthy"
  service: "PostgreSQL"
  version?: string
  database?: string
  size_mb?: number
  response_time_ms?: number
  connections?: ConnectionStats
  error?: string
  timestamp: string
}

export interface RedisHealth {
  status: "healthy" | "unhealthy"
  service: "Redis"
  version?: string
  used_memory_mb?: number
  connected_clients?: number
  uptime_days?: number
  response_time_ms?: number
  error?: string
  timestamp: string
}

export interface WorkerInfo {
  status: "active" | "inactive"
  tasks_completed: number
}

export interface CeleryHealth {
  status: "healthy" | "unhealthy"
  service: "Celery"
  workers?: {
    default: WorkerInfo
    high: WorkerInfo
    low: WorkerInfo
  }
  queue_length?: number
  error?: string
  timestamp: string
}

export interface ResourceMetrics {
  usage_percent: number
  status: "normal" | "warning" | "critical"
}

export interface CpuMetrics extends ResourceMetrics {
  count: number
}

export interface MemoryMetrics extends ResourceMetrics {
  total_mb: number
  used_mb: number
  available_mb: number
}

export interface DiskMetrics extends ResourceMetrics {
  total_gb: number
  used_gb: number
  free_gb: number
}

export interface SystemResources {
  status: "healthy" | "unhealthy"
  cpu?: CpuMetrics
  memory?: MemoryMetrics
  disk?: DiskMetrics
  error?: string
  timestamp: string
}

export interface SystemHealthResponse {
  overall_status: "healthy" | "degraded" | "unhealthy"
  timestamp: string
  services: {
    database: DatabaseHealth
    cache: RedisHealth
    workers: CeleryHealth
    system: SystemResources
  }
  summary: {
    total_services: number
    healthy: number
    unhealthy: number
  }
}

export interface HealthHistoryDataPoint {
  timestamp: string
  overall_status: "healthy" | "degraded" | "unhealthy"
  cpu_usage: number
  memory_usage: number
  disk_usage: number
}

export interface HealthHistoryResponse {
  period_hours: number
  data_points: number
  history: HealthHistoryDataPoint[]
}

// ==================== API FUNCTIONS ====================

/**
 * Récupère l'état de santé global du système
 */
export async function getSystemHealth(): Promise<SystemHealthResponse> {
  const response = await apiClient.get("/system-health/")
  return response.data
}

/**
 * Récupère les détails de santé de la base de données
 */
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const response = await apiClient.get("/system-health/database")
  return response.data
}

/**
 * Récupère les détails de santé du cache Redis
 */
export async function getCacheHealth(): Promise<RedisHealth> {
  const response = await apiClient.get("/system-health/cache")
  return response.data
}

/**
 * Récupère les détails de santé des workers Celery
 */
export async function getWorkersHealth(): Promise<CeleryHealth> {
  const response = await apiClient.get("/system-health/workers")
  return response.data
}

/**
 * Récupère les détails des ressources système
 */
export async function getSystemResources(): Promise<SystemResources> {
  const response = await apiClient.get("/system-health/system")
  return response.data
}

/**
 * Récupère l'historique de santé du système
 */
export async function getHealthHistory(hours: number = 24): Promise<HealthHistoryResponse> {
  const response = await apiClient.get("/system-health/history", {
    params: { hours },
  })
  return response.data
}
