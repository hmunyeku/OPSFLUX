/**
 * Third Parties Module Configuration
 *
 * Ce fichier définit la configuration complète du module Third Parties.
 * Il est automatiquement chargé par le ModuleLoader.
 */

import type { Module } from "@/lib/types/module"
import { THIRD_PARTIES_WIDGETS } from "./widgets/registry"

/**
 * Configuration et exports du module Third Parties
 */
export const ThirdPartiesModule: Module = {
  config: {
    code: "third-parties",
    name: "Third Parties Management",
    version: "1.0.0",
    description: "Gestion complète des tiers : entreprises, contacts, invitations externes",
    author: "Perenco OpsFlux Team",
  },

  // Widgets fournis par le module
  widgets: THIRD_PARTIES_WIDGETS,

  // Routes du module (optionnel - si besoin d'ajouter des routes personnalisées)
  routes: [
    // Exemple : route personnalisée si nécessaire
    // {
    //   path: "/third-parties/dashboard",
    //   component: ThirdPartiesDashboard,
    //   name: "Third Parties Dashboard",
    //   icon: "building",
    //   order: 10,
    //   requireAuth: true,
    // }
  ],

  // Hook d'initialisation
  onInit: async () => {
    console.log("📦 Third Parties module initialized")
    // Vous pouvez ajouter ici toute logique d'initialisation
    // Ex: initialisation de cache, vérifications, etc.
  },

  // Hook de nettoyage
  onDestroy: async () => {
    console.log("📦 Third Parties module destroyed")
    // Nettoyage si nécessaire
  },
}

// Export par défaut pour le chargement dynamique
export default ThirdPartiesModule
