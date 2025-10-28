/**
 * API Client pour le Search Service
 */

import { apiClient } from './client'

export interface SearchResult {
  collection: string
  doc_id: string
  document: Record<string, unknown>
  score: number
  metadata?: Record<string, unknown>
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  count: number
}

export interface AutocompleteResponse {
  query: string
  suggestions: string[]
}

export interface SearchParams {
  query: string
  collections?: string[]
  filters?: Record<string, unknown>
  limit?: number
  offset?: number
  fuzzy?: boolean
}

/**
 * Effectue une recherche full-text
 */
export async function searchDocuments(params: SearchParams) {
  const response = await apiClient.post<SearchResponse>('/search/', params)
  return response.data
}

/**
 * Récupère des suggestions d'autocomplétion
 */
export async function getAutocomplete(query: string, collections?: string[], limit?: number) {
  const response = await apiClient.get<AutocompleteResponse>('/search/autocomplete', {
    params: { query, collections, limit }
  })
  return response.data
}

/**
 * Indexe un document
 */
export async function indexDocument(
  collection: string,
  doc_id: string,
  document: Record<string, unknown>,
  metadata?: Record<string, unknown>
) {
  const response = await apiClient.post<{ success: boolean; indexed: boolean }>('/search/index', {
    collection,
    doc_id,
    document,
    metadata
  })
  return response.data
}

/**
 * Supprime un document de l'index
 */
export async function deleteDocument(collection: string, doc_id: string) {
  const response = await apiClient.delete<{ success: boolean; deleted: boolean }>(
    `/search/${collection}/${doc_id}`
  )
  return response.data
}

/**
 * Vide une collection
 */
export async function clearCollection(collection: string) {
  const response = await apiClient.delete<{ success: boolean; deleted_count: number }>(
    `/search/collection/${collection}`
  )
  return response.data
}

/**
 * Réindexe une collection
 */
export async function reindexCollection(collection: string) {
  const response = await apiClient.post<{ success: boolean; reindexed_count: number }>(
    `/search/reindex/${collection}`
  )
  return response.data
}
