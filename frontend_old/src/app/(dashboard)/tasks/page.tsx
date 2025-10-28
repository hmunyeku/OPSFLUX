"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslation } from "@/hooks/use-translation"
import { columns } from "./components/tasks-columns"
import { TasksPrimaryActions } from "./components/tasks-primary-actions"
import { TasksTable } from "./components/tasks-table"
import { Task, taskListSchema } from "./data/schema"
import { getTasks } from "./data/tasks-api"

export default function TasksPage() {
  const { t } = useTranslation("core.tasks")
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setIsLoading(true)
        const data = await getTasks()
        const taskList = taskListSchema.parse(data)
        setTasks(taskList)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load tasks:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadTasks()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }

  return (
    <>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("page.title", "Titre")}</h2>
          <p className="text-muted-foreground">
            {t("page.description", "Description")}
          </p>
        </div>
        <TasksPrimaryActions />
      </div>
      <div className="flex-1">
        <TasksTable data={tasks} columns={columns} />
      </div>
    </>
  )
}
