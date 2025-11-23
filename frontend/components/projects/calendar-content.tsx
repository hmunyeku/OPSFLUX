"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useHeaderContext } from "@/components/header-context"
import { FullCalendar, CalendarEvent, CalendarUser } from "@/components/full-calendar"
import { ProjectsApi, ProjectTasksApi, Project, ProjectTask, TeamMember } from "@/lib/projects-api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CalendarDays,
  Clock,
  MapPin,
  FolderKanban,
  ExternalLink,
  Plus,
  AlertCircle,
} from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { cn } from "@/lib/utils"

// Color mapping for projects
const projectColors = ["blue", "green", "orange", "purple", "pink", "cyan", "red", "yellow"]

const getProjectColor = (index: number) => projectColors[index % projectColors.length]

// Get initials from name
const getInitials = (name: string): string => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

const eventTypeConfig = {
  task: { label: "Tâche", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  meeting: { label: "Réunion", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  deadline: { label: "Échéance", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  milestone: { label: "Jalon", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  event: { label: "Événement", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" },
}

export function CalendarContent() {
  const router = useRouter()
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Real data state
  const [projects, setProjects] = useState<Project[]>([])
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [users, setUsers] = useState<CalendarUser[]>([])

  // Convert tasks to calendar events
  const convertToEvents = useCallback((tasks: ProjectTask[], projectsData: Project[]): CalendarEvent[] => {
    const calendarEvents: CalendarEvent[] = []
    const projectMap = new Map(projectsData.map((p, index) => [p.id, { project: p, color: getProjectColor(index) }]))

    tasks.forEach((task) => {
      const projectInfo = projectMap.get(task.projectId)
      const projectColor = projectInfo?.color || "blue"

      // Task with due date
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate)

        // Regular task event
        calendarEvents.push({
          id: `${task.id}`,
          title: task.title,
          description: task.description,
          start: dueDate,
          end: dueDate,
          allDay: true,
          color: task.priority === "critical" ? "red" : task.priority === "high" ? "orange" : projectColor,
          projectId: task.projectId,
          taskId: task.id,
          userId: task.assigneeId,
          type: task.status === "done" ? "task" : "deadline",
        })
      }
    })

    // Add project milestones from projects
    projectsData.forEach((project, index) => {
      const color = getProjectColor(index)

      // Project start date
      if (project.startDate) {
        calendarEvents.push({
          id: `project-${project.id}-start`,
          title: `🚀 ${project.code} - Début`,
          description: project.name,
          start: new Date(project.startDate),
          end: new Date(project.startDate),
          allDay: true,
          color: color,
          projectId: project.id,
          type: "milestone",
        })
      }

      // Project end date
      if (project.endDate) {
        calendarEvents.push({
          id: `project-${project.id}-end`,
          title: `🎯 ${project.code} - Fin`,
          description: project.name,
          start: new Date(project.endDate),
          end: new Date(project.endDate),
          allDay: true,
          color: color,
          projectId: project.id,
          type: "milestone",
        })
      }

      // Add milestones if available
      project.milestones?.forEach((milestone) => {
        calendarEvents.push({
          id: `milestone-${milestone.id}`,
          title: `📍 ${milestone.name}`,
          description: milestone.description,
          start: new Date(milestone.dueDate),
          end: new Date(milestone.dueDate),
          allDay: true,
          color: "purple",
          projectId: project.id,
          type: "milestone",
        })
      })
    })

    return calendarEvents
  }, [])

  // Extract unique users from projects' team members
  const extractUsers = useCallback((projectsData: Project[]): CalendarUser[] => {
    const userMap = new Map<string, TeamMember>()

    projectsData.forEach((project) => {
      project.team?.forEach((member) => {
        if (!userMap.has(member.userId)) {
          userMap.set(member.userId, member)
        }
      })
      // Also add manager
      if (project.manager && !userMap.has(project.manager.userId)) {
        userMap.set(project.manager.userId, project.manager)
      }
    })

    return Array.from(userMap.values()).map((member, index) => ({
      id: member.userId,
      name: member.name,
      initials: getInitials(member.name),
      color: getProjectColor(index),
    }))
  }, [])

  // Fetch data from API
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Fetch all projects
        const projectsData = await ProjectsApi.getAll({ isArchived: false })
        setProjects(projectsData)

        // Fetch tasks for each project
        const tasksPromises = projectsData.map((project) =>
          ProjectTasksApi.list(project.id)
        )
        const tasksResults = await Promise.all(tasksPromises)
        const allTasksData = tasksResults.flat()
        setAllTasks(allTasksData)

        // Convert to calendar events
        const calendarEvents = convertToEvents(allTasksData, projectsData)
        setEvents(calendarEvents)

        // Extract users from projects
        const extractedUsers = extractUsers(projectsData)
        setUsers(extractedUsers)

      } catch (err) {
        console.error("Failed to fetch calendar data:", err)
        setError("Erreur lors du chargement des données du calendrier")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [convertToEvents, extractUsers])

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher événements...",
      contextualButtons: [
        {
          label: "Nouvelle tâche",
          icon: Plus,
          onClick: () => router.push("/projects/tasks/new"),
        },
      ],
    })
    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader, router])

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setIsEventDialogOpen(true)
  }

  const handleDateClick = (date: Date) => {
    router.push(`/projects/tasks/new?startDate=${format(date, "yyyy-MM-dd")}`)
  }

  const handleTimeSlotClick = (date: Date, hour: number) => {
    const dateWithTime = new Date(date)
    dateWithTime.setHours(hour, 0, 0, 0)
    router.push(`/projects/tasks/new?startDate=${format(dateWithTime, "yyyy-MM-dd")}&startTime=${format(dateWithTime, "HH:mm")}`)
  }

  const handleCreateEvent = () => {
    router.push("/projects/tasks/new")
  }

  const handleViewTask = () => {
    if (selectedEvent?.taskId) {
      router.push(`/projects/tasks/${selectedEvent.taskId}`)
      setIsEventDialogOpen(false)
    } else if (selectedEvent?.projectId) {
      router.push(`/projects/${selectedEvent.projectId}`)
      setIsEventDialogOpen(false)
    }
  }

  const getProjectInfo = (projectId?: string) => {
    return projects.find((p) => p.id === projectId)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-9" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <Skeleton className="h-[calc(100vh-200px)] w-full" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <p className="text-lg font-medium">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Réessayer
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full p-4">
      <FullCalendar
        events={events}
        users={users}
        initialView="month"
        onEventClick={handleEventClick}
        onDateClick={handleDateClick}
        onTimeSlotClick={handleTimeSlotClick}
        onCreateEvent={handleCreateEvent}
      />

      {/* Event Detail Dialog */}
      <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                <CalendarDays className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-lg">
                  {selectedEvent?.title}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {selectedEvent?.description || "Pas de description"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Type badge */}
            {selectedEvent?.type && (
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    eventTypeConfig[selectedEvent.type]?.color || "bg-gray-100 text-gray-700"
                  )}
                >
                  {eventTypeConfig[selectedEvent.type]?.label || selectedEvent.type}
                </Badge>
              </div>
            )}

            <Separator />

            {/* Time */}
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {selectedEvent?.allDay ? (
                    <>
                      {selectedEvent?.start && format(new Date(selectedEvent.start), "EEEE d MMMM yyyy", { locale: fr })}
                      <span className="text-muted-foreground"> • Toute la journée</span>
                    </>
                  ) : (
                    <>
                      {selectedEvent?.start && format(new Date(selectedEvent.start), "EEEE d MMMM yyyy", { locale: fr })}
                      {selectedEvent?.start && (
                        <span className="text-muted-foreground">
                          {" "}• {format(new Date(selectedEvent.start), "HH:mm")} - {format(new Date(selectedEvent.end), "HH:mm")}
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Location */}
            {selectedEvent?.location && (
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">{selectedEvent.location}</p>
              </div>
            )}

            {/* Project */}
            {selectedEvent?.projectId && (
              <div className="flex items-center gap-3">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {getProjectInfo(selectedEvent.projectId)?.code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getProjectInfo(selectedEvent.projectId)?.name}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-4">
              {(selectedEvent?.taskId || selectedEvent?.projectId) && (
                <Button onClick={handleViewTask} className="flex-1">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {selectedEvent?.taskId ? "Voir la tâche" : "Voir le projet"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsEventDialogOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
