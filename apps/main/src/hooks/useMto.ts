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

/**
 * Import d'un fichier MTO (multipart). Optionnellement rattaché à un projet.
 * Endpoint : POST /api/v1/mto/import/mto (perm mto.requirement.import).
 */
export function useImportMto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      projectId,
      label,
    }: {
      file: File
      projectId?: string | null
      label?: string
    }) => {
      const form = new FormData()
      form.append('file', file)
      if (projectId) form.append('project_id', projectId)
      if (label) form.append('label', label)
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
