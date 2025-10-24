/**
 * Widget Registry for Third Parties Module
 *
 * Ce fichier définit tous les widgets du module Third Parties
 * et sera automatiquement chargé par le ModuleLoader
 */

import type { WidgetComponent } from "@/widgets/registry"
import ThirdPartiesStatsOverview from "./stats-overview"
import ThirdPartiesRecentCompanies from "./recent-companies"
import ThirdPartiesCompaniesByType from "./companies-by-type"
import ThirdPartiesCompaniesByStatus from "./companies-by-status"
import ThirdPartiesRecentContacts from "./recent-contacts"
import ThirdPartiesPendingInvitations from "./pending-invitations"
import ThirdPartiesContactsEvolution from "./contacts-evolution"
import ThirdPartiesTopCompanies from "./top-companies"

/**
 * Widgets définis dans le module Third Parties
 * Ces widgets seront automatiquement enregistrés dans le registry global
 */
export const THIRD_PARTIES_WIDGETS: WidgetComponent[] = [
  {
    type: "third_parties_stats_overview",
    component: ThirdPartiesStatsOverview,
    name: "Aperçu Statistiques Tiers",
    description: "Statistiques globales des entreprises et contacts",
    category: "stats",
    icon: "chart-bar",
    defaultConfig: {
      showCompanies: true,
      showContacts: true,
      showInvitations: true,
      refreshInterval: 300000,
    },
    defaultSize: {
      w: 6,
      h: 2,
      minW: 4,
      minH: 2,
      maxW: 12,
      maxH: 3,
    },
  },
  {
    type: "third_parties_companies_by_type",
    component: ThirdPartiesCompaniesByType,
    name: "Entreprises par Type",
    description: "Répartition des entreprises par type (client, fournisseur, partenaire...)",
    category: "charts",
    icon: "pie-chart",
    defaultConfig: {
      chartType: "pie",
      showLegend: true,
      showValues: true,
    },
    defaultSize: {
      w: 4,
      h: 3,
      minW: 3,
      minH: 2,
      maxW: 6,
      maxH: 4,
    },
  },
  {
    type: "third_parties_companies_by_status",
    component: ThirdPartiesCompaniesByStatus,
    name: "Entreprises par Statut",
    description: "Répartition des entreprises par statut (actif, inactif, prospect...)",
    category: "charts",
    icon: "activity",
    defaultConfig: {
      chartType: "donut",
      showLegend: true,
      showPercentage: true,
    },
    defaultSize: {
      w: 4,
      h: 3,
      minW: 3,
      minH: 2,
      maxW: 6,
      maxH: 4,
    },
  },
  {
    type: "third_parties_recent_companies",
    component: ThirdPartiesRecentCompanies,
    name: "Entreprises Récentes",
    description: "Liste des entreprises ajoutées récemment",
    category: "lists",
    icon: "building",
    defaultConfig: {
      limit: 5,
      showType: true,
      showStatus: true,
      showDate: true,
    },
    defaultSize: {
      w: 4,
      h: 3,
      minW: 3,
      minH: 2,
      maxW: 6,
      maxH: 5,
    },
  },
  {
    type: "third_parties_recent_contacts",
    component: ThirdPartiesRecentContacts,
    name: "Contacts Récents",
    description: "Liste des contacts ajoutés récemment",
    category: "lists",
    icon: "users",
    defaultConfig: {
      limit: 5,
      showCompany: true,
      showRole: true,
      showDate: true,
    },
    defaultSize: {
      w: 4,
      h: 3,
      minW: 3,
      minH: 2,
      maxW: 6,
      maxH: 5,
    },
  },
  {
    type: "third_parties_pending_invitations",
    component: ThirdPartiesPendingInvitations,
    name: "Invitations en Attente",
    description: "Liste des invitations de contacts en attente",
    category: "notifications",
    icon: "mail",
    defaultConfig: {
      limit: 10,
      showExpiryDate: true,
      highlightExpiring: true,
      expiringThresholdDays: 2,
    },
    defaultSize: {
      w: 6,
      h: 3,
      minW: 4,
      minH: 2,
      maxW: 12,
      maxH: 5,
    },
  },
  {
    type: "third_parties_contacts_evolution",
    component: ThirdPartiesContactsEvolution,
    name: "Évolution des Contacts",
    description: "Graphique d'évolution du nombre de contacts dans le temps",
    category: "charts",
    icon: "trending-up",
    defaultConfig: {
      period: "month",
      chartType: "line",
      showDataPoints: true,
      groupBy: "week",
    },
    defaultSize: {
      w: 8,
      h: 3,
      minW: 6,
      minH: 2,
      maxW: 12,
      maxH: 4,
    },
  },
  {
    type: "third_parties_top_companies",
    component: ThirdPartiesTopCompanies,
    name: "Top Entreprises",
    description: "Entreprises avec le plus de contacts",
    category: "analytics",
    icon: "award",
    defaultConfig: {
      limit: 5,
      showContactCount: true,
      showType: true,
      orderBy: "contact_count",
    },
    defaultSize: {
      w: 4,
      h: 3,
      minW: 3,
      minH: 2,
      maxW: 6,
      maxH: 4,
    },
  },
]

export default THIRD_PARTIES_WIDGETS
