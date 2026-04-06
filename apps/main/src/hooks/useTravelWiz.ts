/**
 * React Query hooks for TravelWiz (transport & logistics) module.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { travelwizService } from '@/services/travelwizService'
import type {
  TravelVectorCreate, TravelVectorUpdate,
  VectorZoneCreate, VectorZoneUpdate,
  RotationCreate, RotationUpdate,
  VoyageCreate, VoyageUpdate,
  VoyageStopCreate, VoyageStopUpdate,
  ManifestCreate,
  ManifestPassengerCreate, ManifestPassengerUpdate,
  CargoItem, CargoItemCreate, CargoItemUpdate, CargoReceive, CargoReturnCreate,
  CaptainLogCreate,
  VoyageEventCreate,
  PackageElementCreate,
  TravelArticleCreate,
  WeatherReport, CaptainWeatherReport,
  PaginationParams,
} from '@/types/api'

// ── Vectors ──

export function useVectors(params: PaginationParams & {
  type?: string; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['travelwiz', 'vectors', params],
    queryFn: () => travelwizService.listVectors(params),
    placeholderData: keepPreviousData,
  })
}

export function useVector(id: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'vectors', id],
    queryFn: () => travelwizService.getVector(id!),
    enabled: !!id,
  })
}

export function useCreateVector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TravelVectorCreate) => travelwizService.createVector(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'vectors'] }) },
  })
}

export function useUpdateVector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TravelVectorUpdate }) =>
      travelwizService.updateVector(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'vectors'] }) },
  })
}

export function useDeleteVector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => travelwizService.deleteVector(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'vectors'] }) },
  })
}

// ── Vector Zones ──

export function useVectorZones(vectorId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'vectors', vectorId, 'zones'],
    queryFn: () => travelwizService.listVectorZones(vectorId!),
    enabled: !!vectorId,
  })
}

export function useCreateVectorZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vectorId, payload }: { vectorId: string; payload: VectorZoneCreate }) =>
      travelwizService.createVectorZone(vectorId, payload),
    onSuccess: (_, { vectorId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'vectors', vectorId, 'zones'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'vectors'] })
    },
  })
}

export function useUpdateVectorZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vectorId, zoneId, payload }: { vectorId: string; zoneId: string; payload: VectorZoneUpdate }) =>
      travelwizService.updateVectorZone(vectorId, zoneId, payload),
    onSuccess: (_, { vectorId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'vectors', vectorId, 'zones'] })
    },
  })
}

export function useDeleteVectorZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vectorId, zoneId }: { vectorId: string; zoneId: string }) =>
      travelwizService.deleteVectorZone(vectorId, zoneId),
    onSuccess: (_, { vectorId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'vectors', vectorId, 'zones'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'vectors'] })
    },
  })
}

// ── Rotations ──

export function useRotations(params: PaginationParams & {
  vector_id?: string; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['travelwiz', 'rotations', params],
    queryFn: () => travelwizService.listRotations(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateRotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RotationCreate) => travelwizService.createRotation(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'rotations'] }) },
  })
}

export function useUpdateRotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RotationUpdate }) =>
      travelwizService.updateRotation(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'rotations'] }) },
  })
}

// ── Voyages ──

export function useVoyages(params: PaginationParams & {
  status?: string; date_from?: string; date_to?: string;
  vector_id?: string; rotation_id?: string; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', params],
    queryFn: () => travelwizService.listVoyages(params),
    placeholderData: keepPreviousData,
  })
}

export function useVoyage(id: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', id],
    queryFn: () => travelwizService.getVoyage(id!),
    enabled: !!id,
  })
}

export function useCreateVoyage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: VoyageCreate) => travelwizService.createVoyage(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages'] }) },
  })
}

export function useUpdateVoyage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VoyageUpdate }) =>
      travelwizService.updateVoyage(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages'] }) },
  })
}

export function useUpdateVoyageStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string | null }) =>
      travelwizService.updateVoyageStatus(id, { status, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages'] }) },
  })
}

export function useDeleteVoyage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => travelwizService.deleteVoyage(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages'] }) },
  })
}

export function useCloseTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => travelwizService.closeTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'dashboard'] })
    },
  })
}

// ── Voyage Stops ──

export function useVoyageStops(voyageId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', voyageId, 'stops'],
    queryFn: () => travelwizService.listVoyageStops(voyageId!),
    enabled: !!voyageId,
  })
}

export function useCreateVoyageStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, payload }: { voyageId: string; payload: VoyageStopCreate }) =>
      travelwizService.createVoyageStop(voyageId, payload),
    onSuccess: (_, { voyageId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'stops'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId] })
    },
  })
}

export function useUpdateVoyageStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, stopId, payload }: { voyageId: string; stopId: string; payload: VoyageStopUpdate }) =>
      travelwizService.updateVoyageStop(voyageId, stopId, payload),
    onSuccess: (_, { voyageId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'stops'] })
    },
  })
}

export function useDeleteVoyageStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, stopId }: { voyageId: string; stopId: string }) =>
      travelwizService.deleteVoyageStop(voyageId, stopId),
    onSuccess: (_, { voyageId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'stops'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId] })
    },
  })
}

// ── Voyage Events (journal de bord) ──

export function useVoyageEvents(tripId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', tripId, 'events'],
    queryFn: () => travelwizService.getVoyageEvents(tripId!),
    enabled: !!tripId,
  })
}

export function useRecordVoyageEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tripId, payload }: { tripId: string; payload: VoyageEventCreate }) =>
      travelwizService.recordVoyageEvent(tripId, payload),
    onSuccess: (_, { tripId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', tripId, 'events'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', tripId] })
    },
  })
}

// ── Trip KPIs ──

export function useTripKpis(tripId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', tripId, 'kpis'],
    queryFn: () => travelwizService.getTripKpis(tripId!),
    enabled: !!tripId,
  })
}

// ── Deck Layouts ──

export function useDeckLayouts(tripId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', tripId, 'deck-layouts'],
    queryFn: () => travelwizService.getDeckLayouts(tripId!),
    enabled: !!tripId,
  })
}

export function useSuggestDeckLayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tripId, deckSurfaceId }: { tripId: string; deckSurfaceId: string }) =>
      travelwizService.suggestDeckLayout(tripId, deckSurfaceId),
    onSuccess: (_, { tripId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', tripId, 'deck-layouts'] })
    },
  })
}

export function useValidateDeckLayout() {
  return useMutation({
    mutationFn: ({ tripId, deckSurfaceId }: { tripId: string; deckSurfaceId: string }) =>
      travelwizService.validateDeckLayout(tripId, deckSurfaceId),
  })
}

// ── Manifests ──

export function useVoyageManifests(voyageId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', voyageId, 'manifests'],
    queryFn: () => travelwizService.listManifests(voyageId!),
    enabled: !!voyageId,
  })
}

export function useAllManifests(params: PaginationParams & {
  status?: string; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['travelwiz', 'manifests', params],
    queryFn: () => travelwizService.listAllManifests(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateManifest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, payload }: { voyageId: string; payload: ManifestCreate }) =>
      travelwizService.createManifest(voyageId, payload),
    onSuccess: (_, { voyageId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'manifests'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'manifests'] })
    },
  })
}

export function useValidateManifest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, manifestId }: { voyageId: string; manifestId: string }) =>
      travelwizService.validateManifest(voyageId, manifestId),
    onSuccess: (_, { voyageId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'manifests'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'manifests'] })
    },
  })
}

// ── Manifest Passengers ──

export function useManifestPassengers(voyageId: string | undefined, manifestId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', voyageId, 'manifests', manifestId, 'passengers'],
    queryFn: () => travelwizService.listPassengers(voyageId!, manifestId!),
    enabled: !!voyageId && !!manifestId,
  })
}

export function useAddPassenger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, manifestId, payload }: { voyageId: string; manifestId: string; payload: ManifestPassengerCreate }) =>
      travelwizService.addPassenger(voyageId, manifestId, payload),
    onSuccess: (_, { voyageId, manifestId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'manifests', manifestId, 'passengers'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'manifests'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'capacity'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'manifests'] })
    },
  })
}

export function useUpdatePassenger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, manifestId, passengerId, payload }: { voyageId: string; manifestId: string; passengerId: string; payload: ManifestPassengerUpdate }) =>
      travelwizService.updatePassenger(voyageId, manifestId, passengerId, payload),
    onSuccess: (_, { voyageId, manifestId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'manifests', manifestId, 'passengers'] })
    },
  })
}

export function useRemovePassenger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, manifestId, passengerId }: { voyageId: string; manifestId: string; passengerId: string }) =>
      travelwizService.removePassenger(voyageId, manifestId, passengerId),
    onSuccess: (_, { voyageId, manifestId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'manifests', manifestId, 'passengers'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'manifests'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'capacity'] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'manifests'] })
    },
  })
}

// ── Cargo ──

export function useCargo(params: PaginationParams & {
  status?: string; voyage_id?: string; cargo_type?: string; is_hazmat?: boolean; search?: string;
} = {}) {
  return useQuery({
    queryKey: ['travelwiz', 'cargo', params],
    queryFn: () => travelwizService.listCargo(params),
    placeholderData: keepPreviousData,
  })
}

export function useCargoItem(id: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'cargo', id],
    queryFn: () => travelwizService.getCargo(id!),
    enabled: !!id,
  })
}

export function useCreateCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CargoItemCreate) => travelwizService.createCargo(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'cargo'] }) },
  })
}

export function useUpdateCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CargoItemUpdate }) =>
      travelwizService.updateCargo(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'cargo'] }) },
  })
}

export function useUpdateCargoStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string | null }) =>
      travelwizService.updateCargoStatus(id, { status, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'cargo'] }) },
  })
}

export function useUpdateCargoWorkflowStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, workflow_status }: { id: string; workflow_status: CargoItem['workflow_status'] }) =>
      travelwizService.updateCargoWorkflowStatus(id, { workflow_status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'cargo'] }) },
  })
}

export function useReceiveCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: CargoReceive }) =>
      travelwizService.receiveCargo(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'cargo'] }) },
  })
}

export function useInitiateCargoReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cargoItemId, payload }: { cargoItemId: string; payload: CargoReturnCreate }) =>
      travelwizService.initiateCargoReturn(cargoItemId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'cargo'] })
    },
  })
}

// ── Package Elements ──

export function usePackageElements(cargoItemId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'cargo', cargoItemId, 'elements'],
    queryFn: () => travelwizService.getPackageElements(cargoItemId!),
    enabled: !!cargoItemId,
  })
}

export function useCargoHistory(cargoItemId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'cargo', cargoItemId, 'history'],
    queryFn: () => travelwizService.getCargoHistory(cargoItemId!),
    enabled: !!cargoItemId,
  })
}

export function useAddPackageElement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cargoItemId, payload }: { cargoItemId: string; payload: PackageElementCreate }) =>
      travelwizService.addPackageElement(cargoItemId, payload),
    onSuccess: (_, { cargoItemId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'cargo', cargoItemId, 'elements'] })
    },
  })
}

// ── SAP Matching ──

export function useSapMatch() {
  return useMutation({
    mutationFn: (description: string) => travelwizService.sapMatch(description),
  })
}

// ── Captain Portal ──

export function useAuthenticateCaptain() {
  return useMutation({
    mutationFn: (accessCode: string) => travelwizService.authenticateCaptain(accessCode),
  })
}

export function useCaptainManifest(tripId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'captain', tripId, 'manifest'],
    queryFn: () => travelwizService.getCaptainManifest(tripId!),
    enabled: !!tripId,
  })
}

export function useCaptainRecordEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tripId, payload }: { tripId: string; payload: VoyageEventCreate }) =>
      travelwizService.captainRecordEvent(tripId, payload),
    onSuccess: (_, { tripId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'captain', tripId] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', tripId, 'events'] })
    },
  })
}

// ── Captain Logs ──

export function useCaptainLogs(voyageId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', voyageId, 'logs'],
    queryFn: () => travelwizService.listCaptainLogs(voyageId!),
    enabled: !!voyageId,
  })
}

export function useCreateCaptainLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ voyageId, payload }: { voyageId: string; payload: CaptainLogCreate }) =>
      travelwizService.createCaptainLog(voyageId, payload),
    onSuccess: (_, { voyageId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages', voyageId, 'logs'] })
    },
  })
}

// ── Articles ──

export function useArticles(params: PaginationParams & {
  search?: string; sap_code?: string; management_type?: string; is_hazmat?: boolean;
} = {}) {
  return useQuery({
    queryKey: ['travelwiz', 'articles', params],
    queryFn: () => travelwizService.listArticles(params),
    placeholderData: keepPreviousData,
  })
}

export function useCreateArticle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TravelArticleCreate) => travelwizService.createArticle(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travelwiz', 'articles'] }) },
  })
}

export function useImportArticlesCsv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => travelwizService.importArticlesCsv(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'articles'] })
    },
  })
}

// ── Capacity ──

export function useVoyageCapacity(voyageId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', voyageId, 'capacity'],
    queryFn: () => travelwizService.checkCapacity(voyageId!),
    enabled: !!voyageId,
  })
}

// ── Dashboard ──

export function useTripsToday() {
  return useQuery({
    queryKey: ['travelwiz', 'dashboard', 'trips-today'],
    queryFn: () => travelwizService.getTripsToday(),
    refetchInterval: 60_000,
  })
}

export function useCargoPending() {
  return useQuery({
    queryKey: ['travelwiz', 'dashboard', 'cargo-pending'],
    queryFn: () => travelwizService.getCargoPending(),
    refetchInterval: 60_000,
  })
}

export function useFleetKpis() {
  return useQuery({
    queryKey: ['travelwiz', 'dashboard', 'fleet-kpis'],
    queryFn: () => travelwizService.getFleetKpis(),
    refetchInterval: 60_000,
  })
}

// ── Fleet Tracking ──

export function useFleetPositions(refetchInterval = 30_000) {
  return useQuery({
    queryKey: ['travelwiz', 'fleet', 'positions'],
    queryFn: () => travelwizService.getFleetPositions(),
    refetchInterval,
  })
}

export function useVehicleTrack(vectorId: string | undefined, params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['travelwiz', 'fleet', vectorId, 'track', params],
    queryFn: () => travelwizService.getVehicleTrack(vectorId!, params),
    enabled: !!vectorId,
  })
}

export function useRecordPosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vectorId, payload }: { vectorId: string; payload: { latitude: number; longitude: number; speed_knots?: number; heading?: number } }) =>
      travelwizService.recordPosition(vectorId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'fleet', 'positions'] })
    },
  })
}

// ── Weather ──

export function useLatestWeather(siteId?: string) {
  return useQuery({
    queryKey: ['travelwiz', 'weather', 'latest', siteId],
    queryFn: () => travelwizService.getLatestWeather(siteId),
    refetchInterval: 5 * 60_000,
  })
}

export function useWeatherHistory(siteId: string | undefined, params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['travelwiz', 'weather', siteId, 'history', params],
    queryFn: () => travelwizService.getWeatherHistory(siteId!, params),
    enabled: !!siteId,
  })
}

export function useReportWeather() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tripId, payload }: { tripId: string; payload: WeatherReport }) =>
      travelwizService.reportWeather(tripId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'weather'] })
    },
  })
}

export function useCaptainReportWeather() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tripId, payload }: { tripId: string; payload: CaptainWeatherReport }) =>
      travelwizService.captainReportWeather(tripId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'weather'] })
    },
  })
}

// ── Pickup Rounds (Ramassage) ──

export function usePickupRounds(params: PaginationParams & { status?: string; date?: string } = {}) {
  return useQuery({
    queryKey: ['travelwiz', 'pickup-rounds', params],
    queryFn: () => travelwizService.listPickupRounds(params),
    placeholderData: keepPreviousData,
  })
}

export function usePickupRound(id: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'pickup-rounds', id],
    queryFn: () => travelwizService.getPickupRound(id!),
    enabled: !!id,
  })
}

export function useRecordPickupStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roundId, stopId, payload }: { roundId: string; stopId: string; payload: { status: string; actual_time?: string } }) =>
      travelwizService.recordPickupStop(roundId, stopId, payload),
    onSuccess: (_, { roundId }) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'pickup-rounds', roundId] })
      qc.invalidateQueries({ queryKey: ['travelwiz', 'pickup-rounds'] })
    },
  })
}

export function useClosePickupRound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => travelwizService.closePickupRound(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'pickup-rounds'] })
    },
  })
}
