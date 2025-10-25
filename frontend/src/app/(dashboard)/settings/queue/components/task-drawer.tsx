"use client"

import { useState, useEffect } from "react"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { CronEditor } from "./cron-editor"
import { ScheduledTask, ScheduledTaskCreate, ScheduledTaskUpdate, getAvailableCeleryTasks } from "@/api/scheduled-tasks"
import { useToast } from "@/hooks/use-toast"
import { t } from "./translations"

interface TaskDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: ScheduledTask | null
  onSave: (data: ScheduledTaskCreate | ScheduledTaskUpdate) => Promise<void>
}

export function TaskDrawer({ open, onOpenChange, task, onSave }: TaskDrawerProps) {
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
  const [availableTasks, setAvailableTasks] = useState<string[]>([])
  const [comboOpen, setComboOpen] = useState(false)

  useEffect(() => {
    getAvailableCeleryTasks().then(setAvailableTasks)
  }, [])

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
          title: t("error"),
          description: t("invalidJsonArgs")
        })
        setIsSubmitting(false)
        return
      }

      try {
        parsedKwargs = JSON.parse(kwargsText || "{}")
      } catch {
        toast({
          variant: "destructive",
          title: t("error"),
          description: t("invalidJsonKwargs")
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
        title: t("success"),
        description: isEdit ? t("taskUpdated") : t("taskCreated")
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("error"),
        description: error?.message || t("failedToSave")
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("editTask") : t("createTask")}</SheetTitle>
          <SheetDescription>
            {isEdit ? t("editTaskDescription") : t("createTaskDescription")}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("taskName")} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("taskNamePlaceholder")}
                required
              />
              <p className="text-xs text-muted-foreground">{t("taskNameHelper")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task_name">{t("celeryTask")} *</Label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboOpen}
                    className="w-full justify-between"
                  >
                    {formData.task_name || t("celeryTaskPlaceholder")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Rechercher une tâche..." />
                    <CommandList>
                      <CommandEmpty>Aucune tâche trouvée.</CommandEmpty>
                      <CommandGroup>
                        {availableTasks.map((taskName) => (
                          <CommandItem
                            key={taskName}
                            value={taskName}
                            onSelect={(currentValue) => {
                              setFormData({ ...formData, task_name: currentValue })
                              setComboOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.task_name === taskName ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {taskName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">{t("celeryTaskHelper")}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("description")}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t("descriptionPlaceholder")}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="queue">{t("queue")}</Label>
              <Select
                value={formData.queue}
                onValueChange={(value) => setFormData({ ...formData, queue: value })}
              >
                <SelectTrigger id="queue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="celery">{t("queueDefault")}</SelectItem>
                  <SelectItem value="high_priority">{t("queueHigh")}</SelectItem>
                  <SelectItem value="low_priority">{t("queueLow")}</SelectItem>
                  <SelectItem value="emails">{t("queueEmails")}</SelectItem>
                  <SelectItem value="reports">{t("queueReports")}</SelectItem>
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
                {t("active")}
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("scheduleType")}</Label>
            <Tabs
              value={formData.schedule_type}
              onValueChange={(value: "cron" | "interval") =>
                setFormData({ ...formData, schedule_type: value })
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="cron">{t("cronExpression")}</TabsTrigger>
                <TabsTrigger value="interval">{t("interval")}</TabsTrigger>
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
                    <Label htmlFor="interval_value">{t("intervalValue")}</Label>
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
                    <Label htmlFor="interval_unit">{t("intervalUnit")}</Label>
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
                        <SelectItem value="seconds">{t("seconds")}</SelectItem>
                        <SelectItem value="minutes">{t("minutes")}</SelectItem>
                        <SelectItem value="hours">{t("hours")}</SelectItem>
                        <SelectItem value="days">{t("days")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("intervalHelper")} {formData.interval_value} {t(formData.interval_unit as any)}
                </p>
              </TabsContent>
            </Tabs>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="args">{t("args")}</Label>
              <Textarea
                id="args"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder={t("argsPlaceholder")}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kwargs">{t("kwargs")}</Label>
              <Textarea
                id="kwargs"
                value={kwargsText}
                onChange={(e) => setKwargsText(e.target.value)}
                placeholder={t("kwargsPlaceholder")}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <SheetFooter className="pt-4">
            <SheetClose asChild>
              <Button variant="outline" type="button">{t("cancel")}</Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : isEdit ? t("updateButton") : t("createButton")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
