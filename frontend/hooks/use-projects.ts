"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  ProjectsApi,
  ProjectTasksApi,
  ProjectTeamApi,
  ProjectActivityApi,
  ProjectDocumentsApi,
  type Project,
  type ProjectTask,
  type TeamMember,
  type ProjectActivity,
  type ProjectDocument,
  type ProjectStats,
  type CreateProjectDTO,
  type UpdateProjectDTO,
  type ListProjectsParams,
  type ProjectStatus,
  type ProjectHealth,
  type Priority,
  type TaskStatus,
} from "@/lib/projects-api"
import { mockProjects, getProjectMetrics } from "@/lib/project-mock-data"
import { useToast } from "./use-toast"

// ============================================
// Use Projects Hook
// ============================================

export interface UseProjectsOptions {
  initialParams?: ListProjectsParams
  autoFetch?: boolean
  useMockData?: boolean
}

export interface UseProjectsReturn {
  // Data
  projects: Project[]
  filteredProjects: Project[]
  stats: ProjectStats
  isLoading: boolean
  error: string | null

  // Filters
  searchQuery: string
  setSearchQuery: (query: string) => void
  statusFilter: ProjectStatus | "all"
  setStatusFilter: (status: ProjectStatus | "all") => void
  priorityFilter: Priority | "all"
  setPriorityFilter: (priority: Priority | "all") => void
  healthFilter: ProjectHealth | "all"
  setHealthFilter: (health: ProjectHealth | "all") => void
  quickFilter: "all" | "active" | "at-risk" | "completed"
  setQuickFilter: (filter: "all" | "active" | "at-risk" | "completed") => void

  // Actions
  refresh: () => Promise<void>
  createProject: (data: CreateProjectDTO) => Promise<Project | null>
  updateProject: (id: string, data: UpdateProjectDTO) => Promise<Project | null>
  deleteProject: (id: string) => Promise<boolean>
  archiveProject: (id: string, archived?: boolean) => Promise<Project | null>
  toggleFavorite: (id: string) => Promise<void>
  updateStatus: (id: string, status: ProjectStatus) => Promise<Project | null>
  duplicateProject: (id: string, newName?: string) => Promise<Project | null>
  exportProject: (id: string, format?: "pdf" | "xlsx" | "json") => Promise<void>

  // Computed
  getProjectById: (id: string) => Project | undefined
}

export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const { initialParams, autoFetch = true, useMockData = true } = options
  const { toast } = useToast()

  // State
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all")
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all")
  const [healthFilter, setHealthFilter] = useState<ProjectHealth | "all">("all")
  const [quickFilter, setQuickFilter] = useState<"all" | "active" | "at-risk" | "completed">("all")

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (useMockData) {
        // Use mock data for now
        setProjects(mockProjects as unknown as Project[])
      } else {
        const data = await ProjectsApi.getAll(initialParams)
        setProjects(data)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch projects"
      setError(message)
      toast({
        variant: "destructive",
        title: "Erreur",
        description: message,
      })
    } finally {
      setIsLoading(false)
    }
  }, [initialParams, useMockData, toast])

  // Initial fetch
  useEffect(() => {
    if (autoFetch) {
      fetchProjects()
    }
  }, [autoFetch, fetchProjects])

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      // Search filter
      const matchesSearch =
        !searchQuery ||
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description.toLowerCase().includes(searchQuery.toLowerCase())

      // Status filter
      const matchesStatus = statusFilter === "all" || project.status === statusFilter

      // Priority filter
      const matchesPriority = priorityFilter === "all" || project.priority === priorityFilter

      // Health filter
      const matchesHealth = healthFilter === "all" || project.health === healthFilter

      // Quick filter
      let matchesQuickFilter = true
      if (quickFilter === "active") {
        matchesQuickFilter = project.status === "active"
      } else if (quickFilter === "at-risk") {
        matchesQuickFilter = project.health === "at-risk" || project.health === "critical"
      } else if (quickFilter === "completed") {
        matchesQuickFilter = project.status === "completed"
      }

      return matchesSearch && matchesStatus && matchesPriority && matchesHealth && matchesQuickFilter
    })
  }, [projects, searchQuery, statusFilter, priorityFilter, healthFilter, quickFilter])

  // Stats
  const stats = useMemo((): ProjectStats => {
    return {
      total: projects.length,
      active: projects.filter((p) => p.status === "active").length,
      completed: projects.filter((p) => p.status === "completed").length,
      onHold: projects.filter((p) => p.status === "on-hold").length,
      atRisk: projects.filter((p) => p.health === "at-risk" || p.health === "critical").length,
      overBudget: projects.filter((p) => (p.spent || 0) > p.budget).length,
      overdue: projects.filter((p) => {
        const metrics = getProjectMetrics(p as unknown as Parameters<typeof getProjectMetrics>[0])
        return metrics.daysOverdue > 0
      }).length,
      totalBudget: projects.reduce((sum, p) => sum + p.budget, 0),
      totalSpent: projects.reduce((sum, p) => sum + (p.spent || 0), 0),
    }
  }, [projects])

  // Actions
  const createProject = useCallback(async (data: CreateProjectDTO): Promise<Project | null> => {
    try {
      setIsLoading(true)
      const newProject = await ProjectsApi.create(data)
      if (newProject) {
        setProjects((prev) => [newProject, ...prev])
        toast({
          title: "Projet cree",
          description: `Le projet "${newProject.name}" a ete cree avec succes.`,
        })
      }
      return newProject
    } catch (err) {
      const message = err instanceof Error ? err.message : "Echec de la creation du projet"
      toast({
        variant: "destructive",
        title: "Erreur",
        description: message,
      })
      return null
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  const updateProject = useCallback(async (id: string, data: UpdateProjectDTO): Promise<Project | null> => {
    try {
      setIsLoading(true)
      const updated = await ProjectsApi.update(id, data)
      if (updated) {
        setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)))
        toast({
          title: "Projet mis a jour",
          description: "Les modifications ont ete enregistrees.",
        })
      }
      return updated
    } catch (err) {
      const message = err instanceof Error ? err.message : "Echec de la mise a jour du projet"
      toast({
        variant: "destructive",
        title: "Erreur",
        description: message,
      })
      return null
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    try {
      setIsLoading(true)
      const success = await ProjectsApi.delete(id)
      if (success) {
        setProjects((prev) => prev.filter((p) => p.id !== id))
        toast({
          title: "Projet supprime",
          description: "Le projet a ete supprime avec succes.",
        })
      }
      return success
    } catch (err) {
      const message = err instanceof Error ? err.message : "Echec de la suppression du projet"
      toast({
        variant: "destructive",
        title: "Erreur",
        description: message,
      })
      return false
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  const archiveProject = useCallback(async (id: string, archived: boolean = true): Promise<Project | null> => {
    try {
      // For mock data, update locally
      if (useMockData) {
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, isArchived: archived } : p))
        )
        toast({
          title: archived ? "Projet archive" : "Projet restaure",
          description: archived
            ? "Le projet a ete archive."
            : "Le projet a ete restaure.",
        })
        return projects.find((p) => p.id === id) || null
      }

      const updated = await ProjectsApi.archive(id, archived)
      if (updated) {
        setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)))
        toast({
          title: archived ? "Projet archive" : "Projet restaure",
          description: archived
            ? "Le projet a ete archive."
            : "Le projet a ete restaure.",
        })
      }
      return updated
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Operation impossible.",
      })
      return null
    }
  }, [useMockData, projects, toast])

  const toggleFavorite = useCallback(async (id: string): Promise<void> => {
    const project = projects.find((p) => p.id === id)
    if (!project) return

    const newFavorite = !project.isFavorite

    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isFavorite: newFavorite } : p))
    )

    if (!useMockData) {
      try {
        await ProjectsApi.toggleFavorite(id, newFavorite)
      } catch {
        // Revert on error
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, isFavorite: !newFavorite } : p))
        )
      }
    }
  }, [projects, useMockData])

  const updateStatus = useCallback(async (id: string, status: ProjectStatus): Promise<Project | null> => {
    if (useMockData) {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      )
      toast({
        title: "Statut mis a jour",
        description: `Le projet est maintenant "${status}".`,
      })
      return projects.find((p) => p.id === id) || null
    }

    return updateProject(id, { status })
  }, [useMockData, projects, updateProject, toast])

  const duplicateProject = useCallback(async (id: string, newName?: string): Promise<Project | null> => {
    try {
      const duplicated = await ProjectsApi.duplicate(id, newName)
      if (duplicated) {
        setProjects((prev) => [duplicated, ...prev])
        toast({
          title: "Projet duplique",
          description: `Le projet "${duplicated.name}" a ete cree.`,
        })
      }
      return duplicated
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec de la duplication du projet.",
      })
      return null
    }
  }, [toast])

  const exportProject = useCallback(async (id: string, format: "pdf" | "xlsx" | "json" = "json"): Promise<void> => {
    try {
      const blob = await ProjectsApi.export(id, format)
      const project = projects.find((p) => p.id === id)
      const filename = `${project?.code || "project"}_export.${format}`

      // Download file
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "Export reussi",
        description: `Le fichier ${filename} a ete telecharge.`,
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec de l'export.",
      })
    }
  }, [projects, toast])

  const getProjectById = useCallback((id: string): Project | undefined => {
    return projects.find((p) => p.id === id)
  }, [projects])

  return {
    // Data
    projects,
    filteredProjects,
    stats,
    isLoading,
    error,

    // Filters
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    healthFilter,
    setHealthFilter,
    quickFilter,
    setQuickFilter,

    // Actions
    refresh: fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    archiveProject,
    toggleFavorite,
    updateStatus,
    duplicateProject,
    exportProject,

    // Computed
    getProjectById,
  }
}

// ============================================
// Use Single Project Hook
// ============================================

export interface UseProjectReturn {
  project: Project | null
  tasks: ProjectTask[]
  team: TeamMember[]
  activities: ProjectActivity[]
  documents: ProjectDocument[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  updateProject: (data: UpdateProjectDTO) => Promise<Project | null>
  addTask: (task: Partial<ProjectTask>) => Promise<ProjectTask | null>
  updateTask: (taskId: string, data: Partial<ProjectTask>) => Promise<ProjectTask | null>
  deleteTask: (taskId: string) => Promise<boolean>
  addTeamMember: (userId: string, role: string) => Promise<TeamMember | null>
  removeTeamMember: (memberId: string) => Promise<boolean>
  uploadDocument: (file: File, category: ProjectDocument["category"]) => Promise<ProjectDocument | null>
}

export function useProject(projectId: string | null, useMockData = true): UseProjectReturn {
  const { toast } = useToast()

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [activities, setActivities] = useState<ProjectActivity[]>([])
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProject = useCallback(async () => {
    if (!projectId) return

    setIsLoading(true)
    setError(null)

    try {
      if (useMockData) {
        const found = mockProjects.find((p) => p.id === projectId)
        if (found) {
          setProject(found as unknown as Project)
          setTeam((found.team || []) as unknown as TeamMember[])
        } else {
          setError("Projet non trouve")
        }
      } else {
        const [projectData, tasksData, teamData, activitiesData, docsData] = await Promise.all([
          ProjectsApi.getById(projectId),
          ProjectTasksApi.list(projectId),
          ProjectTeamApi.list(projectId),
          ProjectActivityApi.list(projectId),
          ProjectDocumentsApi.list(projectId),
        ])

        if (projectData) {
          setProject(projectData)
          setTasks(tasksData)
          setTeam(teamData)
          setActivities(activitiesData)
          setDocuments(docsData)
        } else {
          setError("Projet non trouve")
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, useMockData])

  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  const updateProject = useCallback(async (data: UpdateProjectDTO): Promise<Project | null> => {
    if (!projectId) return null

    try {
      const updated = await ProjectsApi.update(projectId, data)
      if (updated) {
        setProject(updated)
        toast({
          title: "Projet mis a jour",
          description: "Les modifications ont ete enregistrees.",
        })
      }
      return updated
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec de la mise a jour.",
      })
      return null
    }
  }, [projectId, toast])

  const addTask = useCallback(async (task: Partial<ProjectTask>): Promise<ProjectTask | null> => {
    if (!projectId) return null

    try {
      const newTask = await ProjectTasksApi.create(projectId, task)
      if (newTask) {
        setTasks((prev) => [...prev, newTask])
        toast({
          title: "Tache creee",
          description: `La tache "${newTask.title}" a ete creee.`,
        })
      }
      return newTask
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec de la creation de la tache.",
      })
      return null
    }
  }, [projectId, toast])

  const updateTask = useCallback(async (taskId: string, data: Partial<ProjectTask>): Promise<ProjectTask | null> => {
    if (!projectId) return null

    try {
      const updated = await ProjectTasksApi.update(projectId, taskId, data)
      if (updated) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)))
      }
      return updated
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec de la mise a jour de la tache.",
      })
      return null
    }
  }, [projectId, toast])

  const deleteTask = useCallback(async (taskId: string): Promise<boolean> => {
    if (!projectId) return false

    try {
      const success = await ProjectTasksApi.delete(projectId, taskId)
      if (success) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId))
        toast({
          title: "Tache supprimee",
          description: "La tache a ete supprimee.",
        })
      }
      return success
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec de la suppression.",
      })
      return false
    }
  }, [projectId, toast])

  const addTeamMember = useCallback(async (userId: string, role: string): Promise<TeamMember | null> => {
    if (!projectId) return null

    try {
      const member = await ProjectTeamApi.addMember(projectId, userId, role)
      if (member) {
        setTeam((prev) => [...prev, member])
        toast({
          title: "Membre ajoute",
          description: `${member.name} a ete ajoute a l'equipe.`,
        })
      }
      return member
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec de l'ajout du membre.",
      })
      return null
    }
  }, [projectId, toast])

  const removeTeamMember = useCallback(async (memberId: string): Promise<boolean> => {
    if (!projectId) return false

    try {
      const success = await ProjectTeamApi.removeMember(projectId, memberId)
      if (success) {
        setTeam((prev) => prev.filter((m) => m.id !== memberId))
        toast({
          title: "Membre retire",
          description: "Le membre a ete retire de l'equipe.",
        })
      }
      return success
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec du retrait du membre.",
      })
      return false
    }
  }, [projectId, toast])

  const uploadDocument = useCallback(async (file: File, category: ProjectDocument["category"]): Promise<ProjectDocument | null> => {
    if (!projectId) return null

    try {
      const doc = await ProjectDocumentsApi.upload(projectId, file, category)
      if (doc) {
        setDocuments((prev) => [...prev, doc])
        toast({
          title: "Document televerse",
          description: `${doc.name} a ete ajoute.`,
        })
      }
      return doc
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Echec du telechargement.",
      })
      return null
    }
  }, [projectId, toast])

  return {
    project,
    tasks,
    team,
    activities,
    documents,
    isLoading,
    error,
    refresh: fetchProject,
    updateProject,
    addTask,
    updateTask,
    deleteTask,
    addTeamMember,
    removeTeamMember,
    uploadDocument,
  }
}
