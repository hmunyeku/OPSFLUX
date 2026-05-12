/**
 * Teams API client — equipes transverses reutilisables.
 *
 * Mirrors app/api/routes/modules/teams.py + app/schemas/teams.py.
 * Pattern membres : XOR user_id/contact_id (comme ads_pax).
 * Historisation : soft-end via left_at — un membre sorti garde sa row.
 */
import api from '@/lib/api'
import type { PaginatedResponse } from '@/types/api'

// ── Types ──────────────────────────────────────────────────

export type TeamVisibility = 'public' | 'private'
export type TeamMemberRole = 'lead' | 'senior' | 'member' | 'observer'
export type ProjectTeamRole =
  | 'main_team'
  | 'support_team'
  | 'consulting'
  | 'subcontractor'

export interface TeamMember {
  id: string
  team_id: string
  user_id: string | null
  contact_id: string | null
  role: TeamMemberRole
  joined_at: string
  left_at: string | null
  added_by: string | null
  moved_to_team_id: string | null
  // Enrichi par le backend :
  pax_source?: 'user' | 'contact' | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  avatar_url?: string | null
  job_position_name?: string | null
  company_name?: string | null
}

export interface Team {
  id: string
  entity_id: string
  name: string
  description: string | null
  visibility: TeamVisibility
  created_by: string
  active: boolean
  tags: string[] | null
  created_at: string
  updated_at: string
  // Enrichi :
  created_by_name?: string | null
  member_count: number
  active_members?: TeamMember[] | null
  past_members?: TeamMember[] | null
}

export interface TeamMemberInitial {
  user_id?: string | null
  contact_id?: string | null
  role?: TeamMemberRole
}

export interface TeamCreatePayload {
  name: string
  description?: string | null
  visibility?: TeamVisibility
  tags?: string[] | null
  initial_members?: TeamMemberInitial[]
}

export interface TeamUpdatePayload {
  name?: string
  description?: string | null
  visibility?: TeamVisibility
  active?: boolean
  tags?: string[] | null
}

export interface TeamMemberCreatePayload {
  user_id?: string | null
  contact_id?: string | null
  role?: TeamMemberRole
}

export interface TeamMemberUpdatePayload {
  role: TeamMemberRole
}

export interface TeamMemberMovePayload {
  target_team_id: string
  role?: TeamMemberRole
}

export interface TeamListFilters {
  search?: string
  visibility?: TeamVisibility
  include_inactive?: boolean
  page?: number
  page_size?: number
}

// ── ADS integration ───────────────────────────────────────

export interface AddTeamToAdsResult {
  team_id: string
  team_name: string
  summary: {
    total_members: number
    added: number
    skipped: number
    errors: number
  }
  added: Array<{
    member_id: string
    user_id?: string
    contact_id?: string
    role_in_team?: TeamMemberRole
  }>
  skipped: Array<{
    member_id: string
    user_id?: string
    contact_id?: string
    reason: string
  }>
  errors: Array<{
    member_id: string
    user_id?: string
    contact_id?: string
    error: string
  }>
}

// ── Project integration ───────────────────────────────────

export interface ProjectTeamRead {
  id: string
  project_id: string
  team_id: string
  role: ProjectTeamRole | null
  attached_at: string
  attached_by: string | null
  team_name: string
  team_visibility: TeamVisibility
  team_member_count: number
}

// ── API calls ──────────────────────────────────────────────

const BASE = '/api/v1/teams'

export const teamsService = {
  list: async (filters: TeamListFilters = {}): Promise<PaginatedResponse<Team>> => {
    const { data } = await api.get<PaginatedResponse<Team>>(BASE, { params: filters })
    return data
  },

  get: async (id: string): Promise<Team> => {
    const { data } = await api.get<Team>(`${BASE}/${id}`)
    return data
  },

  create: async (payload: TeamCreatePayload): Promise<Team> => {
    const { data } = await api.post<Team>(BASE, payload)
    return data
  },

  update: async (id: string, payload: TeamUpdatePayload): Promise<Team> => {
    const { data } = await api.patch<Team>(`${BASE}/${id}`, payload)
    return data
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`)
  },

  // ── Members ──
  addMember: async (
    teamId: string,
    payload: TeamMemberCreatePayload,
  ): Promise<TeamMember> => {
    const { data } = await api.post<TeamMember>(`${BASE}/${teamId}/members`, payload)
    return data
  },

  updateMemberRole: async (
    teamId: string,
    memberId: string,
    payload: TeamMemberUpdatePayload,
  ): Promise<TeamMember> => {
    const { data } = await api.patch<TeamMember>(
      `${BASE}/${teamId}/members/${memberId}`,
      payload,
    )
    return data
  },

  removeMember: async (teamId: string, memberId: string): Promise<void> => {
    await api.delete(`${BASE}/${teamId}/members/${memberId}`)
  },

  moveMember: async (
    teamId: string,
    memberId: string,
    payload: TeamMemberMovePayload,
  ): Promise<TeamMember> => {
    const { data } = await api.post<TeamMember>(
      `${BASE}/${teamId}/members/${memberId}/move`,
      payload,
    )
    return data
  },

  getHistory: async (teamId: string): Promise<TeamMember[]> => {
    const { data } = await api.get<TeamMember[]>(`${BASE}/${teamId}/history`)
    return data
  },

  // ── ADS integration ──
  addToAds: async (
    adsId: string,
    teamId: string,
    options?: { skip_duplicates?: boolean },
  ): Promise<AddTeamToAdsResult> => {
    const { data } = await api.post<AddTeamToAdsResult>(
      `/api/v1/pax/ads/${adsId}/add-team`,
      { team_id: teamId, skip_duplicates: options?.skip_duplicates ?? true },
    )
    return data
  },

  removeFromAds: async (adsId: string, teamId: string): Promise<void> => {
    await api.delete(`/api/v1/pax/ads/${adsId}/teams/${teamId}`)
  },

  // ── Project integration ──
  listProjectTeams: async (projectId: string): Promise<ProjectTeamRead[]> => {
    const { data } = await api.get<ProjectTeamRead[]>(
      `/api/v1/projects/${projectId}/teams`,
    )
    return data
  },

  attachToProject: async (
    projectId: string,
    teamId: string,
    role?: ProjectTeamRole,
  ): Promise<ProjectTeamRead> => {
    const { data } = await api.post<ProjectTeamRead>(
      `/api/v1/projects/${projectId}/teams`,
      { team_id: teamId, role },
    )
    return data
  },

  detachFromProject: async (projectId: string, teamId: string): Promise<void> => {
    await api.delete(`/api/v1/projects/${projectId}/teams/${teamId}`)
  },

  // ── Activity integration (SUP-0040 phase 1 final) ──
  /** Liste les equipes attachees a une activite planner. Memes champs que
   *  ProjectTeamRead (le DTO backend est identique : team_name, role,
   *  team_member_count, ...). */
  listActivityTeams: async (activityId: string): Promise<ProjectTeamRead[]> => {
    const { data } = await api.get<ProjectTeamRead[]>(
      `/api/v1/planner/activities/${activityId}/teams`,
    )
    return data
  },

  attachToActivity: async (
    activityId: string,
    teamId: string,
    role?: ProjectTeamRole,
  ): Promise<ProjectTeamRead> => {
    const { data } = await api.post<ProjectTeamRead>(
      `/api/v1/planner/activities/${activityId}/teams`,
      { team_id: teamId, role },
    )
    return data
  },

  detachFromActivity: async (activityId: string, teamId: string): Promise<void> => {
    await api.delete(`/api/v1/planner/activities/${activityId}/teams/${teamId}`)
  },
}

// ── Localised labels ──────────────────────────────────────

export const TEAM_MEMBER_ROLE_LABELS: Record<TeamMemberRole, string> = {
  lead: 'Chef',
  senior: 'Senior',
  member: 'Membre',
  observer: 'Observateur',
}

export const PROJECT_TEAM_ROLE_LABELS: Record<ProjectTeamRole, string> = {
  main_team: 'Équipe principale',
  support_team: 'Équipe en appui',
  consulting: 'Consultation',
  subcontractor: 'Sous-traitance',
}

export const TEAM_VISIBILITY_LABELS: Record<TeamVisibility, string> = {
  public: 'Publique',
  private: 'Privée',
}
