/**
 * TravelWiz - Types TypeScript
 * Types pour le système de gestion de chargement bateau et retours site
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum PackagingTypeEnum {
  CONTENEUR = "Conteneur",
  PORTE_FUTS = "Porte-futs",
  SKID = "Skid",
  RACK_GAZ = "Rack gaz",
  TOOL_BOX = "Tool box",
  PANIER = "Panier",
  CAISSON = "Caisson",
  PORTE_CUVES = "Porte-cuves",
  BAC_DECHET = "Bac déchet",
}

export enum DestinationTypeEnum {
  MASSONGO = "Massongo",
  LA_LOBE = "La Lobe",
  WOURI = "Wouri",
  RDR = "RDR",
  HILI = "Hili",
  ADN_130 = "ADN 130",
}

export enum VesselTypeEnum {
  BOURBON_LIBERTY = "Bourbon Liberty 234",
  SKOUL_GWEN = "Skoul Gwen",
  COASTAL_FIGHTER = "Coastal Fighter",
  SURFER = "SURFER",
  VEDETE = "VEDETE",
  WOURI = "Wouri",
}

export enum SourceTypeEnum {
  MAGASIN = "Magasin",
  YARD = "Yard",
  PRESTATAIRE = "Prestataire externe",
}

export enum ManifestStatusEnum {
  BROUILLON = "Brouillon",
  EN_ATTENTE_VALIDATION = "En attente validation",
  VALIDE = "Validé",
  SIGNE_CAPITAINE = "Signé capitaine",
  CHARGE = "Chargé",
  EN_TRANSIT = "En transit",
  ARRIVE = "Arrivé",
  DECHARGE = "Déchargé",
  DISPATCHE = "Dispatché",
  LIVRE = "Livré",
  ANNULE = "Annulé",
}

export enum BackCargoTypeEnum {
  DECHETS_DIS = "Déchets DIS",
  DECHETS_DIB = "Déchets DIB",
  DECHETS_DMET = "Déchets DMET",
  MATERIEL_SOUS_TRAITANT = "Matériel sous-traitant",
  REINTEGRATION_STOCK = "Réintégration stock",
  A_REBUTER = "À rebuter",
  A_FERRAILLER = "À ferrailler",
  STOCKAGE_YARD = "Stockage Yard",
}

export enum ValidationStatusEnum {
  EN_ATTENTE = "En attente",
  VALIDE = "Validé",
  REFUSE = "Refusé",
}

export enum DiscrepancyTypeEnum {
  COLIS_MANQUANT = "Colis manquant",
  COLIS_ENDOMMAGE = "Colis endommagé",
  COLIS_NON_MANIFESTE = "Colis non manifesté",
  ECART_POIDS = "Écart de poids",
  MARQUAGE_INCORRECT = "Marquage incorrect",
  DOCUMENT_MANQUANT = "Document manquant",
  ELINGAGE_DEFECTUEUX = "Élingage défectueux",
}

export enum VesselArrivalStatusEnum {
  ATTENDU = "Attendu",
  EN_APPROCHE = "En approche",
  AMARRE = "Amarré",
  EN_COURS_INSPECTION = "En cours inspection",
  INSPECTE = "Inspecté",
  DECHARGE = "Déchargé",
  DISPATCHE = "Dispatché",
  PARTI = "Parti",
}

export enum YardDispatchStatusEnum {
  EN_ATTENTE_RECEPTION = "En attente réception",
  RECEPTIONNE = "Réceptionné",
  VERIFIE = "Vérifié",
  NOTIFIE = "Notifié",
  EN_ATTENTE_RETRAIT = "En attente retrait",
  RETIRE = "Retiré",
  DISPATCHE = "Dispatché",
  EN_ANOMALIE = "En anomalie",
}

export enum SeverityEnum {
  BASSE = "Basse",
  MOYENNE = "Moyenne",
  HAUTE = "Haute",
  CRITIQUE = "Critique",
}

export enum DestinationAreaEnum {
  MAGASIN = "Magasin",
  ZONE_DECHETS = "Zone déchets",
  ZONE_FERRAILLE = "Zone ferraille",
  YARD = "Yard",
  SOUS_TRAITANT = "Sous-traitant",
}

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface CargoItemBase {
  item_number: string
  packaging: PackagingTypeEnum
  packaging_number?: string | null
  quantity: number
  designation: string
  weight: number
  observations?: string | null
  cargo_win_number?: string | null
  cargo_nature?: string | null
  sap_code?: string | null
  sender?: string | null
  recipient?: string | null
  cargo_owner?: string | null
  slip_number?: string | null
  cost_imputation?: string | null
  picture_urls?: string[] | null
}

export interface CargoItemCreate extends CargoItemBase {}

export interface CargoItemPublic extends CargoItemBase {
  id: string
  qr_code?: string | null
  label_printed: boolean
  scanned_at?: string | null
  created_at: string
  updated_at: string
}

export interface StepValidation {
  status: ValidationStatusEnum
  validator?: string | null
  validator_role?: string | null
  date?: string | null
  signature?: string | null
  comments?: string | null
  location?: string | null
}

// ============================================================================
// LOADING MANIFEST TYPES
// ============================================================================

export interface LoadingManifestBase {
  pickup_location: string
  availability_date: string
  requested_delivery_date: string
  vessel: VesselTypeEnum
  destination: DestinationTypeEnum
  destination_code: string
  service: string
  recipient_name: string
  recipient_contact?: string | null
  source: SourceTypeEnum
  external_provider?: string | null
  emitter_service: string
  emitter_name: string
  emitter_contact?: string | null
  emitter_date: string
  notes?: string | null
}

export interface LoadingManifestCreate extends LoadingManifestBase {
  items: CargoItemCreate[]
}

export interface LoadingManifestUpdate {
  pickup_location?: string
  availability_date?: string
  requested_delivery_date?: string
  vessel?: VesselTypeEnum
  destination?: DestinationTypeEnum
  service?: string
  recipient_name?: string
  recipient_contact?: string
  status?: ManifestStatusEnum
  loading_validation?: StepValidation
  vessel_validation?: StepValidation
  unloading_validation?: StepValidation
  loading_date?: string
  departure_date?: string
  arrival_date?: string
  unloading_date?: string
  notes?: string
}

export interface LoadingManifestPublic extends LoadingManifestBase {
  id: string
  manifest_number: string
  status: ManifestStatusEnum
  total_weight: number
  total_packages: number
  emitter_signature?: string | null
  loading_validation?: Record<string, any> | null
  vessel_validation?: Record<string, any> | null
  unloading_validation?: Record<string, any> | null
  loading_date?: string | null
  departure_date?: string | null
  arrival_date?: string | null
  unloading_date?: string | null
  distribution_list?: string[] | null
  created_at: string
  updated_at: string
}

export interface LoadingManifestsPublic {
  data: LoadingManifestPublic[]
  count: number
}

// ============================================================================
// BACK CARGO MANIFEST TYPES
// ============================================================================

export interface BackCargoManifestBase {
  type: BackCargoTypeEnum
  origin_site: DestinationTypeEnum
  origin_rig?: string | null
  vessel: VesselTypeEnum
  arrival_date: string
  company_man?: string | null
  omaa_delegate?: string | null
  subcontractor_name?: string | null
  has_inventory: boolean
  has_exit_pass: boolean
  marked_bins: boolean
  has_scrap_mention: boolean
  has_yard_storage_mention: boolean
  destination_service?: string | null
  destination_area?: DestinationAreaEnum | null
  storage_reason?: string | null
  notes?: string | null
}

export interface BackCargoManifestCreate extends BackCargoManifestBase {
  items: CargoItemCreate[]
}

export interface BackCargoManifestUpdate {
  type?: BackCargoTypeEnum
  origin_site?: DestinationTypeEnum
  origin_rig?: string
  vessel?: VesselTypeEnum
  arrival_date?: string
  status?: ManifestStatusEnum
  company_man?: string
  company_man_signature?: StepValidation
  omaa_delegate?: string
  omaa_delegate_signature?: StepValidation
  captain_signature?: StepValidation
  subcontractor_name?: string
  subcontractor_signature?: StepValidation
  yard_officer_signature?: StepValidation
  has_inventory?: boolean
  has_exit_pass?: boolean
  marked_bins?: boolean
  has_scrap_mention?: boolean
  has_yard_storage_mention?: boolean
  destination_service?: string
  destination_area?: DestinationAreaEnum
  storage_reason?: string
  discrepancies?: string[]
  discrepancy_photos?: string[]
  pending_approval?: boolean
  approval_reason?: string
  yard_reception_date?: string
  yard_reception_by?: string
  yard_location?: string
  notes?: string
}

export interface BackCargoManifestPublic extends BackCargoManifestBase {
  id: string
  back_cargo_number: string
  status: ManifestStatusEnum
  total_weight: number
  total_packages: number
  compliance_rules: Record<string, any>
  company_man_signature?: Record<string, any> | null
  omaa_delegate_signature?: Record<string, any> | null
  captain_signature?: Record<string, any> | null
  subcontractor_signature?: Record<string, any> | null
  yard_officer_signature?: Record<string, any> | null
  discrepancies?: string[] | null
  discrepancy_photos?: string[] | null
  pending_approval: boolean
  approval_reason?: string | null
  yard_reception_date?: string | null
  yard_reception_by?: string | null
  yard_location?: string | null
  created_at: string
  updated_at: string
}

export interface BackCargoManifestsPublic {
  data: BackCargoManifestPublic[]
  count: number
}

// ============================================================================
// UNLOADING DISCREPANCY TYPES
// ============================================================================

export interface UnloadingDiscrepancyBase {
  type: DiscrepancyTypeEnum
  manifest_id?: string | null
  package_number?: string | null
  description: string
  expected_value?: string | null
  actual_value?: string | null
  severity: SeverityEnum
  photos?: string[] | null
  detected_by: string
  detected_at: string
}

export interface UnloadingDiscrepancyCreate extends UnloadingDiscrepancyBase {
  vessel_arrival_id: string
}

export interface UnloadingDiscrepancyUpdate {
  resolved?: boolean
  resolution_note?: string
  resolution_date?: string
}

export interface UnloadingDiscrepancyPublic extends UnloadingDiscrepancyBase {
  id: string
  vessel_arrival_id: string
  resolved: boolean
  resolution_note?: string | null
  resolution_date?: string | null
  created_at: string
  updated_at: string
}

export interface UnloadingDiscrepanciesPublic {
  data: UnloadingDiscrepancyPublic[]
  count: number
}

// ============================================================================
// VESSEL ARRIVAL TYPES
// ============================================================================

export interface VesselArrivalBase {
  vessel: VesselTypeEnum
  eta: string
}

export interface VesselArrivalCreate extends VesselArrivalBase {
  expected_manifests: number
  expected_packages: number
  expected_weight: number
}

export interface VesselArrivalUpdate {
  status?: VesselArrivalStatusEnum
  eta?: string
  ata?: string
  etd?: string
  atd?: string
  received_manifests?: number
  received_packages?: number
  received_weight?: number
  physical_check_completed?: boolean
  slips_recovered?: boolean
  weights_verified?: boolean
  riggings_verified?: boolean
  manifest_compared?: boolean
  inspector_name?: string
  inspection_date?: string
  inspection_notes?: string
  unloading_completed?: boolean
  unloading_notes?: string
  report_generated?: boolean
  report_url?: string
  report_sent?: boolean
  report_recipients?: string[]
}

export interface VesselArrivalPublic extends VesselArrivalBase {
  id: string
  status: VesselArrivalStatusEnum
  ata?: string | null
  etd?: string | null
  atd?: string | null
  expected_manifests: number
  received_manifests: number
  expected_packages: number
  received_packages: number
  expected_weight: number
  received_weight: number
  physical_check_completed: boolean
  slips_recovered: boolean
  weights_verified: boolean
  riggings_verified: boolean
  manifest_compared: boolean
  inspector_name?: string | null
  inspection_date?: string | null
  inspection_notes?: string | null
  unloading_completed: boolean
  unloading_notes?: string | null
  report_generated: boolean
  report_url?: string | null
  report_sent: boolean
  report_recipients?: string[] | null
  created_at: string
  updated_at: string
}

export interface VesselArrivalsPublic {
  data: VesselArrivalPublic[]
  count: number
}

// ============================================================================
// YARD DISPATCH TYPES
// ============================================================================

export interface YardDispatchBase {
  back_cargo_id: string
}

export interface YardDispatchCreate extends YardDispatchBase {
  yard_officer?: string | null
}

export interface YardDispatchUpdate {
  status?: YardDispatchStatusEnum
  reception_date?: string
  yard_officer?: string
  verification_completed?: boolean
  verification_notes?: string
  verification_anomalies?: string[]
  is_compliant?: boolean
  notification_sent?: boolean
  notification_method?: string
  notification_message?: string
  notification_date?: string
  exit_pass_number?: string
  exit_pass_generated?: boolean
  exit_pass_url?: string
  blue_copy_sent?: boolean
  dispatch_location?: string
  dispatch_zone?: string
  dispatch_date?: string
  dispatch_notes?: string
  withdrawn?: boolean
  withdrawn_date?: string
  withdrawn_by?: string
  withdrawn_signature?: string
}

export interface YardDispatchPublic extends YardDispatchBase {
  id: string
  status: YardDispatchStatusEnum
  reception_date?: string | null
  yard_officer?: string | null
  verification_completed: boolean
  verification_notes?: string | null
  verification_anomalies?: string[] | null
  is_compliant: boolean
  notification_sent: boolean
  notification_method?: string | null
  notification_message?: string | null
  notification_date?: string | null
  exit_pass_number?: string | null
  exit_pass_generated: boolean
  exit_pass_url?: string | null
  blue_copy_sent: boolean
  dispatch_location?: string | null
  dispatch_zone?: string | null
  dispatch_date?: string | null
  dispatch_notes?: string | null
  withdrawn: boolean
  withdrawn_date?: string | null
  withdrawn_by?: string | null
  withdrawn_signature?: string | null
  created_at: string
  updated_at: string
}

export interface YardDispatchesPublic {
  data: YardDispatchPublic[]
  count: number
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface TravelWizStats {
  active_manifests: number
  vessels_expected_7_days: number
  back_cargo_to_dispatch: number
  compliance_rate: number
  total_packages_in_transit: number
  total_weight_in_transit: number
}

export interface TravelWizDashboard {
  stats: TravelWizStats
  recent_manifests: LoadingManifestPublic[]
  recent_back_cargo: BackCargoManifestPublic[]
  upcoming_vessels: VesselArrivalPublic[]
  pending_dispatches: YardDispatchPublic[]
}
