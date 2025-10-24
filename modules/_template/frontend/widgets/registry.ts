/**
 * Widget Registry for [MODULE_NAME] Module
 *
 * Ce fichier définit tous les widgets du module [MODULE_NAME].
 * Ces widgets seront automatiquement chargés par le ModuleLoader.
 *
 * Instructions:
 * 1. Importez vos composants widgets
 * 2. Définissez chaque widget dans le tableau MY_WIDGETS
 * 3. Préfixez les types de widgets avec le code de votre module
 * 4. Exportez le tableau pour l'utiliser dans module.config.ts
 */

import type { WidgetComponent } from "@/widgets/registry"
// import MyExampleWidget from "./my-example-widget"

/**
 * Widgets définis dans le module [MODULE_NAME]
 * Ces widgets seront automatiquement enregistrés dans le registry global
 */
export const MY_WIDGETS: WidgetComponent[] = [
  // Exemple de widget - décommentez et adaptez selon vos besoins
  /*
  {
    type: "[MODULE_CODE]_my_widget", // ⚠️ Préfixez TOUJOURS avec le code du module
    component: MyExampleWidget,
    name: "Mon Widget",
    description: "Description de ce que fait le widget",
    category: "stats", // stats, charts, lists, notifications, analytics, custom
    icon: "chart-bar", // Icône Lucide React
    defaultConfig: {
      // Configuration par défaut du widget
      title: "Titre par défaut",
      refreshInterval: 60000, // 1 minute
      showLegend: true,
    },
    defaultSize: {
      // Taille par défaut dans la grille (12 colonnes)
      w: 4, // Largeur (colonnes)
      h: 3, // Hauteur (unités)
      minW: 3, // Largeur minimale
      minH: 2, // Hauteur minimale
      maxW: 12, // Largeur maximale
      maxH: 6, // Hauteur maximale
    },
  },
  */
]

export default MY_WIDGETS
