/**
 * [MODULE_NAME] Module Configuration
 *
 * Ce fichier définit la configuration complète du module [MODULE_NAME].
 * Il est automatiquement chargé par le ModuleLoader.
 *
 * Instructions:
 * 1. Remplacez [MODULE_CODE] par le code kebab-case de votre module
 * 2. Remplacez [MODULE_NAME] par le nom de votre module
 * 3. Décommentez et implémentez les sections dont vous avez besoin
 * 4. Supprimez ce commentaire une fois terminé
 */

import type { Module } from "@/lib/types/module"
// import { MY_WIDGETS } from "./widgets/registry"

/**
 * Configuration et exports du module [MODULE_NAME]
 */
export const MyModule: Module = {
  config: {
    code: "[MODULE_CODE]", // Ex: "inventory-management"
    name: "[MODULE_NAME]", // Ex: "Inventory Management"
    version: "1.0.0",
    description: "Description de votre module",
    author: "Votre Nom",
    dependencies: [], // Autres modules requis: ["third-parties", "users"]
  },

  // Widgets fournis par le module
  // Décommentez et importez vos widgets depuis widgets/registry.ts
  // widgets: MY_WIDGETS,
  widgets: [],

  // Routes du module (optionnel)
  routes: [
    // Exemple de route personnalisée
    // {
    //   path: "/[MODULE_CODE]/dashboard",
    //   component: MyDashboard,
    //   name: "Mon Dashboard",
    //   icon: "layout-dashboard",
    //   order: 10,
    //   requireAuth: true,
    // }
  ],

  // Hook d'initialisation (optionnel)
  // Appelé lors du chargement du module
  onInit: async () => {
    console.log(`📦 [MODULE_NAME] module initialized`)

    // Exemples d'initialisation :
    // - Initialiser un cache local
    // - Vérifier des permissions
    // - Charger des données nécessaires
    // - Initialiser des services tiers
  },

  // Hook de nettoyage (optionnel)
  // Appelé lors du déchargement du module
  onDestroy: async () => {
    console.log(`📦 [MODULE_NAME] module destroyed`)

    // Exemples de nettoyage :
    // - Nettoyer les caches
    // - Fermer des connexions
    // - Annuler des timers/intervals
    // - Libérer des ressources
  },
}

// Export par défaut OBLIGATOIRE pour le chargement dynamique
export default MyModule
