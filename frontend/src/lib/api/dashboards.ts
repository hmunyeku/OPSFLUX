/**
 * API functions for dashboards and widgets
 */

import type {
  Dashboard,
  DashboardCreate,
  DashboardUpdate,
  DashboardLayoutUpdate,
  UserDashboardsResponse,
  Widget,
  WidgetsResponse,
  DashboardWidgetCreate,
} from "@/types/dashboard"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "http://localhost:8000/api/v1"

// ==================== DASHBOARDS ====================

export async function getDashboards(token: string): Promise<UserDashboardsResponse> {
  const response = await fetch(`${API_BASE_URL}/dashboards/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch dashboards")
  }

  return response.json()
}

export async function getDashboardsByMenu(
  token: string,
  menuKey: string
): Promise<Dashboard[]> {
  const response = await fetch(`${API_BASE_URL}/dashboards/menu/${encodeURIComponent(menuKey)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch dashboards for menu")
  }

  const result = await response.json()
  return result.data || []
}

export async function getHomeDashboards(token: string): Promise<Dashboard[]> {
  const response = await fetch(`${API_BASE_URL}/dashboards/home`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch home dashboards")
  }

  const result = await response.json()
  return result.data || []
}

export async function getDashboard(
  token: string,
  dashboardId: string
): Promise<Dashboard> {
  const response = await fetch(`${API_BASE_URL}/dashboards/${dashboardId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch dashboard")
  }

  return response.json()
}

export async function createDashboard(
  token: string,
  dashboard: DashboardCreate
): Promise<Dashboard> {
  const response = await fetch(`${API_BASE_URL}/dashboards/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dashboard),
  })

  if (!response.ok) {
    throw new Error("Failed to create dashboard")
  }

  return response.json()
}

export async function updateDashboard(
  token: string,
  dashboardId: string,
  updates: DashboardUpdate
): Promise<Dashboard> {
  const response = await fetch(`${API_BASE_URL}/dashboards/${dashboardId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    throw new Error("Failed to update dashboard")
  }

  return response.json()
}

export async function updateDashboardLayout(
  token: string,
  dashboardId: string,
  layout: DashboardLayoutUpdate
): Promise<Dashboard> {
  const response = await fetch(`${API_BASE_URL}/dashboards/${dashboardId}/layout`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(layout),
  })

  if (!response.ok) {
    throw new Error("Failed to update dashboard layout")
  }

  return response.json()
}

export async function deleteDashboard(
  token: string,
  dashboardId: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/dashboards/${dashboardId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to delete dashboard")
  }
}

export async function cloneDashboard(
  token: string,
  dashboardId: string,
  name: string
): Promise<Dashboard> {
  const response = await fetch(
    `${API_BASE_URL}/dashboards/${dashboardId}/clone?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to clone dashboard")
  }

  return response.json()
}

export async function addWidgetToDashboard(
  token: string,
  dashboardId: string,
  widget: DashboardWidgetCreate
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/dashboards/${dashboardId}/widgets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(widget),
  })

  if (!response.ok) {
    throw new Error("Failed to add widget to dashboard")
  }
}

export async function removeWidgetFromDashboard(
  token: string,
  dashboardId: string,
  widgetId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/dashboards/${dashboardId}/widgets/${widgetId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to remove widget from dashboard")
  }
}

export async function updateWidgetConfig(
  token: string,
  dashboardId: string,
  widgetId: number,
  config: Record<string, any>
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/dashboards/${dashboardId}/widgets/${widgetId}/config`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ config }),
    }
  )

  if (!response.ok) {
    throw new Error("Failed to update widget configuration")
  }
}

// ==================== WIDGETS ====================

export async function getWidgets(
  token: string,
  params?: {
    category?: string
    module_name?: string
    is_active?: boolean
  }
): Promise<WidgetsResponse> {
  const queryParams = new URLSearchParams()
  if (params?.category) queryParams.append("category", params.category)
  if (params?.module_name) queryParams.append("module_name", params.module_name)
  if (params?.is_active !== undefined)
    queryParams.append("is_active", String(params.is_active))

  const url = `${API_BASE_URL}/widgets/?${queryParams.toString()}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch widgets")
  }

  return response.json()
}

export async function getWidget(token: string, widgetId: string): Promise<Widget> {
  const response = await fetch(`${API_BASE_URL}/widgets/${widgetId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch widget")
  }

  return response.json()
}

export async function getWidgetCategories(token: string): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/widgets/categories/list`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch widget categories")
  }

  return response.json()
}

export async function getWidgetModules(token: string): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/widgets/modules/list`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch widget modules")
  }

  return response.json()
}

// ==================== DASHBOARD IMPORT/EXPORT ====================

export interface DashboardExportData {
  name: string
  description?: string
  is_public: boolean
  is_home: boolean
  layout_config?: Record<string, any>
  widgets: Array<{
    widget_id: string
    x: number
    y: number
    w: number
    h: number
    config: Record<string, any>
  }>
  metadata: {
    exported_at: string
    version: string
  }
}

/**
 * Export a dashboard to JSON format
 */
export function exportDashboardToJSON(dashboard: Dashboard): DashboardExportData {
  return {
    name: dashboard.name,
    description: dashboard.description,
    is_public: dashboard.is_public || false,
    is_home: dashboard.is_home || false,
    layout_config: dashboard.layout_config,
    widgets: (dashboard.widgets || []).map((w) => ({
      widget_id: w.widget_id,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      config: w.config || {},
    })),
    metadata: {
      exported_at: new Date().toISOString(),
      version: "1.0",
    },
  }
}

/**
 * Download dashboard as JSON file
 */
export function downloadDashboardJSON(dashboard: Dashboard): void {
  const data = exportDashboardToJSON(dashboard)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `dashboard-${dashboard.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Import dashboard from JSON file
 */
export async function importDashboardFromJSON(
  token: string,
  jsonData: DashboardExportData
): Promise<Dashboard> {
  const dashboardData: DashboardCreate = {
    name: `${jsonData.name} (Importé)`,
    description: jsonData.description,
    is_public: jsonData.is_public,
    is_home: jsonData.is_home,
    layout_config: jsonData.layout_config,
    widgets: jsonData.widgets,
  }

  return createDashboard(token, dashboardData)
}

/**
 * Validate dashboard JSON structure
 */
export function validateDashboardJSON(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Le fichier JSON est invalide" }
  }

  if (!data.name || typeof data.name !== "string") {
    return { valid: false, error: "Le nom du dashboard est requis" }
  }

  if (!Array.isArray(data.widgets)) {
    return { valid: false, error: "La structure des widgets est invalide" }
  }

  for (const widget of data.widgets) {
    if (!widget.widget_id || typeof widget.widget_id !== "string") {
      return { valid: false, error: "Un widget a un ID invalide" }
    }
    if (typeof widget.x !== "number" || typeof widget.y !== "number") {
      return { valid: false, error: "Les positions des widgets sont invalides" }
    }
    if (typeof widget.w !== "number" || typeof widget.h !== "number") {
      return { valid: false, error: "Les dimensions des widgets sont invalides" }
    }
  }

  return { valid: true }
}
