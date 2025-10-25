"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CronEditor } from "./cron-editor"
import { ScheduledTask, ScheduledTaskCreate, ScheduledTaskUpdate } from "@/api/scheduled-tasks"
import { useToast } from "@/hooks/use-toast"

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: ScheduledTask | null
  onSave: (data: ScheduledTaskCreate | ScheduledTaskUpdate) => Promise<void>
}

export function TaskDialog({ open, onOpenChange, task, onSave }: TaskDialogProps) {
  const isEdit = !!task
  const { toast } = useToast()

  const [formData, setFormData] = useState<ScheduledTaskCreate>({
    name: "",
    task_name: "",
    description: "",
    schedule_type: "cron",
    cron_minute: "*",
    cron_hour: "*",
    cron_day_of_week: "*",
    cron_day_of_month: "*",
    cron_month_of_year: "*",
    interval_value: 1,
    interval_unit: "minutes",
    args: [],
    kwargs: {},
    queue: "celery",
    is_active: true,
  })

  const [argsText, setArgsText] = useState("")
  const [kwargsText, setKwargsText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name,
        task_name: task.task_name,
        description: task.description || "",
        schedule_type: task.schedule_type,
        cron_minute: task.cron_minute || "*",
        cron_hour: task.cron_hour || "*",
        cron_day_of_week: task.cron_day_of_week || "*",
        cron_day_of_month: task.cron_day_of_month || "*",
        cron_month_of_year: task.cron_month_of_year || "*",
        interval_value: task.interval_value || 1,
        interval_unit: task.interval_unit || "minutes",
        args: task.args,
        kwargs: task.kwargs,
        queue: task.queue || "celery",
        is_active: task.is_active,
      })
      setArgsText(JSON.stringify(task.args, null, 2))
      setKwargsText(JSON.stringify(task.kwargs, null, 2))
    } else {
      // Reset form for new task
      setFormData({
        name: "",
        task_name: "",
        description: "",
        schedule_type: "cron",
        cron_minute: "*",
        cron_hour: "*",
        cron_day_of_week: "*",
        cron_day_of_month: "*",
        cron_month_of_year: "*",
        interval_value: 1,
        interval_unit: "minutes",
        args: [],
        kwargs: {},
        queue: "celery",
        is_active: true,
      })
      setArgsText("[]")
      setKwargsText("{}")
    }
  }, [task, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Parse args and kwargs
      let parsedArgs = []
      let parsedKwargs = {}

      try {
        parsedArgs = JSON.parse(argsText || "[]")
      } catch {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: "JSON invalide dans le champ Args"
        })
        setIsSubmitting(false)
        return
      }

      try {
        parsedKwargs = JSON.parse(kwargsText || "{}")
      } catch {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: "JSON invalide dans le champ Kwargs"
        })
        setIsSubmitting(false)
        return
      }

      const submitData = {
        ...formData,
        args: parsedArgs,
        kwargs: parsedKwargs,
      }

      await onSave(submitData)
      onOpenChange(false)
      toast({
        title: "Succès",
        description: isEdit ? "Tâche mise à jour avec succès" : "Tâche créée avec succès"
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error?.message || "Impossible de sauvegarder la tâche"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Scheduled Task" : "Create Scheduled Task"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the scheduled task configuration"
              : "Create a new scheduled task with cron or interval scheduling"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Task Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="my-scheduled-task"
                required
              />
              <p className="text-xs text-muted-foreground">Unique identifier for this task</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task_name">Celery Task *</Label>
              <Input
                id="task_name"
                value={formData.task_name}
                onChange={(e) => setFormData({ ...formData, task_name: e.target.value })}
                placeholder="app.tasks.my_task"
                required
              />
              <p className="text-xs text-muted-foreground">Python task path</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this task do?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="queue">Queue</Label>
              <Select
                value={formData.queue}
                onValueChange={(value) => setFormData({ ...formData, queue: value })}
              >
                <SelectTrigger id="queue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="celery">Default (celery)</SelectItem>
                  <SelectItem value="high_priority">High Priority</SelectItem>
                  <SelectItem value="low_priority">Low Priority</SelectItem>
                  <SelectItem value="emails">Emails</SelectItem>
                  <SelectItem value="reports">Reports</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 flex items-center gap-3 pt-8">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Active (enabled)
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Schedule Type</Label>
            <Tabs
              value={formData.schedule_type}
              onValueChange={(value: "cron" | "interval") =>
                setFormData({ ...formData, schedule_type: value })
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="cron">Cron Expression</TabsTrigger>
                <TabsTrigger value="interval">Interval</TabsTrigger>
              </TabsList>

              <TabsContent value="cron" className="mt-4">
                <CronEditor
                  value={{
                    minute: formData.cron_minute,
                    hour: formData.cron_hour,
                    dayOfWeek: formData.cron_day_of_week,
                    dayOfMonth: formData.cron_day_of_month,
                    monthOfYear: formData.cron_month_of_year,
                  }}
                  onChange={(cron) =>
                    setFormData({
                      ...formData,
                      cron_minute: cron.minute,
                      cron_hour: cron.hour,
                      cron_day_of_week: cron.dayOfWeek,
                      cron_day_of_month: cron.dayOfMonth,
                      cron_month_of_year: cron.monthOfYear,
                    })
                  }
                />
              </TabsContent>

              <TabsContent value="interval" className="mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="interval_value">Interval Value</Label>
                    <Input
                      id="interval_value"
                      type="number"
                      min="1"
                      value={formData.interval_value}
                      onChange={(e) =>
                        setFormData({ ...formData, interval_value: parseInt(e.target.value) })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interval_unit">Unit</Label>
                    <Select
                      value={formData.interval_unit}
                      onValueChange={(value: any) =>
                        setFormData({ ...formData, interval_unit: value })
                      }
                    >
                      <SelectTrigger id="interval_unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seconds">Seconds</SelectItem>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Task will run every {formData.interval_value} {formData.interval_unit}
                </p>
              </TabsContent>
            </Tabs>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="args">Arguments (JSON Array)</Label>
              <Textarea
                id="args"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder='["arg1", "arg2"]'
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kwargs">Keyword Arguments (JSON Object)</Label>
              <Textarea
                id="kwargs"
                value={kwargsText}
                onChange={(e) => setKwargsText(e.target.value)}
                placeholder='{"key": "value"}'
                rows={3}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEdit ? "Update Task" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
