/**
 * Widget Registry
 *
 * Système central d'enregistrement de tous les widgets disponibles.
 * Chaque module peut enregistrer ses propres widgets ici.
 */

import { ComponentType } from "react"
import type { WidgetCategory } from "@/types/dashboard"

// Import core widgets
import StatsCard from "./core/stats-card"
import ChartLine from "./core/chart-line"
import RecentActivity from "./core/recent-activity"
import TaskList from "./core/task-list"
import ProgressCard from "./core/progress-card"
import UserStats from "./core/user-stats"
import PlaceholderWidget from "./core/placeholder-widget"

// Import data widgets
import SQLQueryWidget from "./data/sql-query"
import PivotTableWidget from "./data/pivot-table"

export interface WidgetComponent {
  type: string
  component: ComponentType<any>
  name: string
  description: string
  category: WidgetCategory
  icon: string
  defaultConfig: Record<string, any>
  defaultSize: {
    w: number
    h: number
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
  }
}

/**
 * Registry de tous les widgets disponibles.
 * Les widgets sont indexés par leur type unique.
 */
export const WIDGET_REGISTRY: Record<string, WidgetComponent> = {
  // ==================== CORE WIDGETS ====================

  stats_card: {
    type: "stats_card",
    component: StatsCard,
    name: "Carte de Statistiques",
    description: "Affiche une statistique avec tendance",
    category: "stats",
    icon: "chart-bar",
    defaultConfig: {
      title: "Statistique",
      value: 0,
      trend: 0,
      description: "",
    },
    defaultSize: {
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      maxW: 6,
      maxH: 4,
    },
  },

  chart_line: {
    type: "chart_line",
    component: ChartLine,
    name: "Graphique en Ligne",
    description: "Affiche une tendance temporelle",
    category: "charts",
    icon: "chart-line",
    defaultConfig: {
      title: "Tendance",
      data: [],
      color: "blue",
    },
    defaultSize: {
      w: 4,
      h: 3,
      minW: 3,
      minH: 2,
      maxW: 12,
      maxH: 6,
    },
  },

  recent_activity: {
    type: "recent_activity",
    component: RecentActivity,
    name: "Activité Récente",
    description: "Liste des activités récentes",
    category: "lists",
    icon: "clock",
    defaultConfig: {
      title: "Activité Récente",
      activities: [],
      maxItems: 5,
    },
    defaultSize: {
      w: 4,
      h: 4,
      minW: 3,
      minH: 3,
      maxW: 6,
      maxH: 6,
    },
  },

  task_list: {
    type: "task_list",
    component: TaskList,
    name: "Liste de Tâches",
    description: "Affiche une liste de tâches avec statut",
    category: "lists",
    icon: "checklist",
    defaultConfig: {
      title: "Tâches",
      tasks: [],
      maxItems: 8,
      showPriority: true,
    },
    defaultSize: {
      w: 3,
      h: 4,
      minW: 3,
      minH: 3,
      maxW: 6,
      maxH: 6,
    },
  },

  progress_card: {
    type: "progress_card",
    component: ProgressCard,
    name: "Barre de Progression",
    description: "Affiche une progression avec pourcentage",
    category: "stats",
    icon: "progress",
    defaultConfig: {
      title: "Progression",
      value: 0,
      max: 100,
      label: "",
      description: "",
      showPercentage: true,
      color: "default",
    },
    defaultSize: {
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      maxW: 6,
      maxH: 3,
    },
  },

  user_stats: {
    type: "user_stats",
    component: UserStats,
    name: "Statistiques Utilisateurs",
    description: "Affiche les statistiques des utilisateurs",
    category: "stats",
    icon: "users",
    defaultConfig: {
      title: "Statistiques Utilisateurs",
      totalUsers: 0,
      activeUsers: 0,
      newUsers: 0,
      trend: 0,
      description: "",
    },
    defaultSize: {
      w: 3,
      h: 3,
      minW: 2,
      minH: 2,
      maxW: 6,
      maxH: 4,
    },
  },

  // ==================== DATA WIDGETS ====================

  sql_query: {
    type: "sql_query",
    component: SQLQueryWidget,
    name: "Requête SQL",
    description: "Exécute et affiche les résultats d'une requête SQL personnalisée",
    category: "data",
    icon: "database",
    defaultConfig: {
      title: "Requête SQL",
      description: "Exécuter une requête SQL personnalisée",
      query: "",
      refreshInterval: 0,
      showRowCount: true,
    },
    defaultSize: {
      w: 6,
      h: 4,
      minW: 4,
      minH: 3,
      maxW: 12,
      maxH: 8,
    },
  },

  pivot_table: {
    type: "pivot_table",
    component: PivotTableWidget,
    name: "Tableau Croisé Dynamique",
    description: "Analyse interactive de données avec pivot table",
    category: "data",
    icon: "table",
    defaultConfig: {
      title: "Tableau Croisé Dynamique",
      description: "Analyse de données interactive",
      dataSource: "",
      query: "",
      refreshInterval: 0,
      initialState: {},
    },
    defaultSize: {
      w: 8,
      h: 6,
      minW: 6,
      minH: 4,
      maxW: 12,
      maxH: 10,
    },
  },

  // Placeholder pour les widgets non implémentés
  placeholder: {
    type: "placeholder",
    component: PlaceholderWidget,
    name: "Placeholder",
    description: "Widget placeholder pour les types non implémentés",
    category: "custom",
    icon: "cube",
    defaultConfig: {
      widget_type: "unknown",
      title: "Widget",
    },
    defaultSize: {
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      maxW: 12,
      maxH: 6,
    },
  },
}

/**
 * Récupère le composant d'un widget par son type.
 * Si le widget n'existe pas, retourne le placeholder.
 */
export function getWidgetComponent(type: string): ComponentType<any> {
  const widget = WIDGET_REGISTRY[type]
  if (!widget) {
    console.warn(`Widget type "${type}" not found in registry. Using placeholder.`)
    return WIDGET_REGISTRY.placeholder.component
  }
  return widget.component
}

/**
 * Récupère les métadonnées d'un widget par son type.
 */
export function getWidgetMeta(type: string): WidgetComponent | null {
  return WIDGET_REGISTRY[type] || null
}

/**
 * Liste tous les widgets disponibles.
 */
export function getAllWidgets(): WidgetComponent[] {
  return Object.values(WIDGET_REGISTRY).filter((w) => w.type !== "placeholder")
}

/**
 * Liste les widgets par catégorie.
 */
export function getWidgetsByCategory(category?: WidgetCategory): WidgetComponent[] {
  const widgets = getAllWidgets()
  return category ? widgets.filter((w) => w.category === category) : widgets
}

/**
 * Liste toutes les catégories de widgets disponibles.
 */
export function getWidgetCategories(): WidgetCategory[] {
  const categories = new Set<WidgetCategory>()
  getAllWidgets().forEach((w) => categories.add(w.category))
  return Array.from(categories)
}

/**
 * Enregistre un nouveau widget dans le registry.
 * Utilisé par les modules pour ajouter leurs widgets custom.
 */
export function registerWidget(widget: WidgetComponent): void {
  if (WIDGET_REGISTRY[widget.type]) {
    console.warn(
      `Widget type "${widget.type}" is already registered. Overwriting.`
    )
  }
  WIDGET_REGISTRY[widget.type] = widget
}

/**
 * Enregistre plusieurs widgets en une fois.
 */
export function registerWidgets(widgets: WidgetComponent[]): void {
  widgets.forEach(registerWidget)
}
