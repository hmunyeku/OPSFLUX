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

const API_BASE = "/api/v1/travelwiz"

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("access_token")

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
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

  /**
   * Liste des manifestes de chargement avec pagination et filtres
   */
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
    return fetchAPI<LoadingManifestsPublic>(
      `/manifests${query ? `?${query}` : ""}`
    )
  },

  /**
   * Récupérer un manifeste de chargement par ID
   */
  getLoadingManifest: async (manifestId: string): Promise<LoadingManifestPublic> => {
    return fetchAPI<LoadingManifestPublic>(`/manifests/${manifestId}`)
  },

  /**
   * Créer un nouveau manifeste de chargement
   */
  createLoadingManifest: async (
    data: LoadingManifestCreate
  ): Promise<LoadingManifestPublic> => {
    return fetchAPI<LoadingManifestPublic>("/manifests", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /**
   * Mettre à jour un manifeste de chargement
   */
  updateLoadingManifest: async (
    manifestId: string,
    data: LoadingManifestUpdate
  ): Promise<LoadingManifestPublic> => {
    return fetchAPI<LoadingManifestPublic>(`/manifests/${manifestId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  /**
   * Supprimer un manifeste de chargement (soft delete)
   */
  deleteLoadingManifest: async (manifestId: string): Promise<{ message: string }> => {
    return fetchAPI<{ message: string }>(`/manifests/${manifestId}`, {
      method: "DELETE",
    })
  },

  // ============================================================================
  // BACK CARGO MANIFESTS
  // ============================================================================

  /**
   * Liste des manifestes de retour site avec pagination et filtres
   */
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
    return fetchAPI<BackCargoManifestsPublic>(
      `/back-cargo${query ? `?${query}` : ""}`
    )
  },

  /**
   * Récupérer un manifeste de retour site par ID
   */
  getBackCargoManifest: async (manifestId: string): Promise<BackCargoManifestPublic> => {
    return fetchAPI<BackCargoManifestPublic>(`/back-cargo/${manifestId}`)
  },

  /**
   * Créer un nouveau manifeste de retour site
   */
  createBackCargoManifest: async (
    data: BackCargoManifestCreate
  ): Promise<BackCargoManifestPublic> => {
    return fetchAPI<BackCargoManifestPublic>("/back-cargo", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /**
   * Mettre à jour un manifeste de retour site
   */
  updateBackCargoManifest: async (
    manifestId: string,
    data: BackCargoManifestUpdate
  ): Promise<BackCargoManifestPublic> => {
    return fetchAPI<BackCargoManifestPublic>(`/back-cargo/${manifestId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  /**
   * Supprimer un manifeste de retour site (soft delete)
   */
  deleteBackCargoManifest: async (manifestId: string): Promise<{ message: string }> => {
    return fetchAPI<{ message: string }>(`/back-cargo/${manifestId}`, {
      method: "DELETE",
    })
  },

  // ============================================================================
  // VESSEL ARRIVALS
  // ============================================================================

  /**
   * Liste des arrivées de navires avec pagination et filtres
   */
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
    if (params?.upcoming_days !== undefined)
      queryParams.set("upcoming_days", params.upcoming_days.toString())

    const query = queryParams.toString()
    return fetchAPI<VesselArrivalsPublic>(
      `/vessel-arrivals${query ? `?${query}` : ""}`
    )
  },

  /**
   * Récupérer une arrivée de navire par ID
   */
  getVesselArrival: async (arrivalId: string): Promise<VesselArrivalPublic> => {
    return fetchAPI<VesselArrivalPublic>(`/vessel-arrivals/${arrivalId}`)
  },

  /**
   * Créer un nouvel enregistrement d'arrivée de navire
   */
  createVesselArrival: async (
    data: VesselArrivalCreate
  ): Promise<VesselArrivalPublic> => {
    return fetchAPI<VesselArrivalPublic>("/vessel-arrivals", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /**
   * Mettre à jour une arrivée de navire
   */
  updateVesselArrival: async (
    arrivalId: string,
    data: VesselArrivalUpdate
  ): Promise<VesselArrivalPublic> => {
    return fetchAPI<VesselArrivalPublic>(`/vessel-arrivals/${arrivalId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  /**
   * Supprimer une arrivée de navire (soft delete)
   */
  deleteVesselArrival: async (arrivalId: string): Promise<{ message: string }> => {
    return fetchAPI<{ message: string }>(`/vessel-arrivals/${arrivalId}`, {
      method: "DELETE",
    })
  },

  // ============================================================================
  // UNLOADING DISCREPANCIES
  // ============================================================================

  /**
   * Liste des anomalies de déchargement avec pagination et filtres
   */
  getUnloadingDiscrepancies: async (params?: {
    skip?: number
    limit?: number
    vessel_arrival_id?: string
    resolved?: boolean
  }): Promise<UnloadingDiscrepanciesPublic> => {
    const queryParams = new URLSearchParams()
    if (params?.skip !== undefined) queryParams.set("skip", params.skip.toString())
    if (params?.limit !== undefined) queryParams.set("limit", params.limit.toString())
    if (params?.vessel_arrival_id)
      queryParams.set("vessel_arrival_id", params.vessel_arrival_id)
    if (params?.resolved !== undefined)
      queryParams.set("resolved", params.resolved.toString())

    const query = queryParams.toString()
    return fetchAPI<UnloadingDiscrepanciesPublic>(
      `/discrepancies${query ? `?${query}` : ""}`
    )
  },

  /**
   * Créer une nouvelle anomalie de déchargement
   */
  createUnloadingDiscrepancy: async (
    data: UnloadingDiscrepancyCreate
  ): Promise<UnloadingDiscrepancyPublic> => {
    return fetchAPI<UnloadingDiscrepancyPublic>("/discrepancies", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /**
   * Mettre à jour une anomalie de déchargement (généralement pour la marquer comme résolue)
   */
  updateUnloadingDiscrepancy: async (
    discrepancyId: string,
    data: UnloadingDiscrepancyUpdate
  ): Promise<UnloadingDiscrepancyPublic> => {
    return fetchAPI<UnloadingDiscrepancyPublic>(`/discrepancies/${discrepancyId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  // ============================================================================
  // YARD DISPATCHES
  // ============================================================================

  /**
   * Liste des dispatches Yard avec pagination et filtres
   */
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
    return fetchAPI<YardDispatchesPublic>(
      `/yard-dispatches${query ? `?${query}` : ""}`
    )
  },

  /**
   * Récupérer un dispatch Yard par ID
   */
  getYardDispatch: async (dispatchId: string): Promise<YardDispatchPublic> => {
    return fetchAPI<YardDispatchPublic>(`/yard-dispatches/${dispatchId}`)
  },

  /**
   * Créer un nouvel enregistrement de dispatch Yard
   */
  createYardDispatch: async (
    data: YardDispatchCreate
  ): Promise<YardDispatchPublic> => {
    return fetchAPI<YardDispatchPublic>("/yard-dispatches", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /**
   * Mettre à jour un dispatch Yard
   */
  updateYardDispatch: async (
    dispatchId: string,
    data: YardDispatchUpdate
  ): Promise<YardDispatchPublic> => {
    return fetchAPI<YardDispatchPublic>(`/yard-dispatches/${dispatchId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  // ============================================================================
  // DASHBOARD
  // ============================================================================

  /**
   * Récupérer les données du tableau de bord TravelWiz avec statistiques et éléments récents
   */
  getDashboard: async (): Promise<TravelWizDashboard> => {
    return fetchAPI<TravelWizDashboard>("/dashboard")
  },
}

export default travelwizAPI
