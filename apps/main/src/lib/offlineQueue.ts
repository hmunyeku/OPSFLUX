/**
 * Offline mutation queue — queues API mutations when offline, replays when back online.
 *
 * Uses IndexedDB via `idb-keyval` for persistence across page reloads.
 * Integrates with the useNetworkStatus hook and syncing events for the Topbar LED.
 *
 * Usage:
 *   import { offlineQueue } from '@/lib/offlineQueue'
 *   // Queue a mutation while offline:
 *   offlineQueue.enqueue('/api/v1/assets', 'POST', { name: 'Pump-01' })
 *   // Process queue when back online (called automatically via event listeners):
 *   offlineQueue.processQueue()
 *   // Get queue size for UI badge:
 *   const size = await offlineQueue.getQueueSize()
 */
import { get, set, del, keys, createStore } from 'idb-keyval'

// ── Types ─────────────────────────────────────────────────────

export interface QueuedMutation {
  id: string
  endpoint: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  timestamp: number
  retries: number
}

// ── IndexedDB store (separate from app data) ──────────────────

const queueStore = createStore('opsflux-offline-queue', 'mutations')

// ── Helpers ───────────────────────────────────────────────────

function generateId(): string {
  return `oq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** Resolve API base URL the same way as the axios instance. */
function getBaseUrl(): string {
  try {
    return import.meta.env.VITE_API_URL || ''
  } catch {
    return ''
  }
}

/** Get current auth token from localStorage. */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = localStorage.getItem('access_token')
  if (token) headers['Authorization'] = `Bearer ${token}`
  const entityId = localStorage.getItem('entity_id')
  if (entityId) headers['X-Entity-ID'] = entityId
  return headers
}

// ── Queue operations ──────────────────────────────────────────

let processing = false

async function enqueue(
  endpoint: string,
  method: QueuedMutation['method'],
  body?: unknown,
  headers?: Record<string, string>,
): Promise<string> {
  const mutation: QueuedMutation = {
    id: generateId(),
    endpoint,
    method,
    body,
    headers,
    timestamp: Date.now(),
    retries: 0,
  }

  await set(mutation.id, mutation, queueStore)

  // Notify listeners that queue changed
  window.dispatchEvent(new CustomEvent('opsflux:queue-change'))

  return mutation.id
}

async function getQueueSize(): Promise<number> {
  const allKeys = await keys(queueStore)
  return allKeys.length
}

async function getAllMutations(): Promise<QueuedMutation[]> {
  const allKeys = await keys(queueStore)
  const mutations: QueuedMutation[] = []
  for (const key of allKeys) {
    const item = await get<QueuedMutation>(key, queueStore)
    if (item) mutations.push(item)
  }
  // Sort by timestamp, oldest first
  return mutations.sort((a, b) => a.timestamp - b.timestamp)
}

async function removeMutation(id: string): Promise<void> {
  await del(id, queueStore)
  window.dispatchEvent(new CustomEvent('opsflux:queue-change'))
}

async function clearQueue(): Promise<void> {
  const allKeys = await keys(queueStore)
  for (const key of allKeys) {
    await del(key, queueStore)
  }
  window.dispatchEvent(new CustomEvent('opsflux:queue-change'))
}

const MAX_RETRIES = 3

async function processQueue(): Promise<{ processed: number; failed: number }> {
  if (processing) return { processed: 0, failed: 0 }
  if (!navigator.onLine) return { processed: 0, failed: 0 }

  processing = true
  window.dispatchEvent(new Event('opsflux:sync-start'))

  const mutations = await getAllMutations()
  let processed = 0
  let failed = 0
  const baseUrl = getBaseUrl()

  for (const mutation of mutations) {
    try {
      const url = `${baseUrl}${mutation.endpoint}`
      const headers = { ...getAuthHeaders(), ...mutation.headers }

      const response = await fetch(url, {
        method: mutation.method,
        headers,
        body: mutation.body != null ? JSON.stringify(mutation.body) : undefined,
      })

      if (response.ok || (response.status >= 200 && response.status < 500)) {
        // Success or client error (don't retry 4xx — it won't change)
        await removeMutation(mutation.id)
        processed++
      } else {
        // Server error — retry later
        mutation.retries++
        if (mutation.retries >= MAX_RETRIES) {
          // Give up after max retries
          await removeMutation(mutation.id)
          failed++
          console.warn(`[OfflineQueue] Giving up on mutation ${mutation.id} after ${MAX_RETRIES} retries`)
        } else {
          await set(mutation.id, mutation, queueStore)
          failed++
        }
      }
    } catch {
      // Network error — stop processing (probably went offline again)
      mutation.retries++
      await set(mutation.id, mutation, queueStore)
      failed++
      break
    }
  }

  processing = false
  window.dispatchEvent(new Event('opsflux:sync-end'))
  window.dispatchEvent(new CustomEvent('opsflux:queue-change'))

  return { processed, failed }
}

// ── Auto-process when coming back online ──────────────────────

function setupAutoSync() {
  window.addEventListener('online', () => {
    // Small delay to let network stabilize
    setTimeout(() => {
      processQueue()
    }, 2000)
  })
}

// Initialize auto-sync on module load
if (typeof window !== 'undefined') {
  setupAutoSync()
}

// ── Public API ────────────────────────────────────────────────

export const offlineQueue = {
  enqueue,
  processQueue,
  getQueueSize,
  getAllMutations,
  removeMutation,
  clearQueue,
} as const
