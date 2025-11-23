"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Search,
  Filter,
  Plus,
  ZoomIn,
  ZoomOut,
  Calendar,
  RotateCcw,
  Maximize2,
  Minimize2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Target,
  CalendarDays,
  FileDown,
  Printer,
  ChevronRight,
  ChevronDown,
  Link2,
  Type,
  ArrowRight,
  GripVertical,
  ExternalLink,
  Eye,
  EyeOff,
  Settings,
  Columns,
  ChevronsUpDown,
  Rows3,
  LayoutGrid,
  CalendarCheck,
  Route,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import type { Task, ViewMode } from "gantt-task-react"
import "gantt-task-react/dist/index.css"
import { useGanttData, type GanttProject, type GanttTask } from "@/hooks/use-gantt-data"
import { Skeleton } from "@/components/ui/skeleton"

// Dynamic import
const Gantt = dynamic(
  () => import("gantt-task-react").then((mod) => mod.Gantt),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <Calendar className="absolute inset-0 m-auto h-4 w-4 text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">Chargement du diagramme...</span>
        </div>
      </div>
    ),
  }
)

// Column definitions for the task list
type ColumnId = "name" | "duration" | "start" | "end" | "progress" | "predecessors" | "successors" | "budget" | "pob" | "assignee" | "priority"

interface ColumnDef {
  id: ColumnId
  label: string
  shortLabel: string
  width: number
  visible: boolean
}

const defaultColumns: ColumnDef[] = [
  { id: "name", label: "Nom", shortLabel: "Nom", width: 180, visible: true },
  { id: "duration", label: "Durée", shortLabel: "Dur.", width: 50, visible: true },
  { id: "start", label: "Début", shortLabel: "Déb.", width: 80, visible: false },
  { id: "end", label: "Fin", shortLabel: "Fin", width: 80, visible: false },
  { id: "progress", label: "Progression", shortLabel: "%", width: 45, visible: true },
  { id: "predecessors", label: "Prédécesseurs", shortLabel: "Préd.", width: 60, visible: false },
  { id: "successors", label: "Successeurs", shortLabel: "Succ.", width: 60, visible: false },
  { id: "budget", label: "Budget", shortLabel: "Bud.", width: 70, visible: false },
  { id: "pob", label: "POB", shortLabel: "POB", width: 40, visible: false },
  { id: "assignee", label: "Assigné", shortLabel: "Ass.", width: 60, visible: false },
  { id: "priority", label: "Priorité", shortLabel: "Pri.", width: 50, visible: false },
]

// Custom Task List Header Component with resizable columns
interface TaskListHeaderProps {
  headerHeight: number
  rowWidth: string
  columns: ColumnDef[]
  onColumnResize: (columnId: ColumnId, newWidth: number) => void
}

const CustomTaskListHeader: React.FC<TaskListHeaderProps> = ({ headerHeight, rowWidth, columns, onColumnResize }) => {
  const visibleCols = columns.filter(c => c.visible)
  const [resizingColumn, setResizingColumn] = useState<ColumnId | null>(null)
  const startXRef = useRef<number>(0)
  const startWidthRef = useRef<number>(0)

  const handleMouseDown = useCallback((e: React.MouseEvent, col: ColumnDef) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(col.id)
    startXRef.current = e.clientX
    startWidthRef.current = col.width
  }, [])

  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      const newWidth = Math.max(30, Math.min(300, startWidthRef.current + delta))
      onColumnResize(resizingColumn, newWidth)
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingColumn, onColumnResize])

  return (
    <div
      className="flex items-center bg-muted/50 border-b text-xs font-medium select-none"
      style={{ height: headerHeight, width: rowWidth }}
    >
      <div className="w-5 shrink-0" /> {/* Expander space */}
      {visibleCols.map((col, index) => (
        <div
          key={col.id}
          className="relative px-1 truncate text-muted-foreground"
          style={{ width: col.width }}
          title={col.label}
        >
          {col.shortLabel}
          {/* Resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 z-10"
            onMouseDown={(e) => handleMouseDown(e, col)}
          />
        </div>
      ))}
    </div>
  )
}

// Editing cell type
interface EditingCell {
  taskId: string
  columnId: ColumnId
}

// Custom Task List Table Component with inline editing
interface TaskListTableProps {
  rowHeight: number
  rowWidth: string
  tasks: Task[]
  columns: ColumnDef[]
  allTasks: GanttTask[]
  onExpanderClick: (task: Task) => void
  getDuration: (start: Date, end: Date) => number
  getSuccessors: (taskId: string) => string[]
  onTaskUpdate: (taskId: string, field: string, value: any) => void
}

const CustomTaskListTable: React.FC<TaskListTableProps> = ({
  rowHeight,
  rowWidth,
  tasks,
  columns,
  allTasks,
  onExpanderClick,
  getDuration,
  getSuccessors,
  onTaskUpdate,
}) => {
  const visibleCols = columns.filter(c => c.visible)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [editValue, setEditValue] = useState<string>("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  const getColumnValue = (task: Task, colId: ColumnId): string => {
    const sourceTask = allTasks.find(t => t.id === task.id)

    switch (colId) {
      case "name":
        return task.name
      case "duration":
        return `${getDuration(task.start, task.end)}j`
      case "start":
        return task.start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
      case "end":
        return task.end.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
      case "progress":
        return `${Math.round(task.progress)}%`
      case "predecessors":
        return sourceTask?.dependencies?.join(", ") || "-"
      case "successors":
        return getSuccessors(task.id).join(", ") || "-"
      case "budget":
        return sourceTask?.budget ? `${(sourceTask.budget / 1000).toFixed(0)}k` : "-"
      case "pob":
        return sourceTask?.pob?.toString() || "-"
      case "assignee":
        return sourceTask?.assignee || "-"
      case "priority":
        return sourceTask?.priority || "-"
      default:
        return "-"
    }
  }

  const getRawValue = (task: Task, colId: ColumnId): string => {
    const sourceTask = allTasks.find(t => t.id === task.id)

    switch (colId) {
      case "name":
        return task.name
      case "duration":
        return getDuration(task.start, task.end).toString()
      case "start":
        return task.start.toISOString().split('T')[0]
      case "end":
        return task.end.toISOString().split('T')[0]
      case "progress":
        return Math.round(task.progress).toString()
      case "predecessors":
        return sourceTask?.dependencies?.join(", ") || ""
      case "successors":
        return getSuccessors(task.id).join(", ") || ""
      case "budget":
        return sourceTask?.budget?.toString() || ""
      case "pob":
        return sourceTask?.pob?.toString() || ""
      case "assignee":
        return sourceTask?.assignee || ""
      case "priority":
        return sourceTask?.priority || ""
      default:
        return ""
    }
  }

  const isEditable = (colId: ColumnId): boolean => {
    // These columns can be edited
    return ["name", "progress", "budget", "pob", "assignee", "priority", "start", "end"].includes(colId)
  }

  const handleCellClick = (task: Task, colId: ColumnId) => {
    // Don't edit project rows or non-editable columns
    if (task.type === "project" || !isEditable(colId)) return

    setEditingCell({ taskId: task.id, columnId: colId })
    setEditValue(getRawValue(task, colId))
  }

  const handleSave = () => {
    if (!editingCell) return

    const { taskId, columnId } = editingCell

    // Map column to task field and convert value
    let field: string = columnId
    let value: any = editValue

    switch (columnId) {
      case "name":
        field = "title"
        break
      case "progress":
        value = Math.max(0, Math.min(100, parseInt(editValue) || 0))
        break
      case "budget":
        value = parseInt(editValue) || 0
        break
      case "pob":
        value = parseInt(editValue) || 0
        break
      case "start":
        field = "startDate"
        value = new Date(editValue)
        break
      case "end":
        field = "dueDate"
        value = new Date(editValue)
        break
      case "assignee":
        break
      case "priority":
        // Validate priority value
        if (!["low", "medium", "high", "critical"].includes(editValue.toLowerCase())) {
          value = "medium"
        } else {
          value = editValue.toLowerCase()
        }
        break
    }

    onTaskUpdate(taskId, field, value)
    setEditingCell(null)
    setEditValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      setEditingCell(null)
      setEditValue("")
    }
  }

  const getInputType = (colId: ColumnId): string => {
    switch (colId) {
      case "start":
      case "end":
        return "date"
      case "progress":
      case "budget":
      case "pob":
        return "number"
      default:
        return "text"
    }
  }

  return (
    <div style={{ width: rowWidth }}>
      {tasks.map((task) => {
        const isProject = task.type === "project"
        const hasChildren = task.hideChildren !== undefined

        return (
          <div
            key={task.id}
            className={`flex items-center border-b text-xs hover:bg-muted/30 ${isProject ? "bg-muted/20 font-medium" : ""}`}
            style={{ height: rowHeight }}
          >
            {/* Expander */}
            <div className="w-5 shrink-0 flex justify-center">
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => onExpanderClick(task)}
                  className="p-0.5 hover:bg-muted rounded"
                >
                  {task.hideChildren ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>

            {/* Columns */}
            {visibleCols.map((col) => {
              const isEditing = editingCell?.taskId === task.id && editingCell?.columnId === col.id
              const canEdit = !isProject && isEditable(col.id)

              return (
                <div
                  key={col.id}
                  className={`relative px-1 truncate ${col.id === "name" && !isProject ? "pl-3" : ""} ${canEdit ? "cursor-text hover:bg-muted/50" : ""}`}
                  style={{ width: col.width }}
                  title={col.id === "name" ? task.name : undefined}
                  onClick={() => handleCellClick(task, col.id)}
                >
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      type={getInputType(col.id)}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSave}
                      onKeyDown={handleKeyDown}
                      placeholder={col.label}
                      aria-label={col.label}
                      className="w-full h-full bg-background border border-primary rounded px-1 text-xs outline-none"
                      style={{ minWidth: 0 }}
                    />
                  ) : (
                    <span className={canEdit ? "hover:underline" : ""}>
                      {getColumnValue(task, col.id)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// Types are imported from useGanttData hook (GanttProject, GanttTask)

// Configurations
const statusConfig: Record<string, { label: string; color: string; icon: typeof Circle }> = {
  todo: { label: "A faire", color: "#f59e0b", icon: Circle },
  "in-progress": { label: "En cours", color: "#3b82f6", icon: Clock },
  review: { label: "Review", color: "#8b5cf6", icon: Target },
  done: { label: "Termine", color: "#22c55e", icon: CheckCircle2 },
  blocked: { label: "Bloque", color: "#ef4444", icon: AlertTriangle },
}

const priorityConfig: Record<string, { label: string; color: string; dotColor: string }> = {
  low: { label: "Basse", color: "#6b7280", dotColor: "bg-gray-400" },
  medium: { label: "Moyenne", color: "#3b82f6", dotColor: "bg-blue-500" },
  high: { label: "Haute", color: "#f59e0b", dotColor: "bg-amber-500" },
  critical: { label: "Critique", color: "#ef4444", dotColor: "bg-red-500" },
}

const projectColors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]

type GanttViewMode = "day" | "week" | "month" | "quarter"

export function GanttContent() {
  const router = useRouter()

  // Fetch data from API
  const { projects: apiProjects, tasks: apiTasks, isLoading, error, refetch } = useGanttData()

  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<GanttViewMode>("week")
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [columnWidth, setColumnWidth] = useState(60)
  const [rowHeight, setRowHeight] = useState(38)
  const [showMilestones, setShowMilestones] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [showDependencies, setShowDependencies] = useState(true)
  const [showBarText, setShowBarText] = useState(true)
  const [showTodayLine, setShowTodayLine] = useState(true)
  const [showDeliveryLines, setShowDeliveryLines] = useState(false)
  const [showCriticalPath, setShowCriticalPath] = useState(false)
  const [columns, setColumns] = useState<ColumnDef[]>(defaultColumns)
  const [tasks, setTasks] = useState<GanttTask[]>([])

  // Initialize selected projects when data loads
  useEffect(() => {
    if (apiProjects.length > 0 && selectedProjects.length === 0) {
      setSelectedProjects(apiProjects.map((p) => p.id))
    }
  }, [apiProjects, selectedProjects.length])

  // Initialize tasks when data loads
  useEffect(() => {
    if (apiTasks.length > 0) {
      setTasks(apiTasks)
    }
  }, [apiTasks])

  // Use API data or fallback to empty arrays
  const projects = apiProjects.length > 0 ? apiProjects : []

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <Skeleton className="h-10 w-full" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold">Erreur de chargement</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => refetch()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    )
  }

  // Toggle column visibility
  const toggleColumn = useCallback((columnId: ColumnId) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ))
  }, [])

  // Resize column
  const handleColumnResize = useCallback((columnId: ColumnId, newWidth: number) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, width: newWidth } : col
    ))
  }, [])

  // Update task from inline edit
  const handleTaskUpdate = useCallback((taskId: string, field: string, value: any) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, [field]: value } : t
    ))
  }, [])

  // Calculate total width for visible columns
  const listWidth = useMemo(() => {
    return columns.filter(c => c.visible).reduce((sum, col) => sum + col.width, 0) + 20 // +20 for expander
  }, [columns])

  // Helper to calculate task duration in days
  const getDuration = useCallback((startDate: Date, endDate: Date) => {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }, [])

  // Get successors for a task
  const getSuccessors = useCallback((taskId: string) => {
    return tasks.filter(t => t.dependencies?.includes(taskId)).map(t => t.id)
  }, [tasks])
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttContainerRef = useRef<HTMLDivElement>(null)

  const ganttViewMode: ViewMode = useMemo(() => {
    switch (viewMode) {
      case "day": return "Day"
      case "week": return "Week"
      case "month": return "Month"
      case "quarter": return "QuarterYear"
      default: return "Week"
    }
  }, [viewMode])

  // Calculate critical path for each project (needed before building ganttTasks)
  const criticalPathTasks = useMemo(() => {
    if (!showCriticalPath) return new Set<string>()

    const criticalTasks = new Set<string>()

    selectedProjects.forEach((projectId) => {
      const projectTasks = tasks.filter((t) => t.projectId === projectId && !t.isMilestone)
      if (projectTasks.length === 0) return

      // Build dependency graph
      const taskMap = new Map(projectTasks.map((t) => [t.id, t]))

      // Calculate earliest start (ES) and earliest finish (EF)
      const es = new Map<string, number>()
      const ef = new Map<string, number>()

      // Get project start date
      const project = projects.find((p) => p.id === projectId)
      const projectStart = project ? new Date(project.startDate).getTime() : Date.now()

      // Forward pass - calculate ES and EF
      const calculateEarly = (taskId: string): number => {
        if (ef.has(taskId)) return ef.get(taskId)!

        const task = taskMap.get(taskId)
        if (!task) return projectStart

        const deps = task.dependencies || []
        let taskEs = projectStart

        if (deps.length > 0) {
          // ES = max of all predecessors' EF
          deps.forEach((depId) => {
            const depEf = calculateEarly(depId)
            taskEs = Math.max(taskEs, depEf)
          })
        } else {
          taskEs = new Date(task.startDate).getTime()
        }

        es.set(taskId, taskEs)
        const duration = new Date(task.dueDate).getTime() - new Date(task.startDate).getTime()
        const taskEf = taskEs + duration
        ef.set(taskId, taskEf)

        return taskEf
      }

      // Calculate EF for all tasks
      projectTasks.forEach((t) => calculateEarly(t.id))

      // Find project finish time (max EF)
      let projectFinish = projectStart
      projectTasks.forEach((t) => {
        projectFinish = Math.max(projectFinish, ef.get(t.id) || 0)
      })

      // Backward pass - calculate LS and LF
      const ls = new Map<string, number>()
      const lf = new Map<string, number>()

      const calculateLate = (taskId: string): number => {
        if (ls.has(taskId)) return ls.get(taskId)!

        const task = taskMap.get(taskId)
        if (!task) return projectFinish

        // Find successors (tasks that depend on this one)
        const successors = projectTasks.filter((t) => t.dependencies?.includes(taskId))

        let taskLf = projectFinish

        if (successors.length > 0) {
          // LF = min of all successors' LS
          successors.forEach((succ) => {
            const succLs = calculateLate(succ.id)
            taskLf = Math.min(taskLf, succLs)
          })
        }

        lf.set(taskId, taskLf)
        const duration = new Date(task.dueDate).getTime() - new Date(task.startDate).getTime()
        const taskLs = taskLf - duration
        ls.set(taskId, taskLs)

        return taskLs
      }

      // Calculate LS for all tasks
      projectTasks.forEach((t) => calculateLate(t.id))

      // Critical path: tasks where ES = LS (zero slack)
      projectTasks.forEach((t) => {
        const taskEs = es.get(t.id) || 0
        const taskLs = ls.get(t.id) || 0
        const slack = taskLs - taskEs

        // Tasks with zero or near-zero slack are critical
        if (Math.abs(slack) < 86400000) {
          // 1 day tolerance
          criticalTasks.add(t.id)
        }
      })
    })

    return criticalTasks
  }, [showCriticalPath, selectedProjects, tasks])

  // Build gantt tasks with dependencies
  const ganttTasks: Task[] = useMemo(() => {
    const filteredTasks = tasks.filter((task) => {
      if (!showMilestones && task.isMilestone) return false
      const inSelectedProject = selectedProjects.includes(task.projectId)
      const matchesSearch = searchQuery === "" ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.assignee?.toLowerCase().includes(searchQuery.toLowerCase())
      return inSelectedProject && matchesSearch
    })

    const result: Task[] = []

    selectedProjects.forEach((projectId, pIndex) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project) return

      const projectTaskList = filteredTasks.filter((t) => t.projectId === projectId)
      if (projectTaskList.length === 0 && searchQuery !== "") return

      const projectColor = projectColors[pIndex % projectColors.length]
      const isCollapsed = collapsedProjects.has(projectId)

      // Project row
      result.push({
        id: `proj_${projectId}`,
        name: `${project.code} - ${project.name}`,
        start: new Date(project.startDate),
        end: new Date(project.endDate),
        progress: project.progress,
        type: "project",
        hideChildren: isCollapsed,
        styles: {
          backgroundColor: projectColor,
          backgroundSelectedColor: projectColor,
          progressColor: "#ffffff50",
          progressSelectedColor: "#ffffff70",
        },
      })

      // Tasks (hidden if collapsed)
      if (!isCollapsed) {
        projectTaskList.forEach((task) => {
          const statusCfg = statusConfig[task.status] || statusConfig.todo
          const isCritical = criticalPathTasks.has(task.id)

          // Build dependencies array
          const deps = showDependencies && task.dependencies
            ? task.dependencies.filter(depId => filteredTasks.some(t => t.id === depId))
            : []

          if (task.isMilestone) {
            result.push({
              id: task.id,
              name: task.title,
              start: new Date(task.dueDate),
              end: new Date(task.dueDate),
              progress: 0,
              type: "milestone",
              project: `proj_${projectId}`,
              dependencies: deps,
              styles: {
                backgroundColor: "#ef4444",
                backgroundSelectedColor: "#dc2626",
              },
            })
          } else {
            // Critical path tasks get a red color scheme
            const bgColor = isCritical ? "#dc2626" : statusCfg.color
            const bgSelectedColor = isCritical ? "#b91c1c" : statusCfg.color

            result.push({
              id: task.id,
              name: task.title,
              start: new Date(task.startDate),
              end: new Date(task.dueDate),
              progress: task.progress,
              type: "task",
              project: `proj_${projectId}`,
              dependencies: deps,
              isDisabled: false,
              styles: {
                backgroundColor: bgColor,
                backgroundSelectedColor: bgSelectedColor,
                progressColor: isCritical ? "#ffffff60" : "#ffffff40",
                progressSelectedColor: isCritical ? "#ffffff80" : "#ffffff60",
              },
            })
          }
        })
      }
    })

    return result
  }, [selectedProjects, searchQuery, showMilestones, collapsedProjects, showDependencies, tasks, criticalPathTasks])

  // Effect to hide/show bar text labels using DOM manipulation
  useEffect(() => {
    if (!ganttContainerRef.current) return

    // Small delay to ensure SVG is rendered
    const timeoutId = setTimeout(() => {
      const container = ganttContainerRef.current
      if (!container) return

      // Find all SVGs in the gantt (there might be multiple)
      const svgs = container.querySelectorAll('svg')
      svgs.forEach((svg) => {
        // Get all text elements
        const textElements = svg.querySelectorAll('text')
        textElements.forEach((text) => {
          const parent = text.parentElement
          if (!parent) return

          // Check if this text is inside a bar (has sibling rect with fill color, not grid rect)
          const siblingRects = parent.querySelectorAll('rect')
          const hasColoredRect = Array.from(siblingRects).some((rect) => {
            const fill = rect.getAttribute('fill')
            // Colored rects are task bars, not grid lines (which are transparent or have no fill)
            return fill && fill !== 'transparent' && fill !== 'none' && !fill.startsWith('url(')
          })

          // Only hide text that's next to colored rects (bar labels)
          if (hasColoredRect) {
            ;(text as SVGTextElement).style.opacity = showBarText ? '1' : '0'
          }
        })
      })
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [showBarText, ganttTasks])

  // Effect to abbreviate month names based on column width
  useEffect(() => {
    if (!ganttContainerRef.current) return

    const monthMap: Record<string, { short: string; letter: string }> = {
      'Janvier': { short: 'Jan', letter: 'J' },
      'Février': { short: 'Fév', letter: 'F' },
      'Mars': { short: 'Mar', letter: 'M' },
      'Avril': { short: 'Avr', letter: 'A' },
      'Mai': { short: 'Mai', letter: 'M' },
      'Juin': { short: 'Jun', letter: 'J' },
      'Juillet': { short: 'Jul', letter: 'J' },
      'Août': { short: 'Aoû', letter: 'A' },
      'Septembre': { short: 'Sep', letter: 'S' },
      'Octobre': { short: 'Oct', letter: 'O' },
      'Novembre': { short: 'Nov', letter: 'N' },
      'Décembre': { short: 'Déc', letter: 'D' },
    }

    const timeoutId = setTimeout(() => {
      const container = ganttContainerRef.current
      if (!container) return

      const svgs = container.querySelectorAll('svg')
      svgs.forEach((svg) => {
        const textElements = svg.querySelectorAll('text')
        textElements.forEach((text) => {
          const content = text.textContent || ''

          // Check if this is a month header (contains month name and year)
          for (const [fullMonth, abbrevs] of Object.entries(monthMap)) {
            if (content.includes(fullMonth)) {
              // Determine abbreviation based on column width
              let newContent = content
              if (columnWidth < 40) {
                // Very small - use letter only, hide year
                newContent = content.replace(new RegExp(`${fullMonth},? ?\\d{0,4}`), abbrevs.letter)
              } else if (columnWidth < 55) {
                // Small - use short month, keep year
                newContent = content.replace(fullMonth, abbrevs.short)
              }
              // Otherwise keep full name

              if (newContent !== content) {
                text.textContent = newContent
              }
              break
            }
          }
        })
      })
    }, 150)

    return () => clearTimeout(timeoutId)
  }, [columnWidth, ganttTasks, viewMode])

  // Effect to add a visible today indicator line (thin, no background)
  useEffect(() => {
    if (!ganttContainerRef.current) return

    const timeoutId = setTimeout(() => {
      const container = ganttContainerRef.current
      if (!container) return

      // Find the Gantt SVG (the one with tasks, usually the second/main one)
      const svgs = container.querySelectorAll('svg')

      svgs.forEach((svg) => {
        // Remove any existing today line we added
        const existingLine = svg.querySelector('.today-line-indicator')
        if (existingLine) {
          existingLine.remove()
        }

        // Look for the today highlight rect (has the todayColor fill) and hide it
        const todayRect = svg.querySelector('rect[fill="rgba(59, 130, 246, 0.15)"]') as SVGRectElement | null
        if (todayRect) {
          // Always hide the background highlight
          todayRect.style.opacity = '0'

          // Only show the line if enabled
          if (showTodayLine) {
            const x = todayRect.getAttribute('x')
            const y = todayRect.getAttribute('y')
            const height = todayRect.getAttribute('height')
            const width = todayRect.getAttribute('width')

            if (x && height) {
              // Create a thin vertical line at the center of today's column
              const lineX = parseFloat(x) + (parseFloat(width || '0') / 2)
              const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
              line.setAttribute('class', 'today-line-indicator')
              line.setAttribute('x1', lineX.toString())
              line.setAttribute('y1', y || '0')
              line.setAttribute('x2', lineX.toString())
              line.setAttribute('y2', (parseFloat(y || '0') + parseFloat(height)).toString())
              line.setAttribute('stroke', '#ef4444')
              line.setAttribute('stroke-width', '1')
              line.style.pointerEvents = 'none'

              svg.appendChild(line)
            }
          }
        }
      })
    }, 200)

    return () => clearTimeout(timeoutId)
  }, [ganttTasks, viewMode, columnWidth, showTodayLine])

  // Effect to add delivery date line for the selected project (single green dashed line at project end date)
  useEffect(() => {
    if (!ganttContainerRef.current || !showDeliveryLines) return

    const timeoutId = setTimeout(() => {
      const container = ganttContainerRef.current
      if (!container) return

      const svgs = container.querySelectorAll('svg')
      svgs.forEach((svg) => {
        // Remove any existing delivery lines
        const existingLines = svg.querySelectorAll('.delivery-line-indicator')
        existingLines.forEach((line) => line.remove())

        if (!showDeliveryLines) return

        // Find project rows and their end positions - only draw ONE line per project
        const drawnProjects = new Set<string>()
        const allRects = svg.querySelectorAll('rect')
        const svgHeight = svg.getAttribute('height')

        // Collect project bar positions
        const projectBars: { projectId: string; endX: number }[] = []

        allRects.forEach((rect) => {
          const fill = rect.getAttribute('fill')
          const width = parseFloat(rect.getAttribute('width') || '0')
          const x = parseFloat(rect.getAttribute('x') || '0')
          const y = parseFloat(rect.getAttribute('y') || '0')
          const height = parseFloat(rect.getAttribute('height') || '0')

          // Skip very small or invalid rects
          if (width < 20 || height < 8 || !fill || fill === 'transparent' || fill === 'none' || fill.startsWith('url(')) {
            return
          }

          // Check if this is a project bar by color
          const projectColorIndex = projectColors.findIndex((c) => fill.toLowerCase() === c.toLowerCase())

          if (projectColorIndex !== -1) {
            // Get project ID from the index
            const projectId = selectedProjects[projectColorIndex]
            if (projectId && !drawnProjects.has(projectId)) {
              drawnProjects.add(projectId)
              projectBars.push({ projectId, endX: x + width })
            }
          }
        })

        // Draw only ONE line at the rightmost project end date (the overall delivery date)
        if (projectBars.length > 0) {
          // If only one project selected, use its end date
          // If multiple projects, use the latest end date
          const maxEndX = Math.max(...projectBars.map(p => p.endX))

          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          line.setAttribute('class', 'delivery-line-indicator')
          line.setAttribute('x1', maxEndX.toString())
          line.setAttribute('y1', '0')
          line.setAttribute('x2', maxEndX.toString())
          line.setAttribute('y2', svgHeight || '500')
          line.setAttribute('stroke', '#22c55e')
          line.setAttribute('stroke-width', '2')
          line.setAttribute('stroke-dasharray', '6,3')
          line.style.pointerEvents = 'none'

          svg.appendChild(line)
        }
      })
    }, 250)

    return () => clearTimeout(timeoutId)
  }, [ganttTasks, viewMode, columnWidth, showDeliveryLines, selectedProjects])

  // Stats
  const stats = useMemo(() => {
    const filtered = tasks.filter((t) => selectedProjects.includes(t.projectId) && !t.isMilestone)
    const total = filtered.length
    const done = filtered.filter((t) => t.status === "done").length
    const inProgress = filtered.filter((t) => t.status === "in-progress").length
    const todo = filtered.filter((t) => t.status === "todo").length
    const overdue = filtered.filter((t) => t.status !== "done" && new Date(t.dueDate) < new Date()).length
    const avgProgress = total > 0 ? Math.round(filtered.reduce((sum, t) => sum + t.progress, 0) / total) : 0

    return { total, done, inProgress, todo, overdue, avgProgress }
  }, [selectedProjects, tasks])

  // Selected task details
  const selectedTaskDetails = useMemo(() => {
    if (!selectedTask) return null

    // Check if it's a project
    if (selectedTask.id.startsWith("proj_")) {
      const projectId = selectedTask.id.replace("proj_", "")
      const project = projects.find((p) => p.id === projectId)
      if (project) {
        return { type: "project" as const, data: project }
      }
    }

    // It's a task
    const task = tasks.find((t) => t.id === selectedTask.id)
    if (!task) return null
    const project = projects.find((p) => p.id === task.projectId)
    return { type: "task" as const, data: { ...task, project } }
  }, [selectedTask, tasks])

  // Track if we're currently dragging/resizing - use mousedown detection
  const isDraggingRef = useRef(false)
  const mouseDownTimeRef = useRef<number>(0)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Effect to track mousedown/mouseup for drag detection
  useEffect(() => {
    const container = ganttContainerRef.current
    if (!container) return

    const handleMouseDown = () => {
      mouseDownTimeRef.current = Date.now()
      isDraggingRef.current = false
    }

    const handleMouseMove = () => {
      // If mouse has been down for more than 100ms and moving, it's a drag
      if (mouseDownTimeRef.current > 0 && Date.now() - mouseDownTimeRef.current > 100) {
        isDraggingRef.current = true
      }
    }

    const handleMouseUp = () => {
      // Reset after a delay to allow click handlers to check the flag
      setTimeout(() => {
        mouseDownTimeRef.current = 0
        isDraggingRef.current = false
      }, 150)
    }

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseup', handleMouseUp)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Handlers
  const handleExpanderClick = useCallback((task: Task) => {
    if (task.type === "project") {
      const projectId = task.id.replace("proj_", "")
      setCollapsedProjects((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(projectId)) {
          newSet.delete(projectId)
        } else {
          newSet.add(projectId)
        }
        return newSet
      })
    }
  }, [])

  // onSelect is called on every click - we use delayed opening to avoid conflicts with resize
  const handleTaskSelect = useCallback((task: Task, isSelected: boolean) => {
    if (!isSelected) return

    // If already dragging, don't do anything
    if (isDraggingRef.current) return

    // Clear any pending timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
    }

    // Set a delay to check if this is a resize operation
    clickTimeoutRef.current = setTimeout(() => {
      // Check again after delay - if dragging started, don't open sheet
      if (!isDraggingRef.current && mouseDownTimeRef.current === 0) {
        setSelectedTask(task)
        setSheetOpen(true)
      }
    }, 300) // 300ms delay to differentiate click from drag start
  }, [])

  const handleDoubleClick = useCallback((task: Task) => {
    // Clear any pending single-click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }

    // Close sheet if open and navigate
    setSheetOpen(false)

    if (task.type === "project") {
      const projectId = task.id.replace("proj_", "")
      router.push(`/projects/${projectId}`)
    } else {
      router.push(`/projects/tasks/${task.id}`)
    }
  }, [router])

  const handleDateChange = useCallback((task: Task) => {
    // Mark that we were dragging - prevents sheet from opening
    isDraggingRef.current = true

    // Clear any pending click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }

    // Update task dates when resized/moved
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, startDate: task.start, dueDate: task.end }
          : t
      )
    )

    // Reset dragging flag after a short delay
    setTimeout(() => {
      isDraggingRef.current = false
    }, 100)

    return true
  }, [])

  const handleProgressChange = useCallback((task: Task) => {
    // Mark that we were dragging
    isDraggingRef.current = true

    // Clear any pending click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }

    // Update task progress when changed
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, progress: task.progress } : t
      )
    )

    // Reset dragging flag after a short delay
    setTimeout(() => {
      isDraggingRef.current = false
    }, 100)

    return true
  }, [])

  const toggleProject = (projectId: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    )
  }

  // Horizontal zoom (column width)
  const handleZoomIn = () => setColumnWidth((prev) => Math.min(prev + 15, 120))
  const handleZoomOut = () => setColumnWidth((prev) => Math.max(prev - 15, 30))
  const handleZoomReset = () => { setColumnWidth(60); setRowHeight(38) }

  // Vertical zoom (row height)
  const handleRowIncrease = () => setRowHeight((prev) => Math.min(prev + 6, 56))
  const handleRowDecrease = () => setRowHeight((prev) => Math.max(prev - 6, 20))

  const navigateToDetail = () => {
    if (!selectedTaskDetails) return
    if (selectedTaskDetails.type === "project") {
      router.push(`/projects/${selectedTaskDetails.data.id}`)
    } else {
      router.push(`/projects/tasks/${selectedTaskDetails.data.id}`)
    }
    setSheetOpen(false)
  }

  return (
    <div className={`flex h-full flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-background" : ""}`} ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold">Planning Gantt</h1>
            <p className="text-xs text-muted-foreground">{stats.total} taches sur {selectedProjects.length} projets</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <FileDown className="h-3.5 w-3.5" />
                Exporter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs"><FileDown className="h-3.5 w-3.5 mr-2" />Export PDF</DropdownMenuItem>
              <DropdownMenuItem className="text-xs"><FileDown className="h-3.5 w-3.5 mr-2" />Export Excel</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs"><Printer className="h-3.5 w-3.5 mr-2" />Imprimer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Nouvelle tache
          </Button>
        </div>
      </div>

      {/* Toolbar - Cleaned up */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/20">
        {/* Search */}
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>

        {/* Projects filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Projets</span>
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{selectedProjects.length}</Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-xs flex items-center justify-between">
              Projets
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setSelectedProjects(projects.map(p => p.id))}>
                Tous
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {projects.map((project, idx) => (
              <DropdownMenuCheckboxItem
                key={project.id}
                checked={selectedProjects.includes(project.id)}
                onCheckedChange={() => toggleProject(project.id)}
                className="text-xs"
              >
                <div className="flex items-center gap-2 w-full">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: projectColors[idx % projectColors.length] }} />
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{project.code}</span>
                  <span className="truncate flex-1">{project.name}</span>
                </div>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        {/* Time scale */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as GanttViewMode)} className="h-8">
          <TabsList className="h-8 p-0.5">
            <TabsTrigger value="day" className="h-7 text-xs px-2.5">J</TabsTrigger>
            <TabsTrigger value="week" className="h-7 text-xs px-2.5">S</TabsTrigger>
            <TabsTrigger value="month" className="h-7 text-xs px-2.5">M</TabsTrigger>
            <TabsTrigger value="quarter" className="h-7 text-xs px-2.5">T</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Zoom controls - Horizontal & Vertical grouped */}
        <TooltipProvider delayDuration={0}>
          <div className="flex items-center gap-1 border rounded-md bg-background p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomOut}>
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Zoom horizontal -</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomIn}>
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Zoom horizontal +</p></TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="h-4 mx-0.5" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRowDecrease}>
                  <Rows3 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Lignes compactes</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRowIncrease}>
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Lignes larges</p></TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="h-4 mx-0.5" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomReset}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Reset zoom</p></TooltipContent>
            </Tooltip>
          </div>

          {/* Display toggles */}
          <div className="flex items-center gap-0.5 border rounded-md bg-background p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={showMilestones ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setShowMilestones(!showMilestones)}>
                  <Target className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Jalons</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={showDependencies ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setShowDependencies(!showDependencies)}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Dependances</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={showBarText ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setShowBarText(!showBarText)}>
                  <Type className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Texte</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={showTodayLine ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setShowTodayLine(!showTodayLine)}>
                  <CalendarCheck className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Ligne aujourd'hui</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={showDeliveryLines ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setShowDeliveryLines(!showDeliveryLines)}>
                  <CalendarDays className="h-3.5 w-3.5 text-green-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Dates de livraison</p></TooltipContent>
            </Tooltip>
          </div>

          {/* Critical path button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showCriticalPath ? "default" : "outline"}
                size="sm"
                className={`h-8 gap-1.5 text-xs ${showCriticalPath ? 'bg-red-500 hover:bg-red-600' : ''}`}
                onClick={() => setShowCriticalPath(!showCriticalPath)}
              >
                <Route className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Chemin critique</span>
                {showCriticalPath && criticalPathTasks.size > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] bg-white/20">{criticalPathTasks.size}</Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">Calculer et afficher le chemin critique</p></TooltipContent>
          </Tooltip>

          {/* Column config */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <Columns className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Colonnes</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.visible}
                  onCheckedChange={() => toggleColumn(col.id)}
                  disabled={col.id === "name"}
                  className="text-xs"
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>

        {/* Fullscreen - pushed right */}
        <div className="flex items-center gap-1 ml-auto">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsFullscreen(!isFullscreen)}>
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">{isFullscreen ? "Quitter" : "Plein ecran"}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Stats bar - Simplified */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b text-[11px] bg-muted/10">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Taches:</span>
          <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            {stats.done}
          </Badge>
          <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            {stats.inProgress}
          </Badge>
          <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {stats.todo}
          </Badge>
          {stats.overdue > 0 && (
            <Badge variant="destructive" className="h-5 gap-1 text-[10px] font-normal">
              <AlertTriangle className="h-2.5 w-2.5" />
              {stats.overdue}
            </Badge>
          )}
        </div>

        <Separator orientation="vertical" className="h-3" />

        <div className="flex items-center gap-1.5">
          <Progress value={stats.avgProgress} className="w-16 h-1.5" />
          <span className="font-medium">{stats.avgProgress}%</span>
        </div>

        <span className="text-muted-foreground/60 ml-auto hidden md:inline">
          Double-clic: ouvrir | Clic cellule: editer | Glisser: redimensionner
        </span>
      </div>

      {/* Gantt */}
      <div className="flex-1 overflow-hidden">
        {ganttTasks.length > 0 ? (
          <div ref={ganttContainerRef} className={`h-full overflow-auto gantt-container ${!showBarText ? "hide-bar-text" : ""}`}>
            <Gantt
              tasks={ganttTasks}
              viewMode={ganttViewMode}
              columnWidth={columnWidth}
              listCellWidth={`${listWidth}px`}
              rowHeight={rowHeight}
              barCornerRadius={4}
              barFill={65}
              handleWidth={10}
              todayColor="rgba(59, 130, 246, 0.15)"
              arrowColor="#94a3b8"
              arrowIndent={20}
              locale="fr"
              TaskListHeader={({ headerHeight, rowWidth }) => (
                <CustomTaskListHeader
                  headerHeight={headerHeight}
                  rowWidth={rowWidth}
                  columns={columns}
                  onColumnResize={handleColumnResize}
                />
              )}
              TaskListTable={({ rowHeight, rowWidth, tasks: ganttTaskList }) => (
                <CustomTaskListTable
                  rowHeight={rowHeight}
                  rowWidth={rowWidth}
                  tasks={ganttTaskList}
                  columns={columns}
                  allTasks={tasks}
                  onExpanderClick={handleExpanderClick}
                  getDuration={getDuration}
                  getSuccessors={getSuccessors}
                  onTaskUpdate={handleTaskUpdate}
                />
              )}
              onSelect={handleTaskSelect}
              onExpanderClick={handleExpanderClick}
              onDoubleClick={handleDoubleClick}
              onDateChange={handleDateChange}
              onProgressChange={handleProgressChange}
              TooltipContent={({ task }) => {
                const taskData = tasks.find((t) => t.id === task.id)
                const projectData = projects.find((p) => `proj_${p.id}` === task.id)

                if (projectData) {
                  const isCollapsed = collapsedProjects.has(projectData.id)
                  const taskCount = tasks.filter(t => t.projectId === projectData.id && !t.isMilestone).length
                  return (
                    <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border text-xs w-72">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm">{projectData.name}</div>
                        <Badge variant="outline" className="text-[9px]">{projectData.code}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className="text-[9px]">{taskCount} taches</Badge>
                        {isCollapsed && <Badge variant="secondary" className="text-[9px]">Replie</Badge>}
                      </div>
                      <Separator className="my-2" />
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="text-muted-foreground">Debut</div>
                          <div className="font-medium">{projectData.startDate.toLocaleDateString("fr-FR")}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Fin</div>
                          <div className="font-medium">{projectData.endDate.toLocaleDateString("fr-FR")}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Progression</div>
                          <div className="font-medium">{projectData.progress}%</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Manager</div>
                          <div className="font-medium">{projectData.manager}</div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                        Double-clic pour ouvrir la fiche projet
                      </div>
                    </div>
                  )
                }

                if (taskData) {
                  const statusCfg = statusConfig[taskData.status]
                  const priorityCfg = priorityConfig[taskData.priority]
                  const hasDeps = taskData.dependencies && taskData.dependencies.length > 0
                  return (
                    <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border text-xs w-72">
                      <div className="font-semibold text-sm">{taskData.title}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className="text-[9px] h-5" style={{ backgroundColor: statusCfg?.color + "20", color: statusCfg?.color }}>
                          {statusCfg?.label}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] h-5">
                          <div className={`h-1.5 w-1.5 rounded-full mr-1 ${priorityCfg?.dotColor}`} />
                          {priorityCfg?.label}
                        </Badge>
                        {hasDeps && (
                          <Badge variant="secondary" className="text-[9px] h-5">
                            <Link2 className="h-2.5 w-2.5 mr-1" />
                            {taskData.dependencies?.length} dep.
                          </Badge>
                        )}
                      </div>
                      <Separator className="my-2" />
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Debut</span>
                          <span className="font-medium">{taskData.startDate.toLocaleDateString("fr-FR")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Echeance</span>
                          <span className="font-medium">{taskData.dueDate.toLocaleDateString("fr-FR")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Assigne</span>
                          <span className="font-medium">{taskData.assignee}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Progression</span>
                          <div className="flex items-center gap-2">
                            <Progress value={taskData.progress} className="w-16 h-1.5" />
                            <span className="font-medium w-8 text-right">{taskData.progress}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                        Double-clic pour ouvrir | Glisser les bords pour redimensionner
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <CalendarDays className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium">Aucune tache a afficher</h3>
              <p className="text-xs text-muted-foreground mt-1">Selectionnez des projets ou modifiez votre recherche</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setSelectedProjects(projects.map(p => p.id))}>
                Afficher tous les projets
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[420px] sm:w-[480px]">
          {selectedTaskDetails?.type === "project" && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono">{selectedTaskDetails.data.code}</Badge>
                  <Badge className="text-xs">{selectedTaskDetails.data.status}</Badge>
                </div>
                <SheetTitle className="text-left mt-2">{selectedTaskDetails.data.name}</SheetTitle>
                <SheetDescription className="text-left">
                  Gere par {selectedTaskDetails.data.manager}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Progression</label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <Progress value={selectedTaskDetails.data.progress} className="flex-1 h-2" />
                    <span className="text-sm font-semibold w-12 text-right">{selectedTaskDetails.data.progress}%</span>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Date debut</label>
                    <p className="text-sm font-medium mt-1">{selectedTaskDetails.data.startDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Date fin</label>
                    <p className="text-sm font-medium mt-1">{selectedTaskDetails.data.endDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Budget</label>
                    <p className="text-sm font-medium mt-1">{selectedTaskDetails.data.budget?.toLocaleString("fr-FR")} EUR</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Equipe</label>
                    <div className="flex -space-x-2 mt-1.5">
                      {selectedTaskDetails.data.team.map((member, i) => (
                        <Avatar key={i} className="h-6 w-6 border-2 border-background">
                          <AvatarFallback className="text-[9px]">{member}</AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button className="flex-1" size="sm" onClick={navigateToDetail}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Ouvrir le projet
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)}>Fermer</Button>
                </div>
              </div>
            </>
          )}

          {selectedTaskDetails?.type === "task" && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <Badge
                    className="text-xs"
                    style={{
                      backgroundColor: statusConfig[selectedTaskDetails.data.status]?.color + "20",
                      color: statusConfig[selectedTaskDetails.data.status]?.color,
                    }}
                  >
                    {statusConfig[selectedTaskDetails.data.status]?.label}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <div className={`h-1.5 w-1.5 rounded-full mr-1.5 ${priorityConfig[selectedTaskDetails.data.priority]?.dotColor}`} />
                    {priorityConfig[selectedTaskDetails.data.priority]?.label}
                  </Badge>
                </div>
                <SheetTitle className="text-left mt-2">{selectedTaskDetails.data.title}</SheetTitle>
                <SheetDescription className="text-left">
                  {selectedTaskDetails.data.project?.name}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Progression</label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <Progress value={selectedTaskDetails.data.progress} className="flex-1 h-2" />
                    <span className="text-sm font-semibold w-12 text-right">{selectedTaskDetails.data.progress}%</span>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Date debut</label>
                    <p className="text-sm font-medium mt-1">{selectedTaskDetails.data.startDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Echeance</label>
                    <p className="text-sm font-medium mt-1">{selectedTaskDetails.data.dueDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Assigne a</label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">
                        {selectedTaskDetails.data.assignee?.split(" ").map((n: string) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{selectedTaskDetails.data.assignee}</span>
                  </div>
                </div>

                {selectedTaskDetails.data.dependencies && selectedTaskDetails.data.dependencies.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wide">Predecesseurs</label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {selectedTaskDetails.data.dependencies.map((depId: string) => {
                        const depTask = tasks.find(t => t.id === depId)
                        return depTask ? (
                          <Badge key={depId} variant="secondary" className="text-xs">
                            <Link2 className="h-2.5 w-2.5 mr-1" />
                            {depTask.title}
                          </Badge>
                        ) : null
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Projet</label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="outline" className="text-xs font-mono">{selectedTaskDetails.data.project?.code}</Badge>
                    <span className="text-sm">{selectedTaskDetails.data.project?.name}</span>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button className="flex-1" size="sm" onClick={navigateToDetail}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Ouvrir la tache
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => router.push(`/projects/${selectedTaskDetails.data.project?.id}`)}>
                    Voir projet
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <style jsx global>{`
        .gantt-container {
          font-family: inherit;
        }
        .gantt-container text {
          fill: hsl(var(--foreground));
        }
        /* Calendar header - prevent text overflow */
        .gantt-container svg > g > g text {
          font-size: 10px;
        }
        /* Upper header (months/quarters) - clip overflow */
        .gantt-container svg > g > g:first-child text {
          font-size: 11px;
          font-weight: 500;
        }
        /* Lower header (weeks/days) */
        .gantt-container svg > g > g:nth-child(2) text {
          font-size: 9px;
          fill: hsl(var(--muted-foreground));
        }
        /* Grid lines */
        .gantt-container ._3zRJQ, .gantt-container ._WuQ0f {
          stroke: hsl(var(--border));
        }
        /* Header background */
        .gantt-container ._3T42e, .gantt-container ._nI1Xw {
          fill: hsl(var(--muted));
        }
        /* Calendar cell background */
        .gantt-container ._3lLk3 {
          fill: hsl(var(--card));
        }
        /* Task list header text */
        .gantt-container ._34SS0 {
          font-size: 11px;
          font-weight: 500;
        }
        /* Task list row text */
        .gantt-container ._9w8d5 {
          font-size: 10px;
        }
        /* Arrows/Dependencies styling */
        .gantt-container path[fill="none"] {
          stroke: #94a3b8;
          stroke-width: 1.5;
        }
        /* Expander icon styling */
        .gantt-container ._2TfEi {
          cursor: pointer;
        }
        /* Handle resize styling */
        .gantt-container ._31ERP {
          cursor: ew-resize;
        }
        /* Progress handle styling */
        .gantt-container [class*="barProgress"],
        .gantt-container [class*="BarProgress"] {
          cursor: ew-resize !important;
        }
        /* Progress handle indicator */
        .gantt-container rect[rx="1"][ry="1"] {
          cursor: ew-resize;
        }
        /* Row hover effect */
        .gantt-container ._9w8d5:hover {
          fill: hsl(var(--muted));
        }
        /* Today line indicator (added via JS) - thin red line */
        .gantt-container .today-line-indicator {
          stroke: #ef4444;
          stroke-width: 1px;
        }
        /* Delivery date line (added via JS) - green dashed line */
        .gantt-container .delivery-line-indicator {
          stroke: #22c55e;
          stroke-width: 1px;
          stroke-dasharray: 4, 2;
        }
        /* Clip path for header to prevent overflow */
        .gantt-container > div > svg {
          overflow: hidden;
        }
        /* Auto scrollbars - appear only when needed */
        .gantt-container {
          overflow: auto !important;
          scrollbar-gutter: stable;
        }
        .gantt-container::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .gantt-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .gantt-container::-webkit-scrollbar-thumb {
          background: hsl(var(--border));
          border-radius: 3px;
        }
        .gantt-container::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground));
        }
        /* Firefox scrollbar */
        .gantt-container {
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--border)) transparent;
        }
      `}</style>
    </div>
  )
}
