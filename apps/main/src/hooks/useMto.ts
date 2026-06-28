/**
 * React Query hooks for the MTO module (rapprochement MTO <-> stock/catalogue SAP).
 *
 * Backend : app/api/routes/modules/mto/__init__.py + app/schemas/mto.py.
 * Garder en phase quand le schéma backend change.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '@/lib/api'
import { downloadFile } from '@/lib/downloadPdf'

export interface MtoBatch {
  id: string
  project_id: string | null
  /** Nom du projet lié (renvoyé par le backend via outerjoin). */
  project_name: string | null
  filename: string | null
  label: string | null
  status: string
  /** Rôle du MTO dans le projet : "design" (initial) ou "revise" (révisé). */
  role: string
  created_at: string | null
}

/**
 * Statistiques d'un batch MTO — alimente la liste project-first.
 * Endpoint : GET /api/v1/mto/batches/stats?project_id=
 * Le champ `couverture` mappe chaque statut métier (clés de mtoService :
 * "en stock" / "partiel" / "à commander") vers son nombre de groupes.
 */
export interface MtoBatchStats extends MtoBatch {
  nb_lignes: number
  nb_groupes: number
  nb_trouves: number
  couverture: Record<string, number>
}

export interface MtoChild {
  line_num?: string
  row?: number
  mark?: string
  tag?: string
  diameter?: string
  description?: string
  qte?: number
  length?: number
}

export interface MtoGroup {
  id: string
  batch_id: string
  mto_key: string
  article_code: string | null
  designation_sap: string | null
  famille: string | null
  diameter: string | null
  besoin: number
  unite: string | null
  unit_check: boolean
  unit_detail: string | null
  dispo: number
  emplacements: string | null
  statut: string | null
  confidence: string | null
  found: boolean
  verification_status: string
  nb_lignes: number
  children: MtoChild[]
}

export interface CatalogItem {
  id: string
  code: string
  designation: string
  famille: string | null
}

/** Résultat d'un import MTO — c'est un BatchRead (cf. backend). */
export type MtoImportResult = MtoBatch

/**
 * Liste des batches MTO. `projectId` optionnel : si fourni, filtre côté
 * serveur (?project_id=…). Sinon renvoie tous les batches de l'entité.
 */
export function useMtoBatches(projectId?: string | null) {
  return useQuery({
    queryKey: ['mto-batches', projectId ?? null],
    queryFn: async () =>
      (
        await api.get<MtoBatch[]>('/api/v1/mto/batches', {
          params: projectId ? { project_id: projectId } : undefined,
        })
      ).data,
  })
}

/**
 * Statistiques des batches MTO d'un projet (project-first). N'est activé que
 * si `projectId` est fourni : sans projet, on n'affiche pas de MTO.
 * Endpoint : GET /api/v1/mto/batches/stats?project_id=
 */
export function useMtoBatchStats(projectId: string | null) {
  return useQuery({
    queryKey: ['mto-batch-stats', projectId ?? null],
    queryFn: async () =>
      (
        await api.get<MtoBatchStats[]>('/api/v1/mto/batches/stats', {
          params: { project_id: projectId },
        })
      ).data,
    enabled: !!projectId,
  })
}

/**
 * Groupes consolidés d'un batch. `statut` optionnel : filtre côté serveur
 * (en stock / partiel / à commander).
 */
export function useMtoGroups(batchId: string | null, statut?: string | null) {
  return useQuery({
    queryKey: ['mto-groups', batchId, statut ?? null],
    queryFn: async () =>
      (
        await api.get<MtoGroup[]>(`/api/v1/mto/batches/${batchId}/groups`, {
          params: statut ? { statut } : undefined,
        })
      ).data,
    enabled: !!batchId,
  })
}

/** Rôle d'un MTO dans le cycle d'un projet. */
export type MtoRole = 'design' | 'revise'

/**
 * Import d'un fichier MTO (multipart). Optionnellement rattaché à un projet.
 * `role` (design|revise, défaut "design" côté backend) qualifie le MTO pour le
 * croisement design ↔ révisé.
 * Endpoint : POST /api/v1/mto/import/mto (perm mto.requirement.import).
 */
export function useImportMto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      projectId,
      label,
      role,
    }: {
      file: File
      projectId?: string | null
      label?: string
      role?: MtoRole
    }) => {
      const form = new FormData()
      form.append('file', file)
      if (projectId) form.append('project_id', projectId)
      if (label) form.append('label', label)
      if (role) form.append('role', role)
      return (
        await api.post<MtoImportResult>('/api/v1/mto/import/mto', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mto-batches'] })
    },
  })
}

/** Résultat d'un import catalogue / stock (cf. backend ImportResult). */
export interface MtoImportCount {
  imported: number
  kind: string
}

/**
 * Import du catalogue SAP (multipart, fichier seul).
 * Endpoint : POST /api/v1/mto/import/catalogue (perm mto.catalogue.import).
 */
export function useImportCatalogue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return (
        await api.post<MtoImportCount>('/api/v1/mto/import/catalogue', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mto-catalogue'] })
    },
  })
}

/**
 * Import d'un état de stock SAP (multipart, fichier + label optionnel).
 * Endpoint : POST /api/v1/mto/import/stock (perm mto.stock.import).
 */
export function useImportStock() {
  return useMutation({
    mutationFn: async ({ file, label }: { file: File; label?: string }) => {
      const form = new FormData()
      form.append('file', file)
      if (label) form.append('label', label)
      return (
        await api.post<MtoImportCount>('/api/v1/mto/import/stock', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data
    },
  })
}

export function useConsolidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (batchId: string) =>
      (await api.post(`/api/v1/mto/batches/${batchId}/consolidate`)).data,
    onSuccess: (_data, batchId) => {
      qc.invalidateQueries({ queryKey: ['mto-groups', batchId] })
    },
  })
}

export function useValidateGroup(batchId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) =>
      (await api.post<MtoGroup>(`/api/v1/mto/groups/${groupId}/validate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mto-groups', batchId] }),
  })
}

export function useCorrectGroup(batchId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, articleCode }: { groupId: string; articleCode: string }) =>
      (await api.post<MtoGroup>(`/api/v1/mto/groups/${groupId}/correct`, { article_code: articleCode })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mto-groups', batchId] }),
  })
}

/**
 * Téléchargement authentifié du classeur Excel métier d'un batch MTO
 * (3 feuilles : Synthèse / À sortir du stock / À commander).
 *
 * Endpoint : GET /api/v1/mto/batches/{batchId}/export.xlsx
 * (auth Bearer, permission mto.export). On passe par `downloadFile` (axios +
 * blob) car une navigation navigateur perdrait le header Authorization.
 */
export function useMtoExport(batchId: string | null) {
  return useMutation({
    mutationFn: async () => {
      if (!batchId) throw new Error('batchId requis pour exporter')
      await downloadFile(
        `/api/v1/mto/batches/${batchId}/export.xlsx`,
        `mto-${batchId.slice(0, 8)}.xlsx`,
      )
    },
  })
}

export function useCatalogSearch(q: string) {
  return useQuery({
    queryKey: ['mto-catalogue', q],
    queryFn: async () =>
      (await api.get<CatalogItem[]>('/api/v1/mto/catalogue', { params: { q } })).data,
    enabled: q.trim().length >= 2,
  })
}

// ── Croisement de 2 MTO (design ↔ révisé) ──────────────────────────────────

/** Type d'évolution d'un item entre le MTO design et le MTO révisé. */
export type MtoDiffChangeType = 'added' | 'removed' | 'changed' | 'unchanged'

/** Une ligne du croisement design ↔ révisé (clé = item consolidé). */
export interface MtoDiffItem {
  mto_key: string
  designation: string | null
  diameter: string | null
  unite: string | null
  besoin_design: number
  besoin_revise: number
  /** besoin_revise - besoin_design (signé). */
  delta: number
  change_type: MtoDiffChangeType
}

/** Résultat complet du croisement de 2 batches MTO. */
export interface MtoDiffResult {
  design_batch_id: string
  revise_batch_id: string
  summary: Record<MtoDiffChangeType, number>
  items: MtoDiffItem[]
}

/**
 * Croisement de 2 MTO d'un projet (design vs révisé). N'est activé que si les
 * deux batches sont fournis.
 * Endpoint : GET /api/v1/mto/diff?design_batch_id=&revise_batch_id=
 */
export function useMtoDiff(
  designBatchId: string | null,
  reviseBatchId: string | null,
) {
  return useQuery({
    queryKey: ['mto-diff', designBatchId, reviseBatchId],
    queryFn: async () =>
      (
        await api.get<MtoDiffResult>('/api/v1/mto/diff', {
          params: {
            design_batch_id: designBatchId,
            revise_batch_id: reviseBatchId,
          },
        })
      ).data,
    enabled: !!designBatchId && !!reviseBatchId,
  })
}

// ── Réconciliation « fourni/commandé vs consommé » (reliquat à retourner) ───

/** Résultat d'un import de consommation (cf. backend ImportResult). */
export interface MtoConsumptionImportResult {
  imported: number
  kind: 'consumption'
}

/**
 * Import d'un fichier de consommation réelle (multipart). Rattaché à un projet,
 * optionnellement à un MTO (batch) précis.
 * Endpoint : POST /api/v1/mto/import/consumption
 *   (perm mto.requirement.import).
 * Invalide la réconciliation du batch concerné.
 */
export function useImportConsumption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      projectId,
      batchId,
    }: {
      file: File
      projectId: string
      batchId?: string | null
    }) => {
      const form = new FormData()
      form.append('file', file)
      form.append('project_id', projectId)
      if (batchId) form.append('batch_id', batchId)
      return (
        await api.post<MtoConsumptionImportResult>(
          '/api/v1/mto/import/consumption',
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        )
      ).data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['mto-reconciliation', vars.batchId ?? null] })
    },
  })
}

/**
 * Une ligne de réconciliation : pour un article, ce qui était fourni (besoin),
 * commandé, consommé, et le reliquat à retourner à PERENCO (a_retourner).
 */
export interface ReconcileItem {
  code_article: string
  designation: string | null
  besoin: number
  a_commander: number
  consomme: number
  a_retourner: number
}

/** Synthèse de la réconciliation d'un MTO (totaux). */
export interface ReconcileSummary {
  lines: number
  total_besoin: number
  total_consomme: number
  total_a_retourner: number
}

/** Résultat complet de la réconciliation d'un batch MTO. */
export interface ReconcileResult {
  batch_id: string
  summary: ReconcileSummary
  items: ReconcileItem[]
}

/**
 * Réconciliation fourni/commandé vs consommé d'un MTO. N'est activé que si
 * `batchId` est fourni.
 * Endpoint : GET /api/v1/mto/batches/{batch_id}/reconciliation
 */
export function useReconciliation(batchId: string | null) {
  return useQuery({
    queryKey: ['mto-reconciliation', batchId ?? null],
    queryFn: async () =>
      (
        await api.get<ReconcileResult>(
          `/api/v1/mto/batches/${batchId}/reconciliation`,
        )
      ).data,
    enabled: !!batchId,
  })
}

// ── Analytics d'approvisionnement (statistiques transverses) ────────────────

/** Synthèse globale des statistiques d'approvisionnement. */
export interface MtoAnalyticsOverview {
  /** Nombre de MTO (batches) couverts par la statistique. */
  nb_batches: number
  /** Nombre d'articles distincts. */
  nb_articles: number
  /** Taux de disponibilité (0–100, en %). */
  taux_dispo: number
  /** Total des quantités à commander. */
  total_a_commander: number
  /** Total des quantités consommées. */
  total_consomme: number
}

/** Un article du palmarès « consommés » / « demandés » (code + total). */
export interface MtoAnalyticsTopItem {
  code_article: string
  designation: string | null
  total: number
}

/** Un article du palmarès « fréquence de commande » (code + nb de MTO). */
export interface MtoAnalyticsFreqItem {
  code_article: string
  designation: string | null
  count: number
}

/** Une paire d'articles souvent commandés ensemble (co-occurrence). */
export interface MtoAnalyticsPair {
  article_a: string
  article_b: string
  count: number
}

/** Résultat complet des analytics d'approvisionnement. */
export interface MtoAnalyticsResult {
  overview: MtoAnalyticsOverview
  top_consommes: MtoAnalyticsTopItem[]
  top_demandes: MtoAnalyticsTopItem[]
  top_frequence: MtoAnalyticsFreqItem[]
  co_occurrence: MtoAnalyticsPair[]
}

/**
 * Statistiques d'approvisionnement. `projectId` OPTIONNEL : si fourni, la stat
 * est cadrée sur ce projet (?project_id=…) ; sinon, vue globale entité.
 * Toujours activé (un projet null = vue globale, pas d'attente de sélection).
 * Endpoint : GET /api/v1/mto/analytics?project_id=
 */
export function useMtoAnalytics(projectId: string | null) {
  return useQuery({
    queryKey: ['mto-analytics', projectId ?? null],
    queryFn: async () =>
      (
        await api.get<MtoAnalyticsResult>('/api/v1/mto/analytics', {
          params: projectId ? { project_id: projectId } : undefined,
        })
      ).data,
  })
}
