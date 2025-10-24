/**
 * [MODULE_NAME] Module - Types
 *
 * Définissez ici tous les types TypeScript utilisés dans votre module.
 */

// Exemple de types - adaptez selon vos besoins

/**
 * Interface pour un item de votre module
 */
export interface MyItem {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  status: "active" | "inactive" | "pending"
}

/**
 * Paramètres pour créer un nouvel item
 */
export interface CreateMyItemParams {
  name: string
  description?: string
}

/**
 * Paramètres pour mettre à jour un item
 */
export interface UpdateMyItemParams {
  name?: string
  description?: string
  status?: "active" | "inactive" | "pending"
}

/**
 * Configuration d'un widget du module
 */
export interface MyWidgetConfig {
  title?: string
  refreshInterval?: number
  [key: string]: any
}
