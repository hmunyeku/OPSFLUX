/**
 * [MODULE_NAME] Module - Frontend Entry Point
 *
 * Ce fichier est le point d'entrée du module [MODULE_NAME] côté frontend.
 * Il exporte tout ce qui doit être accessible depuis l'application principale.
 *
 * ⚠️ IMPORTANT : Le chargement du module se fait via module.config.ts
 * Ce fichier est conservé pour les imports directs si nécessaire.
 */

// Export de la configuration du module
export { default as MyModule } from "./module.config"

// Export widgets
export * from "./widgets"
export { default as MY_WIDGETS } from "./widgets/registry"

// Export types (si vous en avez)
// export * from "./types"

// Export API client (si vous en avez)
// export * from "./api"
