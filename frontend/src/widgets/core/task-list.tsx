"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { IconChecklist } from "@tabler/icons-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

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

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high":
        return "destructive"
      case "medium":
        return "default"
      case "low":
        return "secondary"
      default:
        return "outline"
    }
  }

  const getPriorityLabel = (priority?: string) => {
    switch (priority) {
      case "high":
        return "Haute"
      case "medium":
        return "Moyenne"
      case "low":
        return "Basse"
      default:
        return ""
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {completedCount}/{tasks.length}
          </span>
          <IconChecklist className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        {displayTasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-6">
            Aucune tâche
          </div>
        ) : (
          <ScrollArea className="h-full px-6 pb-4">
            <div className="space-y-3">
              {displayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 py-1"
                >
                  <Checkbox checked={task.completed} disabled />
                  <div className="flex-1 flex items-center justify-between gap-2">
                    <span
                      className={`text-sm ${
                        task.completed
                          ? "line-through text-muted-foreground"
                          : ""
                      }`}
                    >
                      {task.title}
                    </span>
                    {showPriority && task.priority && (
                      <Badge
                        variant={getPriorityColor(task.priority)}
                        className="text-xs"
                      >
                        {getPriorityLabel(task.priority)}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
