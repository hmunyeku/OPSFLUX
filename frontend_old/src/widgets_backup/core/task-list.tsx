"use client"

import { useState, useEffect, useRef } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { IconCircleCheck, IconRefresh } from "@tabler/icons-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { auth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "/api/v1"

interface TaskItem {
  id: string
  title: string
  completed: boolean
  priority?: "low" | "medium" | "high"
}

interface TaskListProps {
  config: {
    title?: string
    tasks?: TaskItem[]
    maxItems?: number
    showPriority?: boolean
    apiEndpoint?: string
    refreshInterval?: number
  }
}

export default function TaskList({ config }: TaskListProps) {
  const {
    title = "Tâches",
    tasks: configTasks = [],
    maxItems = 8,
    showPriority = true,
    apiEndpoint,
    refreshInterval = 0,
  } = config

  const [tasks, setTasks] = useState<TaskItem[]>(configTasks)
  const [isLoading, setIsLoading] = useState(false)
  const isFirstRender = useRef(true)

  const fetchTasks = async () => {
    if (!apiEndpoint) {
      setTasks(configTasks)
      return
    }

    setIsLoading(true)
    try {
      const token = auth.getToken()
      if (!token) throw new Error("Non authentifié")

      const url = apiEndpoint.startsWith("http") ? apiEndpoint : `${API_BASE_URL}${apiEndpoint}`
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) throw new Error(`Erreur ${response.status}`)

      const data = await response.json()
      setTasks(data.data || data || configTasks)
    } catch (err: any) {
      console.error("Task List Error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      fetchTasks()
    }
    if (refreshInterval > 0) {
      const interval = setInterval(fetchTasks, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval])

  const displayTasks = tasks.slice(0, maxItems)
  const completedCount = tasks.filter((t) => t.completed).length

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high": return "text-red-500"
      case "medium": return "text-amber-500"
      case "low": return "text-blue-500"
      default: return "text-muted-foreground"
    }
  }

  return (
    <div className="h-full flex flex-col p-3">
      {/* Progress bar et bouton refresh */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground tabular-nums">{completedCount}/{tasks.length}</span>
          {apiEndpoint && !isLoading && (
            <Button variant="ghost" size="sm" onClick={fetchTasks} className="h-6 w-6 p-0">
              <IconRefresh className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all duration-500"
            style={{ width: `${tasks.length ? (completedCount / tasks.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Compact Task List */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="space-y-2 p-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2">
            <IconCircleCheck className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Aucune tâche</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-1">
              {displayTasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-2 p-1.5 rounded transition-colors",
                    task.completed ? "bg-muted/30" : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={task.completed}
                    className="mt-0.5 h-3.5 w-3.5"
                    disabled
                  />
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "text-[11px] leading-relaxed",
                        task.completed
                          ? "line-through text-muted-foreground"
                          : "text-foreground"
                      )}
                    >
                      {task.title}
                    </span>
                    {showPriority && task.priority && (
                      <span
                        className={cn(
                          "shrink-0 h-1.5 w-1.5 rounded-full mt-1.5",
                          getPriorityColor(task.priority)
                        )}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
