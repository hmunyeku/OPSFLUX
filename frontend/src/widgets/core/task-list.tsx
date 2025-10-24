"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { IconCircleCheck, IconCircle } from "@tabler/icons-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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
  }
}

export default function TaskList({ config }: TaskListProps) {
  const {
    title = "Tâches",
    tasks = [],
    maxItems = 8,
    showPriority = true,
  } = config

  const displayTasks = tasks.slice(0, maxItems)
  const completedCount = tasks.filter((t) => t.completed).length

  const getPriorityClasses = (priority?: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-900"
      case "medium":
        return "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-900"
      case "low":
        return "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-900"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  const getPriorityLabel = (priority?: string) => {
    switch (priority) {
      case "high":
        return "!"
      case "medium":
        return "•"
      case "low":
        return "·"
      default:
        return ""
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Progress Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b bg-gradient-to-r from-muted/5 to-transparent">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-2xl sm:text-3xl font-bold tabular-nums">{completedCount}</span>
          <span className="text-sm text-muted-foreground">sur {tasks.length}</span>
        </div>
        <div className="h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500 rounded-full"
            style={{ width: `${tasks.length ? (completedCount / tasks.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-hidden">
        {displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 sm:px-6 gap-2">
            <IconCircleCheck className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Aucune tâche</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-3 sm:px-5 py-2 sm:py-3 space-y-1.5 sm:space-y-2">
              {displayTasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "group flex items-start gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-lg transition-colors",
                    task.completed ? "bg-muted/30" : "hover:bg-muted/50"
                  )}
                >
                  {task.completed ? (
                    <IconCircleCheck className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <IconCircle className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "text-xs sm:text-sm leading-relaxed",
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
                          "flex-shrink-0 text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded border",
                          getPriorityClasses(task.priority)
                        )}
                      >
                        {getPriorityLabel(task.priority)}
                      </span>
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
