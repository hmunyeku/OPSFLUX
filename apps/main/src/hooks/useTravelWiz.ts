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
  CaptainLogCreate,
  VoyageEventCreate,
  WeatherReport, CaptainWeatherReport,
  PaginationParams,
} from '@/types/api'

async function openPdfBlob(loader: () => Promise<Blob>) {
  const popup = window.open('', '_blank')
  if (popup) {
    popup.document.write('<html><body style="font-family: sans-serif; padding: 16px;">Chargement du PDF...</body></html>')
    popup.document.close()
  }
  const blob = await loader()
  const url = URL.createObjectURL(blob)
  if (popup && !popup.closed) popup.location.href = url
  else window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['travelwiz', 'voyages'] })
      // Cascade: voyage status changes (especially closed/cancelled) affect
      // PaxLog boarding status and Planner POB réel / forecast (spec §5.1)
      if (['closed', 'cancelled', 'delayed'].includes(vars.status)) {
        qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
        qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
        qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
        qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
      }
    },
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
      // Cascade: closing a trip triggers manifest.closed → PaxLog boarding
      // update → Planner POB réel change (spec §5.1)
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
      qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
    },
  })
}

export function useVoyagePaxManifestPdf() {
  return useMutation({
    mutationFn: async (id: string) => openPdfBlob(() => travelwizService.getVoyagePaxManifestPdf(id)),
  })
}

export function useVoyageCargoManifestPdf() {
  return useMutation({
    mutationFn: async (id: string) => openPdfBlob(() => travelwizService.getVoyageCargoManifestPdf(id)),
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

export function useVoyageCargoOperationsReport(tripId: string | undefined) {
  return useQuery({
    queryKey: ['travelwiz', 'voyages', tripId, 'cargo-operations-report'],
    queryFn: () => travelwizService.getVoyageCargoOperationsReport(tripId!),
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
