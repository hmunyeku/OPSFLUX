/**
 * Third Parties Module - Frontend Entry Point
 *
 * Ce fichier est le point d'entrée du module Third Parties côté frontend.
 * Il exporte tout ce qui doit être accessible depuis l'application principale.
 *
 * ⚠️ IMPORTANT : Le chargement du module se fait via module.config.ts
 * Ce fichier est conservé pour la rétrocompatibilité et les imports directs.
 */

// Export de la configuration du module
export { default as ThirdPartiesModule } from "./module.config"

// Export widgets
export * from "./widgets"
export { default as THIRD_PARTIES_WIDGETS } from "./widgets/registry"

// Export types
export * from "./types"

// Export API client
export * from "./api"

// Module metadata (deprecated - utilisez ThirdPartiesModule.config à la place)
export const MODULE_INFO = {
  code: "third-parties",
  name: "Third Parties Management",
  version: "1.0.0",
  description: "Gestion complète des tiers : entreprises, contacts, invitations externes",
}
