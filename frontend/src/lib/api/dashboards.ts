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
