/**
 * TravelWiz API Client
 * Client pour interagir avec l'API du système de gestion de chargement bateau et retours site
 */

import type {
  BackCargoManifestCreate,
  BackCargoManifestPublic,
  BackCargoManifestsPublic,
  BackCargoManifestUpdate,
  BackCargoTypeEnum,
  LoadingManifestCreate,
  LoadingManifestPublic,
  LoadingManifestsPublic,
  LoadingManifestUpdate,
  ManifestStatusEnum,
  TravelWizDashboard,
  UnloadingDiscrepanciesPublic,
  UnloadingDiscrepancyCreate,
  UnloadingDiscrepancyPublic,
  UnloadingDiscrepancyUpdate,
  VesselArrivalCreate,
  VesselArrivalPublic,
  VesselArrivalsPublic,
  VesselArrivalStatusEnum,
  VesselArrivalUpdate,
  YardDispatchCreate,
  YardDispatchPublic,
  YardDispatchesPublic,
  YardDispatchStatusEnum,
  YardDispatchUpdate,
} from "@/types/travelwiz"

// Get API URL - use proxy on localhost to avoid CORS
const getApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      return ''; // Use Next.js proxy
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || '';
};

const API_BASE = '/api/v1/travelwiz'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("auth_token")
  const apiUrl = getApiUrl()

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  const response = await fetch(`${apiUrl}${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: `HTTP error! status: ${response.status}`,
    }))
    throw new Error(error.detail || "API request failed")
  }

  return response.json()
}

// ============================================================================
// TRAVELWIZ API CLIENT
// ============================================================================

export const travelwizAPI = {
  // ============================================================================
  // LOADING MANIFESTS
  // ============================================================================

  getLoadingManifests: async (params?: {
    skip?: number
    limit?: number
    status?: ManifestStatusEnum
  }): Promise<LoadingManifestsPublic> => {
    const queryParams = new URLSearchParams()
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString())
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString())
    if (params?.status) queryParams.set("status", params.status)

    const query = queryParams.toString()
    return fetchAPI<LoadingManifestsPublic>(`/manifests${query ? `?${query}` : ""}`)
  },

  getLoadingManifest: async (manifestId: string): Promise<LoadingManifestPublic> => {
    return fetchAPI<LoadingManifestPublic>(`/manifests/${manifestId}`)
  },

  createLoadingManifest: async (data: LoadingManifestCreate): Promise<LoadingManifestPublic> => {
    return fetchAPI<LoadingManifestPublic>("/manifests", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateLoadingManifest: async (manifestId: string, data: LoadingManifestUpdate): Promise<LoadingManifestPublic> => {
    return fetchAPI<LoadingManifestPublic>(`/manifests/${manifestId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  deleteLoadingManifest: async (manifestId: string): Promise<{ message: string }> => {
    return fetchAPI<{ message: string }>(`/manifests/${manifestId}`, {
      method: "DELETE",
    })
  },

  // ============================================================================
  // BACK CARGO MANIFESTS
  // ============================================================================

  getBackCargoManifests: async (params?: {
    skip?: number
    limit?: number
    type?: BackCargoTypeEnum
    status?: ManifestStatusEnum
  }): Promise<BackCargoManifestsPublic> => {
    const queryParams = new URLSearchParams()
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString())
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString())
    if (params?.type) queryParams.set("type", params.type)
    if (params?.status) queryParams.set("status", params.status)

    const query = queryParams.toString()
    return fetchAPI<BackCargoManifestsPublic>(`/back-cargo${query ? `?${query}` : ""}`)
  },

  getBackCargoManifest: async (manifestId: string): Promise<BackCargoManifestPublic> => {
    return fetchAPI<BackCargoManifestPublic>(`/back-cargo/${manifestId}`)
  },

  createBackCargoManifest: async (data: BackCargoManifestCreate): Promise<BackCargoManifestPublic> => {
    return fetchAPI<BackCargoManifestPublic>("/back-cargo", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateBackCargoManifest: async (manifestId: string, data: BackCargoManifestUpdate): Promise<BackCargoManifestPublic> => {
    return fetchAPI<BackCargoManifestPublic>(`/back-cargo/${manifestId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  deleteBackCargoManifest: async (manifestId: string): Promise<{ message: string }> => {
    return fetchAPI<{ message: string }>(`/back-cargo/${manifestId}`, {
      method: "DELETE",
    })
  },

  // ============================================================================
  // VESSEL ARRIVALS
  // ============================================================================

  getVesselArrivals: async (params?: {
    skip?: number
    limit?: number
    status?: VesselArrivalStatusEnum
    upcoming_days?: number
  }): Promise<VesselArrivalsPublic> => {
    const queryParams = new URLSearchParams()
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString())
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString())
    if (params?.status) queryParams.set("status", params.status)
    if (params?.upcoming_days !== undefined) queryParams.set("upcoming_days", params.upcoming_days.toString())

    const query = queryParams.toString()
    return fetchAPI<VesselArrivalsPublic>(`/vessel-arrivals${query ? `?${query}` : ""}`)
  },

  getVesselArrival: async (arrivalId: string): Promise<VesselArrivalPublic> => {
    return fetchAPI<VesselArrivalPublic>(`/vessel-arrivals/${arrivalId}`)
  },

  createVesselArrival: async (data: VesselArrivalCreate): Promise<VesselArrivalPublic> => {
    return fetchAPI<VesselArrivalPublic>("/vessel-arrivals", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateVesselArrival: async (arrivalId: string, data: VesselArrivalUpdate): Promise<VesselArrivalPublic> => {
    return fetchAPI<VesselArrivalPublic>(`/vessel-arrivals/${arrivalId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  deleteVesselArrival: async (arrivalId: string): Promise<{ message: string }> => {
    return fetchAPI<{ message: string }>(`/vessel-arrivals/${arrivalId}`, {
      method: "DELETE",
    })
  },

  // ============================================================================
  // UNLOADING DISCREPANCIES
  // ============================================================================

  getUnloadingDiscrepancies: async (params?: {
    skip?: number
    limit?: number
    vessel_arrival_id?: string
    resolved?: boolean
  }): Promise<UnloadingDiscrepanciesPublic> => {
    const queryParams = new URLSearchParams()
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString())
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString())
    if (params?.vessel_arrival_id) queryParams.set("vessel_arrival_id", params.vessel_arrival_id)
    if (params?.resolved !== undefined) queryParams.set("resolved", params.resolved.toString())

    const query = queryParams.toString()
    return fetchAPI<UnloadingDiscrepanciesPublic>(`/discrepancies${query ? `?${query}` : ""}`)
  },

  createUnloadingDiscrepancy: async (data: UnloadingDiscrepancyCreate): Promise<UnloadingDiscrepancyPublic> => {
    return fetchAPI<UnloadingDiscrepancyPublic>("/discrepancies", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateUnloadingDiscrepancy: async (discrepancyId: string, data: UnloadingDiscrepancyUpdate): Promise<UnloadingDiscrepancyPublic> => {
    return fetchAPI<UnloadingDiscrepancyPublic>(`/discrepancies/${discrepancyId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  // ============================================================================
  // YARD DISPATCHES
  // ============================================================================

  getYardDispatches: async (params?: {
    skip?: number
    limit?: number
    status?: YardDispatchStatusEnum
  }): Promise<YardDispatchesPublic> => {
    const queryParams = new URLSearchParams()
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString())
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString())
    if (params?.status) queryParams.set("status", params.status)

    const query = queryParams.toString()
    return fetchAPI<YardDispatchesPublic>(`/yard-dispatches${query ? `?${query}` : ""}`)
  },

  getYardDispatch: async (dispatchId: string): Promise<YardDispatchPublic> => {
    return fetchAPI<YardDispatchPublic>(`/yard-dispatches/${dispatchId}`)
  },

  createYardDispatch: async (data: YardDispatchCreate): Promise<YardDispatchPublic> => {
    return fetchAPI<YardDispatchPublic>("/yard-dispatches", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateYardDispatch: async (dispatchId: string, data: YardDispatchUpdate): Promise<YardDispatchPublic> => {
    return fetchAPI<YardDispatchPublic>(`/yard-dispatches/${dispatchId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  getDashboard: async (): Promise<TravelWizDashboard> => {
    return fetchAPI<TravelWizDashboard>("/dashboard")
  },
}

export default travelwizAPI
