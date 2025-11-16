/**
 * OpsFlux Dashboard System API Client
 * Client pour interagir avec l'API du système de dashboards personnalisables
 */

import {
  DashboardClone,
  DashboardCreate,
  DashboardPublic,
  DashboardsPublic,
  DashboardShareCreate,
  DashboardSharePublic,
  DashboardSharesPublic,
  DashboardShareUpdate,
  DashboardStats,
  DashboardUpdate,
  DashboardViewCreate,
  DashboardWithWidgets,
  MenuParentEnum,
  NavigationStructure,
  WidgetCreate,
  WidgetPublic,
  WidgetsPublic,
  WidgetTemplateCreate,
  WidgetTemplatePublic,
  WidgetTemplatesPublic,
  WidgetTemplateUpdate,
  WidgetUpdate,
} from "@/types/dashboard-system";

// Use full API URL for production (Next.js rewrites don't work in standalone mode)
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.opsflux.io'
const API_BASE = `${API_URL}/api/v1/dashboards-system`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("access_token");

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }));
    throw new Error(error.detail || "API request failed");
  }

  return response.json();
}

// ============================================================================
// DASHBOARD CRUD
// ============================================================================

export const dashboardSystemAPI = {
  // Liste des dashboards avec pagination et filtres
  getDashboards: async (params?: {
    skip?: number;
    limit?: number;
    menu_parent?: MenuParentEnum;
    is_archived?: boolean;
    is_template?: boolean;
  }): Promise<DashboardsPublic> => {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString());
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString());
    if (params?.menu_parent) queryParams.set("menu_parent", params.menu_parent);
    if (params?.is_archived !== undefined) queryParams.set("is_archived", params.is_archived.toString());
    if (params?.is_template !== undefined) queryParams.set("is_template", params.is_template.toString());

    const query = queryParams.toString();
    return fetchAPI<DashboardsPublic>(query ? `/?${query}` : "/");
  },

  // Récupérer un dashboard avec ses widgets
  getDashboard: async (
    dashboardId: string,
    includeWidgets = true
  ): Promise<DashboardWithWidgets> => {
    const params = new URLSearchParams();
    params.set("include_widgets", includeWidgets.toString());
    return fetchAPI<DashboardWithWidgets>(`/${dashboardId}?${params}`);
  },

  // Créer un nouveau dashboard
  createDashboard: async (
    data: DashboardCreate
  ): Promise<DashboardPublic> => {
    return fetchAPI<DashboardPublic>("/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Mettre à jour un dashboard
  updateDashboard: async (
    dashboardId: string,
    data: DashboardUpdate
  ): Promise<DashboardPublic> => {
    return fetchAPI<DashboardPublic>(`/${dashboardId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // Supprimer un dashboard (soft delete)
  deleteDashboard: async (dashboardId: string): Promise<{ ok: boolean }> => {
    return fetchAPI<{ ok: boolean }>(`/${dashboardId}`, {
      method: "DELETE",
    });
  },

  // Cloner un dashboard
  cloneDashboard: async (data: DashboardClone): Promise<DashboardPublic> => {
    return fetchAPI<DashboardPublic>("/clone", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // ============================================================================
  // WIDGETS CRUD
  // ============================================================================

  // Liste des widgets d'un dashboard
  getDashboardWidgets: async (
    dashboardId: string,
    params?: { skip?: number; limit?: number }
  ): Promise<WidgetsPublic> => {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString());
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString());

    const query = queryParams.toString();
    return fetchAPI<WidgetsPublic>(
      `/${dashboardId}/widgets${query ? `?${query}` : ""}`
    );
  },

  // Ajouter un widget à un dashboard
  addWidget: async (
    dashboardId: string,
    data: Omit<WidgetCreate, "dashboard_id">
  ): Promise<WidgetPublic> => {
    return fetchAPI<WidgetPublic>(`/${dashboardId}/widgets`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Mettre à jour un widget
  updateWidget: async (
    dashboardId: string,
    widgetId: string,
    data: WidgetUpdate
  ): Promise<WidgetPublic> => {
    return fetchAPI<WidgetPublic>(`/${dashboardId}/widgets/${widgetId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // Supprimer un widget d'un dashboard
  deleteWidget: async (
    dashboardId: string,
    widgetId: string
  ): Promise<{ ok: boolean }> => {
    return fetchAPI<{ ok: boolean }>(`/${dashboardId}/widgets/${widgetId}`, {
      method: "DELETE",
    });
  },

  // ============================================================================
  // WIDGET TEMPLATES
  // ============================================================================

  // Liste des templates de widgets
  getWidgetTemplates: async (params?: {
    skip?: number;
    limit?: number;
    category?: string;
  }): Promise<WidgetTemplatesPublic> => {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString());
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString());
    if (params?.category) queryParams.set("category", params.category);

    const query = queryParams.toString();
    return fetchAPI<WidgetTemplatesPublic>(
      `/widget-templates${query ? `?${query}` : ""}`
    );
  },

  // Créer un template de widget
  createWidgetTemplate: async (
    data: WidgetTemplateCreate
  ): Promise<WidgetTemplatePublic> => {
    return fetchAPI<WidgetTemplatePublic>("/widget-templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Mettre à jour un template
  updateWidgetTemplate: async (
    templateId: string,
    data: WidgetTemplateUpdate
  ): Promise<WidgetTemplatePublic> => {
    return fetchAPI<WidgetTemplatePublic>(`/widget-templates/${templateId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // Supprimer un template
  deleteWidgetTemplate: async (
    templateId: string
  ): Promise<{ ok: boolean }> => {
    return fetchAPI<{ ok: boolean }>(`/widget-templates/${templateId}`, {
      method: "DELETE",
    });
  },

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  // Structure de navigation complète
  getNavigationStructure: async (): Promise<NavigationStructure> => {
    return fetchAPI<NavigationStructure>("/navigation/structure");
  },

  // Dashboards par menu
  getDashboardsByMenu: async (
    menuParent: MenuParentEnum
  ): Promise<DashboardsPublic> => {
    return fetchAPI<DashboardsPublic>(`/navigation/menu/${menuParent}/dashboards`);
  },

  // ============================================================================
  // SHARING
  // ============================================================================

  // Partager un dashboard
  shareDashboard: async (
    dashboardId: string,
    data: Omit<DashboardShareCreate, "dashboard_id">
  ): Promise<DashboardSharePublic> => {
    return fetchAPI<DashboardSharePublic>(`/${dashboardId}/share`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Liste des partages d'un dashboard
  getDashboardShares: async (
    dashboardId: string
  ): Promise<DashboardSharesPublic> => {
    return fetchAPI<DashboardSharesPublic>(`/${dashboardId}/shares`);
  },

  // Mettre à jour un partage
  updateDashboardShare: async (
    dashboardId: string,
    shareId: string,
    data: DashboardShareUpdate
  ): Promise<DashboardSharePublic> => {
    return fetchAPI<DashboardSharePublic>(`/${dashboardId}/shares/${shareId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // Supprimer un partage
  deleteDashboardShare: async (
    dashboardId: string,
    shareId: string
  ): Promise<{ ok: boolean }> => {
    return fetchAPI<{ ok: boolean }>(`/${dashboardId}/shares/${shareId}`, {
      method: "DELETE",
    });
  },

  // ============================================================================
  // FAVORITES
  // ============================================================================

  // Ajouter aux favoris
  addToFavorites: async (dashboardId: string): Promise<{ ok: boolean }> => {
    return fetchAPI<{ ok: boolean }>(`/${dashboardId}/favorite`, {
      method: "POST",
    });
  },

  // Retirer des favoris
  removeFromFavorites: async (dashboardId: string): Promise<{ ok: boolean }> => {
    return fetchAPI<{ ok: boolean }>(`/${dashboardId}/favorite`, {
      method: "DELETE",
    });
  },

  // Liste des favoris de l'utilisateur
  getFavorites: async (): Promise<DashboardsPublic> => {
    return fetchAPI<DashboardsPublic>("/favorites");
  },

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  // Enregistrer une vue de dashboard
  trackDashboardView: async (
    data: DashboardViewCreate
  ): Promise<{ ok: boolean }> => {
    return fetchAPI<{ ok: boolean }>("/views", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Statistiques d'un dashboard
  getDashboardStats: async (dashboardId: string): Promise<DashboardStats> => {
    return fetchAPI<DashboardStats>(`/${dashboardId}/stats`);
  },
};

export default dashboardSystemAPI;
