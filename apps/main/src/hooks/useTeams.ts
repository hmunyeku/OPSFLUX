/**
 * useTeams — hooks React Query pour le module Teams.
 *
 * Pattern : invalide aussi les clés liées (ads pax, project teams) sur les
 * mutations qui peuvent les impacter, pour garder l'UI cohérente sans
 * appel manuel à `refetch`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  teamsService,
  type ProjectTeamRole,
  type Team,
  type TeamCreatePayload,
  type TeamListFilters,
  type TeamMemberCreatePayload,
  type TeamMemberMovePayload,
  type TeamMemberRole,
  type TeamUpdatePayload,
} from '@/services/teamsService'

// ── Queries ────────────────────────────────────────────────

export function useTeams(filters: TeamListFilters = {}) {
  return useQuery({
    queryKey: ['teams', filters],
    queryFn: () => teamsService.list(filters),
    staleTime: 15_000,
  })
}

export function useTeam(id: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['teams', id],
    queryFn: () => teamsService.get(id),
    enabled: !!id && (opts?.enabled !== false),
    staleTime: 15_000,
  })
}

export function useTeamHistory(teamId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['teams', teamId, 'history'],
    queryFn: () => teamsService.getHistory(teamId),
    enabled: !!teamId && (opts?.enabled !== false),
    staleTime: 30_000,
  })
}

// ── Mutations CRUD ─────────────────────────────────────────

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TeamCreatePayload) => teamsService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

export function useUpdateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TeamUpdatePayload }) =>
      teamsService.update(id, payload),
    onSuccess: (data: Team) => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.setQueryData(['teams', data.id], data)
    },
  })
}

export function useDeleteTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => teamsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

// ── Mutations Members ──────────────────────────────────────

export function useAddTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ teamId, payload }: { teamId: string; payload: TeamMemberCreatePayload }) =>
      teamsService.addMember(teamId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams', vars.teamId] })
      qc.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

export function useUpdateTeamMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      teamId, memberId, role,
    }: { teamId: string; memberId: string; role: TeamMemberRole }) =>
      teamsService.updateMemberRole(teamId, memberId, { role }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams', vars.teamId] })
    },
  })
}

export function useRemoveTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ teamId, memberId }: { teamId: string; memberId: string }) =>
      teamsService.removeMember(teamId, memberId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams', vars.teamId] })
      qc.invalidateQueries({ queryKey: ['teams', vars.teamId, 'history'] })
    },
  })
}

export function useMoveTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      teamId, memberId, payload,
    }: { teamId: string; memberId: string; payload: TeamMemberMovePayload }) =>
      teamsService.moveMember(teamId, memberId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams', vars.teamId] })
      qc.invalidateQueries({ queryKey: ['teams', vars.payload.target_team_id] })
      qc.invalidateQueries({ queryKey: ['teams'] })
    },
  })
}

// ── ADS integration ───────────────────────────────────────

export function useAddTeamToAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      adsId, teamId, skip_duplicates,
    }: { adsId: string; teamId: string; skip_duplicates?: boolean }) =>
      teamsService.addToAds(adsId, teamId, { skip_duplicates }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'pax'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId] })
    },
  })
}

export function useRemoveTeamFromAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adsId, teamId }: { adsId: string; teamId: string }) =>
      teamsService.removeFromAds(adsId, teamId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'pax'] })
    },
  })
}

// ── Project integration ────────────────────────────────────

export function useProjectTeams(projectId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['projects', projectId, 'teams'],
    queryFn: () => teamsService.listProjectTeams(projectId),
    enabled: !!projectId && (opts?.enabled !== false),
    staleTime: 15_000,
  })
}

export function useAttachTeamToProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId, teamId, role,
    }: { projectId: string; teamId: string; role?: ProjectTeamRole }) =>
      teamsService.attachToProject(projectId, teamId, role),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['projects', vars.projectId, 'teams'] })
    },
  })
}

export function useDetachTeamFromProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, teamId }: { projectId: string; teamId: string }) =>
      teamsService.detachFromProject(projectId, teamId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['projects', vars.projectId, 'teams'] })
    },
  })
}

// ── Activity integration ──────────────────────────────────

export function useActivityTeams(activityId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['planner', 'activity', activityId, 'teams'],
    queryFn: () => teamsService.listActivityTeams(activityId),
    enabled: !!activityId && (opts?.enabled !== false),
    staleTime: 15_000,
  })
}

export function useAttachTeamToActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      activityId, teamId, role,
    }: { activityId: string; teamId: string; role?: ProjectTeamRole }) =>
      teamsService.attachToActivity(activityId, teamId, role),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['planner', 'activity', vars.activityId, 'teams'] })
    },
  })
}

export function useDetachTeamFromActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ activityId, teamId }: { activityId: string; teamId: string }) =>
      teamsService.detachFromActivity(activityId, teamId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['planner', 'activity', vars.activityId, 'teams'] })
    },
  })
}
