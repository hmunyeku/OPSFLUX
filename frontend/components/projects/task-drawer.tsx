"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { CalendarIcon, X, Plus, Trash2 } from "lucide-react"
import type { Task, TaskStatus, TaskPriority } from "@/lib/projects-data"
import { mockProjects } from "@/lib/projects-data"

interface TaskDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null
  onSave: (task: Partial<Task>) => void
  onDelete?: (taskId: string) => void
  defaultProjectId?: string
}

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "A faire" },
  { value: "in-progress", label: "En cours" },
  { value: "review", label: "En revue" },
  { value: "done", label: "Termine" },
  { value: "blocked", label: "Bloque" },
]

const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
  { value: "low", label: "Basse", color: "bg-gray-500" },
  { value: "medium", label: "Moyenne", color: "bg-blue-500" },
  { value: "high", label: "Haute", color: "bg-orange-500" },
  { value: "critical", label: "Critique", color: "bg-red-500" },
]

export function TaskDrawer({ open, onOpenChange, task, onSave, onDelete, defaultProjectId }: TaskDrawerProps) {
  const isEditing = !!task

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<TaskStatus>("todo")
  const [priority, setPriority] = useState<TaskPriority>("medium")
  const [projectId, setProjectId] = useState(defaultProjectId || "")
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [progress, setProgress] = useState(0)
  const [assignee, setAssignee] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [isMilestone, setIsMilestone] = useState(false)

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || "")
      setStatus(task.status)
      setPriority(task.priority)
      setProjectId(task.projectId)
      setStartDate(task.startDate ? new Date(task.startDate) : undefined)
      setDueDate(task.dueDate ? new Date(task.dueDate) : undefined)
      setProgress(task.progress)
      setAssignee(task.assignee || "")
      setTags(task.tags || [])
      setIsMilestone(task.isMilestone || false)
    } else {
      // Reset to defaults
      setTitle("")
      setDescription("")
      setStatus("todo")
      setPriority("medium")
      setProjectId(defaultProjectId || "")
      setStartDate(new Date())
      setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // +7 days
      setProgress(0)
      setAssignee("")
      setTags([])
      setIsMilestone(false)
    }
  }, [task, defaultProjectId, open])

  const handleSave = () => {
    if (!title.trim() || !projectId) return

    const taskData: Partial<Task> = {
      ...(task?.id && { id: task.id }),
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      projectId,
      startDate: startDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      dueDate: dueDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      progress,
      assignee: assignee.trim() || undefined,
      tags,
      isMilestone,
      project: mockProjects.find((p) => p.id === projectId)?.name || "",
    }

    onSave(taskData)
    onOpenChange(false)
  }

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const handleDelete = () => {
    if (task && onDelete) {
      onDelete(task.id)
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Modifier la tache" : "Nouvelle tache"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Modifiez les details de la tache" : "Remplissez les informations pour creer une nouvelle tache"}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 py-4">
          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="title">Titre *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de la tache"
            />
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description detaillee..."
              rows={3}
            />
          </div>

          {/* Project */}
          <div className="grid gap-2">
            <Label>Projet *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Selectionner un projet" />
              </SelectTrigger>
              <SelectContent>
                {mockProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Statut</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Priorite</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", opt.color)} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Date de debut</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd MMM yyyy", { locale: fr }) : "Selectionner"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus locale={fr} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label>Date d'echeance</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "dd MMM yyyy", { locale: fr }) : "Selectionner"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus locale={fr} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Progress */}
          <div className="grid gap-2">
            <div className="flex justify-between">
              <Label>Progression</Label>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <Slider value={[progress]} onValueChange={([v]) => setProgress(v)} max={100} step={5} />
          </div>

          {/* Assignee */}
          <div className="grid gap-2">
            <Label htmlFor="assignee">Responsable</Label>
            <Input
              id="assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Nom du responsable"
            />
          </div>

          {/* Tags */}
          <div className="grid gap-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Ajouter un tag"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Milestone toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="milestone"
              checked={isMilestone}
              onChange={(e) => setIsMilestone(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="milestone" className="cursor-pointer">
              Marquer comme jalon (milestone)
            </Label>
          </div>
        </div>

        <SheetFooter className="flex gap-2">
          {isEditing && onDelete && (
            <Button type="button" variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </Button>
          )}
          <div className="flex-1" />
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSave} disabled={!title.trim() || !projectId}>
            {isEditing ? "Enregistrer" : "Creer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
