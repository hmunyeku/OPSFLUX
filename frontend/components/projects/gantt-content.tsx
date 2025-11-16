"use client"

import { useState, useEffect, useRef } from "react"
import { mockProjects, mockTasks } from "@/lib/projects-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Search, Filter, Download, Plus } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

type ViewMode = "day" | "week" | "month" | "quarter"

export function GanttContent() {
  const [selectedProjects, setSelectedProjects] = useState<string[]>(mockProjects.map((p) => p.id))
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("week")
  const [isLoading, setIsLoading] = useState(true)
  const [ganttLoaded, setGanttLoaded] = useState(false)
  const ganttRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const loadCSS = () => {
      if (!document.querySelector('link[href*="jsgantt"]')) {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = "https://cdn.jsdelivr.net/npm/jsgantt-improved@2.8.10/dist/jsgantt.css"
        document.head.appendChild(link)
      }
    }

    const loadJSGantt = async () => {
      try {
        console.log("[v0] Loading jsGantt CSS from CDN...")
        loadCSS()

        console.log("[v0] Loading jsGantt from package...")
        // Import the library dynamically
        const jsGanttModule = await import("jsgantt-improved")
        console.log("[v0] jsGantt module loaded:", jsGanttModule)

        // The library might export JSGantt in different ways
        if (jsGanttModule.JSGantt) {
          ;(window as any).JSGantt = jsGanttModule.JSGantt
          console.log("[v0] JSGantt attached to window from module.JSGantt")
        } else if (jsGanttModule.default) {
          ;(window as any).JSGantt = jsGanttModule.default
          console.log("[v0] JSGantt attached to window from module.default")
        } else {
          // Try to use the module itself
          ;(window as any).JSGantt = jsGanttModule
          console.log("[v0] JSGantt attached to window from module itself")
        }

        console.log("[v0] window.JSGantt after assignment:", (window as any).JSGantt)
        setGanttLoaded(true)
      } catch (error) {
        console.error("[v0] Error loading jsGantt:", error)
        setIsLoading(false)
      }
    }

    loadJSGantt()
  }, [])

  useEffect(() => {
    if (!ganttLoaded || !ganttRef.current) return

    const JSGantt = (window as any).JSGantt
    if (!JSGantt || !JSGantt.GanttChart) {
      console.error("[v0] JSGantt.GanttChart not available")
      setIsLoading(false)
      return
    }

    try {
      console.log("[v0] Creating Gantt chart instance...")

      // Clear previous chart
      if (ganttRef.current) {
        ganttRef.current.innerHTML = ""
      }

      // Create Gantt chart instance
      const g = new JSGantt.GanttChart(ganttRef.current, viewMode)
      console.log("[v0] Gantt chart instance created")

      // Configure chart
      g.setShowRes(1)
      g.setShowDur(1)
      g.setShowComp(1)
      g.setShowStartDate(1)
      g.setShowEndDate(1)
      g.setDateInputFormat("yyyy-mm-dd")
      g.setDateDisplayFormat("dd/mm/yyyy")
      g.setFormatArr("day", "week", "month", "quarter")

      // Add tasks
      const filteredTasks = mockTasks.filter((task) => selectedProjects.includes(task.projectId))

      filteredTasks.forEach((task, index) => {
        const startDate = new Date(task.createdAt)
        const endDate = new Date(task.dueDate)

        g.AddTaskItem(
          new JSGantt.TaskItem(
            index + 1,
            task.title,
            startDate.toISOString().split("T")[0],
            endDate.toISOString().split("T")[0],
            task.status === "done" ? "gtaskgreen" : task.status === "in-progress" ? "gtaskblue" : "gtaskyellow",
            "",
            0,
            task.assignees.join(", "),
            task.progress,
            0,
            0,
            1,
            "",
            "",
            "",
            task.projectId,
          ),
        )
      })

      // Draw the chart
      g.Draw()
      chartInstanceRef.current = g
      console.log("[v0] Gantt chart drawn successfully")
      setIsLoading(false)
    } catch (error) {
      console.error("[v0] Error creating Gantt chart:", error)
      setIsLoading(false)
    }
  }, [ganttLoaded, selectedProjects, viewMode])

  const toggleProject = (projectId: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    )
  }

  const handleExport = () => {
    if (chartInstanceRef.current) {
      // jsGantt has built-in export functionality
      alert("Export functionality - use jsGantt's built-in export methods")
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher tâches..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-transparent">
              <Filter className="h-3 w-3" />
              Projets ({selectedProjects.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs">Sélectionner les projets</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {mockProjects.map((project) => (
              <DropdownMenuCheckboxItem
                key={project.id}
                checked={selectedProjects.includes(project.id)}
                onCheckedChange={() => toggleProject(project.id)}
                className="text-xs"
              >
                {project.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day" className="text-xs">
              Jour
            </SelectItem>
            <SelectItem value="week" className="text-xs">
              Semaine
            </SelectItem>
            <SelectItem value="month" className="text-xs">
              Mois
            </SelectItem>
            <SelectItem value="quarter" className="text-xs">
              Trimestre
            </SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-transparent" onClick={handleExport}>
          <Download className="h-3 w-3" />
          Exporter
        </Button>

        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3 w-3" />
          Nouvelle tâche
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground leading-none">Projets sélectionnés</div>
          <div className="text-base font-bold mt-0.5">{selectedProjects.length}</div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground leading-none">Tâches totales</div>
          <div className="text-base font-bold mt-0.5">
            {mockTasks.filter((t) => selectedProjects.includes(t.projectId)).length}
          </div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground leading-none">En cours</div>
          <div className="text-base font-bold mt-0.5">
            {mockTasks.filter((t) => selectedProjects.includes(t.projectId) && t.status === "in-progress").length}
          </div>
        </Card>
        <Card className="p-2">
          <div className="text-[10px] text-muted-foreground leading-none">Terminées</div>
          <div className="text-base font-bold mt-0.5">
            {mockTasks.filter((t) => selectedProjects.includes(t.projectId) && t.status === "done").length}
          </div>
        </Card>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border bg-background">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-sm text-muted-foreground">Chargement du diagramme de Gantt...</div>
          </div>
        ) : (
          <div ref={ganttRef} className="h-full w-full overflow-auto" />
        )}
      </div>
    </div>
  )
}
