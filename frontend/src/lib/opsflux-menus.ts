/**
 * OpsFlux Menus Configuration
 * Configuration des menus parents disponibles dans OpsFlux
 */

import { MenuParentEnum } from "@/types/dashboard-system";

export interface OpsFluxMenuConfig {
  id: MenuParentEnum;
  label: string;
  icon: string;
  description: string;
}

export const OPSFLUX_MENUS: OpsFluxMenuConfig[] = [
  {
    id: MenuParentEnum.PILOTAGE,
    label: "Pilotage",
    icon: "Target",
    description: "Tableaux de bord et indicateurs de pilotage",
  },
  {
    id: MenuParentEnum.TIERS,
    label: "Tiers",
    icon: "Building2",
    description: "Gestion des clients, fournisseurs et partenaires",
  },
  {
    id: MenuParentEnum.PROJECTS,
    label: "Projects",
    icon: "FolderKanban",
    description: "Gestion de projets et suivi",
  },
  {
    id: MenuParentEnum.ORGANIZER,
    label: "Organizer",
    icon: "CalendarDays",
    description: "Planification et organisation",
  },
  {
    id: MenuParentEnum.REDACTEUR,
    label: "Rédacteur",
    icon: "FilePen",
    description: "Rédaction et gestion documentaire",
  },
  {
    id: MenuParentEnum.POBVUE,
    label: "POBVue",
    icon: "UserCheck",
    description: "Point Of Business - Gestion opérationnelle",
  },
  {
    id: MenuParentEnum.TRAVELWIZ,
    label: "TravelWiz",
    icon: "Plane",
    description: "Gestion des déplacements et missions",
  },
  {
    id: MenuParentEnum.MOCVUE,
    label: "MOCVue",
    icon: "FileCheck",
    description: "Management Of Change",
  },
  {
    id: MenuParentEnum.CLEANVUE,
    label: "CleanVue",
    icon: "Sparkles",
    description: "Nettoyage et maintenance",
  },
  {
    id: MenuParentEnum.POWERTRACE,
    label: "PowerTrace",
    icon: "Zap",
    description: "Traçabilité énergétique et consommation",
  },
];

/**
 * Récupérer la configuration d'un menu par son ID
 */
export function getMenuConfig(menuId: MenuParentEnum): OpsFluxMenuConfig | undefined {
  return OPSFLUX_MENUS.find((menu) => menu.id === menuId);
}

/**
 * Récupérer le label d'un menu par son ID
 */
export function getMenuLabel(menuId: MenuParentEnum): string {
  return getMenuConfig(menuId)?.label || menuId;
}
