/**
 * [MODULE_NAME] Module - API Client
 *
 * Ce fichier contient toutes les fonctions pour communiquer avec l'API backend du module.
 */

import type { MyItem, CreateMyItemParams, UpdateMyItemParams } from "./types"

const BASE_URL = "/api/v1/[MODULE_CODE]"

/**
 * Récupère la liste des items
 */
export async function getMyItems(params?: {
  skip?: number
  limit?: number
  status?: string
}): Promise<{ data: MyItem[]; total: number }> {
  const queryParams = new URLSearchParams()
  if (params?.skip) queryParams.append("skip", params.skip.toString())
  if (params?.limit) queryParams.append("limit", params.limit.toString())
  if (params?.status) queryParams.append("status", params.status)

  const response = await fetch(`${BASE_URL}/items?${queryParams}`)

  if (!response.ok) {
    throw new Error(`Failed to fetch items: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Récupère un item spécifique
 */
export async function getMyItem(id: string): Promise<MyItem> {
  const response = await fetch(`${BASE_URL}/items/${id}`)

  if (!response.ok) {
    throw new Error(`Failed to fetch item: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Crée un nouvel item
 */
export async function createMyItem(data: CreateMyItemParams): Promise<MyItem> {
  const response = await fetch(`${BASE_URL}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error(`Failed to create item: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Met à jour un item existant
 */
export async function updateMyItem(
  id: string,
  data: UpdateMyItemParams
): Promise<MyItem> {
  const response = await fetch(`${BASE_URL}/items/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error(`Failed to update item: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Supprime un item
 */
export async function deleteMyItem(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/items/${id}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    throw new Error(`Failed to delete item: ${response.statusText}`)
  }
}
