/**
 * Hook for fetching Gantt chart data from the API
 */

import { useState, useEffect, useCallback } from "react"
import { apiClient } from "@/lib/api-client"

// Types matching backend models
export interface ProjectTask {
  id: string
  project_id: string
  title: string
  description?: string
  status: string
  priority: string
  start_date?: string
  due_date?: string
  actual_start_date?: string
  actual_end_date?: string
  progress: number
  estimated_hours?: number
  actual_hours?: number
  assignee_id?: string
  assignee_name?: string
  is_milestone: boolean
  dependencies?: string
  parent_task_id?: string
  budget?: number
  pob?: number
  tags?: string
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface Project {
  id: string
  name: string
  code: string
  description?: string
  status: string
  priority: string
  health: string
  start_date?: string
  end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  progress: number
  budget?: number
  spent?: number
  currency: string
  manager_id?: string
  manager_name?: string
  client?: string
  location?: string
  category?: string
  is_favorite: boolean
  is_archived: boolean
  color?: string
  total_tasks: number
  completed_tasks: number
  tasks: ProjectTask[]
  created_at?: string
  updated_at?: string
}

export interface GanttData {
  projects: Project[]
  total_projects: number
  total_tasks: number
}

// Transformed types for the Gantt component
export interface GanttProject {
  id: string
  name: string
  code: string
  status: string
  startDate: Date
  endDate: Date
  progress: number
  manager: string
  team: string[]
  budget: number
  priority: string
  color?: string
}

export interface GanttTask {
  id: string
  projectId: string
  title: string
  status: string
  priority: string
  startDate: Date
  dueDate: Date
  assignee: string
  progress: number
  isMilestone?: boolean
  dependencies?: string[]
  budget?: number
  pob?: number
  color?: string
}

interface UseGanttDataResult {
  projects: GanttProject[]
  tasks: GanttTask[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// Project colors for Gantt
const projectColors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]

export function useGanttData(): UseGanttDataResult {
  const [projects, setProjects] = useState<GanttProject[]>([])
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await apiClient.get<GanttData>("/api/v1/projects/gantt/data")

      // Transform projects
      const transformedProjects: GanttProject[] = response.projects.map((p, index) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status.replace("_", "-"),
        startDate: p.start_date ? new Date(p.start_date) : new Date(),
        endDate: p.end_date ? new Date(p.end_date) : new Date(),
        progress: p.progress,
        manager: p.manager_name || "Non assigné",
        team: [], // Could be enriched with team data
        budget: p.budget || 0,
        priority: p.priority,
        color: p.color || projectColors[index % projectColors.length],
      }))

      // Transform tasks
      const transformedTasks: GanttTask[] = []
      response.projects.forEach((project, projectIndex) => {
        project.tasks.forEach((task) => {
          // Parse dependencies from JSON string
          let dependencies: string[] = []
          if (task.dependencies) {
            try {
              dependencies = JSON.parse(task.dependencies)
            } catch {
              // Not JSON, try comma-separated
              dependencies = task.dependencies.split(",").map((d) => d.trim()).filter(Boolean)
            }
          }

          transformedTasks.push({
            id: task.id,
            projectId: project.id,
            title: task.title,
            status: task.status.replace("_", "-"),
            priority: task.priority,
            startDate: task.start_date ? new Date(task.start_date) : new Date(),
            dueDate: task.due_date ? new Date(task.due_date) : new Date(),
            assignee: task.assignee_name || "Non assigné",
            progress: task.progress,
            isMilestone: task.is_milestone,
            dependencies: dependencies.length > 0 ? dependencies : undefined,
            budget: task.budget,
            pob: task.pob,
            color: project.color || projectColors[projectIndex % projectColors.length],
          })
        })
      })

      setProjects(transformedProjects)
      setTasks(transformedTasks)
    } catch (err) {
      let message = err instanceof Error ? err.message : "Failed to fetch Gantt data"
      // Improve error messages for common cases
      if (message.includes("Not authenticated") || message.includes("401")) {
        message = "Authentification requise. Veuillez vous connecter."
      } else if (message.includes("Forbidden") || message.includes("403")) {
        message = "Permission insuffisante pour accéder aux projets."
      } else if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        message = "Impossible de se connecter au serveur. Vérifiez votre connexion."
      }
      setError(message)
      console.error("Failed to fetch Gantt data:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { projects, tasks, isLoading, error, refetch: fetchData }
}
