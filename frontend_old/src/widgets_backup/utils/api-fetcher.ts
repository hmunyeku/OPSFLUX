/**
 * Utility functions for fetching data in widgets
 */

import { auth } from "@/lib/auth"

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "/api/v1"

/**
 * Extrait une valeur d'un objet en utilisant un chemin en notation pointée
 * @param data - L'objet source
 * @param path - Le chemin vers la valeur (ex: "data.users.count")
 * @param defaultValue - Valeur par défaut si le chemin n'existe pas
 */
export function extractValueByPath<T = any>(
  data: any,
  path: string | undefined,
  defaultValue?: T
): T {
  if (!path) return (data as T) ?? defaultValue

  const paths = path.split(".")
  let result = data

  for (const p of paths) {
    if (result?.[p] === undefined) {
      return defaultValue as T
    }
    result = result[p]
  }

  return (result as T) ?? defaultValue
}

/**
 * Effectue une requête API authentifiée
 * @param endpoint - URL de l'API (relative ou absolue)
 * @param options - Options de la requête fetch
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = auth.getToken()
  if (!token) {
    throw new Error("Non authentifié")
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint}`

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
}

/**
 * Hook-like utility pour gérer le chargement de données avec auto-refresh
 */
export interface FetchOptions {
  endpoint?: string
  valuePath?: string
  refreshInterval?: number
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
}
