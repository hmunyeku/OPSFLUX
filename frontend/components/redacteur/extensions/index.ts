/**
 * Extensions Tiptap Personnalisées pour le Module Rédacteur
 *
 * Ces extensions ajoutent des fonctionnalités avancées à l'éditeur Tiptap
 * pour créer des rapports professionnels avec des blocs dynamiques.
 */

export { DataFetchExtension } from "./data-fetch-extension"
export { ChartExtension } from "./chart-extension"
export { FormulaExtension } from "./formula-extension"
export { SignatureExtension } from "./signature-extension"
export { ReferenceExtension } from "./reference-extension"
export { VariablesExtension } from "./variables-extension"
export { CommentsExtension } from "./comments-extension"
// export { AdvancedImageExtension } from "./advanced-image-extension"

/**
 * Liste des extensions disponibles
 */
export const AVAILABLE_CUSTOM_BLOCKS = [
  {
    name: "dataFetch",
    displayName: "Données Dynamiques",
    description: "Récupère et affiche des données depuis une API ou une base de données",
    icon: "database",
    category: "data",
    command: "setDataFetch",
  },
  {
    name: "chart",
    displayName: "Graphique",
    description: "Affiche des données sous forme de graphiques (ligne, barres, camembert, aire)",
    icon: "bar-chart-3",
    category: "data",
    command: "setChart",
  },
  {
    name: "formula",
    displayName: "Formule",
    description: "Calculs dynamiques avec formules mathématiques",
    icon: "calculator",
    category: "data",
    command: "setFormula",
  },
  {
    name: "signature",
    displayName: "Signature",
    description: "Bloc de signature électronique",
    icon: "pen-tool",
    category: "interactive",
    command: "setSignature",
  },
  {
    name: "reference",
    displayName: "Référence",
    description: "Référence vers un autre document ou section",
    icon: "link-2",
    category: "layout",
    command: "setReference",
  },
  {
    name: "variable",
    displayName: "Variable",
    description: "Variables dynamiques (date, auteur, etc.)",
    icon: "braces",
    category: "data",
    command: "setVariable",
  },
  {
    name: "comment",
    displayName: "Commentaire",
    description: "Commentaires attachés au texte (mark inline)",
    icon: "message-square",
    category: "interactive",
    command: "setComment",
  },
  // {
  //   name: "advancedImage",
  //   displayName: "Image Éditable",
  //   description: "Image avec outils d'édition intégrés",
  //   icon: "image",
  //   category: "media",
  //   command: "setAdvancedImage",
  // },
]

/**
 * Catégories de blocs
 */
export const BLOCK_CATEGORIES = {
  data: { label: "Données", icon: "database" },
  interactive: { label: "Interactif", icon: "pointer" },
  layout: { label: "Mise en page", icon: "layout" },
  media: { label: "Média", icon: "image" },
}
