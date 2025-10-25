/**
 * Error Tracking API Client
 * Gestion des logs d'erreurs et statistiques
 */

import apiClient from "./client"

// Enums matching backend
export enum ErrorSeverity {
  DEBUG = "debug",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical",
}

export enum ErrorStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
  IGNORED = "ignored",
}

export enum ErrorSource {
  BACKEND = "backend",
  FRONTEND = "frontend",
  WORKER = "worker",
  DATABASE = "database",
  EXTERNAL_API = "external_api",
  SYSTEM = "system",
}

// Error Log interfaces
export interface ErrorLog {
  id: string
  created_at: string
  updated_at: string
  created_by_id?: string

  error_type: string
  message: string
  severity: ErrorSeverity
  source: ErrorSource
  status: ErrorStatus

  // Technical context
  stacktrace?: string
  file_path?: string
  line_number?: number
  function_name?: string

  // User context
  user_id?: string
  request_path?: string
  request_method?: string
  user_agent?: string
  ip_address?: string

  // Extra data
  extra_data?: Record<string, any>

  // Resolution
  resolved_at?: string
  resolved_by_id?: string
  resolution_notes?: string

  // Grouping
  error_hash?: string
  occurrence_count: number
  last_seen_at: string
}

export interface ErrorLogCreate {
  error_type: string
  message: string
  severity?: ErrorSeverity
  source?: ErrorSource
  stacktrace?: string
  file_path?: string
  line_number?: number
  function_name?: string
  user_id?: string
  request_path?: string
  request_method?: string
  user_agent?: string
  ip_address?: string
  extra_data?: Record<string, any>
  error_hash?: string
}

export interface ErrorLogUpdate {
  status?: ErrorStatus
  resolution_notes?: string
  resolved_by_id?: string
}

export interface ErrorLogsResponse {
  data: ErrorLog[]
  count: number
}

export interface ErrorStats {
  total_errors: number
  open_errors: number
  resolved_errors: number
  critical_errors: number
  errors_by_severity: Record<string, number>
  errors_by_source: Record<string, number>
  errors_by_status: Record<string, number>
  recent_errors: ErrorLog[]
  top_errors: Array<{
    error_type: string
    message: string
    occurrence_count: number
    severity: string
    source: string
  }>
}

export interface ErrorLogFilters {
  skip?: number
  limit?: number
  severity?: ErrorSeverity
  source?: ErrorSource
  status?: ErrorStatus
  search?: string
}

/**
 * Create a new error log
 */
export async function createErrorLog(data: ErrorLogCreate): Promise<ErrorLog> {
  const response = await apiClient.post("/error-tracking/", data)
  return response.data
}

/**
 * Get list of error logs with filters
 */
export async function getErrorLogs(filters?: ErrorLogFilters): Promise<ErrorLogsResponse> {
  const response = await apiClient.get("/error-tracking/", { params: filters })
  return response.data
}

/**
 * Get error statistics
 */
export async function getErrorStats(days: number = 7): Promise<ErrorStats> {
  const response = await apiClient.get("/error-tracking/stats", { params: { days } })
  return response.data
}

/**
 * Get single error log by ID
 */
export async function getErrorLog(errorId: string): Promise<ErrorLog> {
  const response = await apiClient.get(`/error-tracking/${errorId}`)
  return response.data
}

/**
 * Update error log (status, resolution notes)
 */
export async function updateErrorLog(
  errorId: string,
  data: ErrorLogUpdate
): Promise<ErrorLog> {
  const response = await apiClient.patch(`/error-tracking/${errorId}`, data)
  return response.data
}

/**
 * Delete error log
 */
export async function deleteErrorLog(errorId: string): Promise<void> {
  await apiClient.delete(`/error-tracking/${errorId}`)
}

/**
 * Bulk delete resolved errors
 */
export async function bulkDeleteResolvedErrors(olderThanDays: number = 30): Promise<{ message: string }> {
  const response = await apiClient.delete("/error-tracking/bulk/resolved", {
    params: { older_than_days: olderThanDays }
  })
  return response.data
}
