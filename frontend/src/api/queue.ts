/**
 * API Client pour le Queue Service (Celery)
 */

import { apiClient } from './client'

export enum TaskPriority {
  LOW = 0,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 15,
}

export enum TaskStatus {
  PENDING = 'pending',
  STARTED = 'started',
  RETRY = 'retry',
  FAILURE = 'failure',
  SUCCESS = 'success',
  REVOKED = 'revoked',
}

export interface TaskInfo {
  task_id: string
  status: TaskStatus
  result?: any
  error?: string
  traceback?: string
  started_at?: string
}

export interface QueueStats {
  workers: Record<string, {
    active: number
    scheduled: number
    reserved: number
  }>
  queues: Record<string, {
    length: number
  }>
  tasks: Record<string, any>
}

/**
 * Enqueue une tâche
 */
export async function enqueueTask(
  taskName: string,
  args: any[] = [],
  kwargs: Record<string, any> = {},
  priority: TaskPriority = TaskPriority.NORMAL,
  countdown?: number,
  queue?: string
) {
  const response = await apiClient.post<{
    success: boolean
    task_id: string
    task_name: string
  }>('/queue/enqueue', {
    task_name: taskName,
    args,
    kwargs,
    priority,
    countdown,
    queue,
  })

  return response.data
}

/**
 * Récupère le statut d'une tâche
 */
export async function getTaskStatus(taskId: string) {
  const response = await apiClient.get<TaskInfo>(`/queue/status/${taskId}`)
  return response.data
}

/**
 * Récupère le résultat d'une tâche
 */
export async function getTaskResult(taskId: string, timeout = 30) {
  const response = await apiClient.get<{
    task_id: string
    result: any
  }>(`/queue/result/${taskId}`, {
    params: { timeout },
  })
  return response.data
}

/**
 * Annule une tâche
 */
export async function cancelTask(taskId: string, terminate = false) {
  const response = await apiClient.post<{
    success: boolean
    task_id: string
    terminated: boolean
  }>(`/queue/cancel/${taskId}`, { terminate })

  return response.data
}

/**
 * Récupère les statistiques des queues
 */
export async function getQueueStats() {
  const response = await apiClient.get<QueueStats>('/queue/stats')
  return response.data
}

/**
 * Vide une queue
 */
export async function purgeQueue(queueName: string) {
  const response = await apiClient.post<{
    success: boolean
    queue: string
    tasks_deleted: number
  }>(`/queue/purge/${queueName}`)

  return response.data
}
