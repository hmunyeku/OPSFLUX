/**
 * Types pour le système de modules
 *
 * Définit l'interface standard que tous les modules doivent implémenter
 */

import type { WidgetComponent } from "@/widgets/registry"

/**
 * Configuration d'un module
 */
export interface ModuleConfig {
  /** Code unique du module (doit correspondre au nom du dossier) */
  code: string

  /** Nom d'affichage du module */
  name: string

  /** Version du module */
  version: string

  /** Description du module */
  description: string

  /** Auteur du module */
  author?: string

  /** Dépendances du module (autres modules requis) */
  dependencies?: string[]
}

/**
 * Page de module
 */
export interface ModulePage {
  /** Chemin de la page (avec support des paramètres :id) */
  path: string

  /** Composant à afficher */
  component: React.ComponentType<any>
}

/**
 * Interface complète d'un module
 * Chaque module doit exporter un objet de ce type
 */
export interface Module {
  /** Configuration du module */
  config: ModuleConfig

  /** Widgets fournis par le module */
  widgets?: WidgetComponent[]

  /** Pages du module (Next.js pages) */
  pages?: ModulePage[]

  /** Routes à ajouter à l'application (DEPRECATED - utiliser pages) */
  routes?: ModuleRoute[]

  /** Hook d'initialisation (appelé au chargement du module) */
  onInit?: () => void | Promise<void>

  /** Hook de nettoyage (appelé lors du déchargement du module) */
  onDestroy?: () => void | Promise<void>
}

/**
 * Route de module
 */
export interface ModuleRoute {
  /** Chemin de la route */
  path: string

  /** Composant à afficher */
  component: React.ComponentType<any>

  /** Nom de la route */
  name: string

  /** Icône pour la navigation */
  icon?: string

  /** Ordre dans le menu */
  order?: number

  /** Requiert une authentification */
  requireAuth?: boolean
}

/**
 * État d'un module chargé
 */
export interface LoadedModule {
  /** Configuration du module */
  config: ModuleConfig

  /** Module complet */
  module: Module

  /** Date de chargement */
  loadedAt: Date

  /** Statut du module */
  status: "active" | "error" | "loading"

  /** Message d'erreur si le chargement a échoué */
  error?: string
}
