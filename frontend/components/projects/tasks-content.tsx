"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useHeaderContext } from "@/components/header-context"
import { mockTasks as initialMockTasks, mockProjects, type Task, type TaskStatus, type TaskPriority, type TaskComment } from "@/lib/projects-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Calendar as CalendarIcon,
  AlertCircle,
  FolderKanban,
  Plus,
  GripVertical,
  X,
  Save,
  Trash2,
  CheckCircle2,
  Clock,
  Target,
  Tag,
  Flag,
  User,
  Users,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
  Play,
  AlertTriangle,
  Hash,
  Timer,
  Send,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

const priorityColors: Record<TaskPriority, string> = {
  low: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  critical: "bg-red-500/10 text-red-700 dark:text-red-400",
}

const priorityLabels: Record<TaskPriority, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
}

const statusLabels: Record<TaskStatus, string> = {
  todo: "A faire",
  "in-progress": "En cours",
  review: "En revue",
  done: "Terminee",
  blocked: "Bloquee",
}

const statusColors: Record<TaskStatus, string> = {
  todo: "bg-gray-500/10 text-gray-600 border-gray-300",
  "in-progress": "bg-blue-500/10 text-blue-600 border-blue-300",
  review: "bg-purple-500/10 text-purple-600 border-purple-300",
  done: "bg-green-500/10 text-green-600 border-green-300",
  blocked: "bg-red-500/10 text-red-600 border-red-300",
}

const columns: { status: TaskStatus; label: string; color: string; bgColor: string }[] = [
  { status: "todo", label: "A faire", color: "text-gray-600", bgColor: "bg-gray-100 dark:bg-gray-800" },
  { status: "in-progress", label: "En cours", color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
  { status: "review", label: "En revue", color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900/30" },
  { status: "done", label: "Terminee", color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900/30" },
  { status: "blocked", label: "Bloquee", color: "text-red-600", bgColor: "bg-red-100 dark:bg-red-900/30" },
]

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "A faire" },
  { value: "in-progress", label: "En cours" },
  { value: "review", label: "En revue" },
  { value: "done", label: "Terminee" },
  { value: "blocked", label: "Bloquee" },
]

const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
  { value: "low", label: "Basse", color: "bg-gray-500" },
  { value: "medium", label: "Moyenne", color: "bg-blue-500" },
  { value: "high", label: "Haute", color: "bg-orange-500" },
  { value: "critical", label: "Critique", color: "bg-red-500" },
]

// Compact task card for Kanban
function SortableTaskCard({ task, isSelected, onClick }: { task: Task; isSelected: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isOverdue = task.status !== "done" && new Date(task.dueDate) < new Date()

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex flex-col gap-1 p-2 transition-all hover:shadow-md cursor-pointer",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary",
        isSelected && "ring-2 ring-primary bg-primary/5",
        isOverdue && !isSelected && "border-red-300 dark:border-red-800"
      )}
      onClick={onClick}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-grab active:cursor-grabbing p-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>

      <div className="flex items-start gap-1.5 pl-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {task.isAttentionRequired && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
            <h3 className="text-[11px] font-semibold leading-tight line-clamp-2">{task.title}</h3>
          </div>
          {task.reference && <span className="text-[9px] text-muted-foreground">{task.reference}</span>}
        </div>
        <Badge variant="secondary" className={cn("h-4 px-1 text-[8px] shrink-0", priorityColors[task.priority])}>
          {priorityLabels[task.priority].charAt(0)}
        </Badge>
      </div>

      <div className="flex items-center justify-between pl-3">
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <CalendarIcon className={cn("h-2.5 w-2.5", isOverdue && "text-red-500")} />
          <span className={cn(isOverdue && "text-red-500")}>
            {new Date(task.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {task.comments && task.comments.length > 0 && (
            <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <MessageSquare className="h-2.5 w-2.5" />
              <span>{task.comments.length}</span>
            </div>
          )}
          {task.assignee && (
            <Avatar className="h-4 w-4 border border-background">
              <AvatarFallback className="text-[7px]">{task.assignee.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>

      {task.progress > 0 && task.progress < 100 && (
        <div className="pl-3">
          <Progress value={task.progress} className="h-0.5" />
        </div>
      )}
    </Card>
  )
}

function TaskCardOverlay({ task }: { task: Task }) {
  return (
    <Card className="flex flex-col gap-1 p-2 shadow-xl ring-2 ring-primary min-w-[180px]">
      <h3 className="text-[11px] font-semibold leading-tight">{task.title}</h3>
      <Badge variant="secondary" className={cn("h-4 px-1 text-[8px] w-fit", priorityColors[task.priority])}>
        {priorityLabels[task.priority]}
      </Badge>
    </Card>
  )
}

function Column({ column, tasks, selectedTaskId, onTaskClick, onAddTask }: {
  column: typeof columns[0]
  tasks: Task[]
  selectedTaskId: string | null
  onTaskClick: (task: Task) => void
  onAddTask: (status: TaskStatus) => void
}) {
  return (
    <div className="flex min-w-[200px] max-w-[220px] flex-col gap-1.5">
      <div className={cn("flex items-center justify-between rounded-md px-2 py-1.5", column.bgColor)}>
        <div className="flex items-center gap-1.5">
          <span className={cn("text-xs font-semibold", column.color)}>{column.label}</span>
          <Badge variant="secondary" className="h-4 px-1 text-[9px]">{tasks.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-60 hover:opacity-100" onClick={() => onAddTask(column.status)}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5 min-h-[80px]">
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
              onClick={() => onTaskClick(task)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="flex items-center justify-center h-16 border border-dashed rounded-md text-muted-foreground text-[10px]">
              Deposez ici
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// Collapsible Section Component
function Section({ title, icon: Icon, defaultOpen = true, children }: {
  title: string
  icon: React.ElementType
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover:bg-muted/50 rounded-md px-2 transition-colors">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

// Task Panel Component - Gouti Inspired
interface TaskPanelProps {
  task: Task | null
  isCreating: boolean
  defaultStatus: TaskStatus
  defaultProjectId?: string
  onSave: (taskData: Partial<Task>) => void
  onDelete: (taskId: string) => void
  onClose: () => void
}

function TaskPanel({ task, isCreating, defaultStatus, defaultProjectId, onSave, onDelete, onClose }: TaskPanelProps) {
  // Form state
  const [title, setTitle] = useState("")
  const [reference, setReference] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<TaskStatus>(defaultStatus)
  const [priority, setPriority] = useState<TaskPriority>("medium")
  const [projectId, setProjectId] = useState(defaultProjectId || "")
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [progress, setProgress] = useState(0)
  const [assignee, setAssignee] = useState("")
  const [team, setTeam] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [isMilestone, setIsMilestone] = useState(false)
  const [isAttentionRequired, setIsAttentionRequired] = useState(false)
  const [estimatedHours, setEstimatedHours] = useState<number>(0)
  const [usedHours, setUsedHours] = useState<number>(0)
  const [personalNotes, setPersonalNotes] = useState("")
  const [comments, setComments] = useState<TaskComment[]>([])
  const [newComment, setNewComment] = useState("")
  const [editMode, setEditMode] = useState(isCreating)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("info")

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setReference(task.reference || "")
      setDescription(task.description || "")
      setStatus(task.status)
      setPriority(task.priority)
      setProjectId(task.projectId)
      setStartDate(task.startDate ? new Date(task.startDate) : undefined)
      setDueDate(task.dueDate ? new Date(task.dueDate) : undefined)
      setProgress(task.progress)
      setAssignee(task.assignee || "")
      setTeam(task.team || "")
      setTags(task.tags || [])
      setIsMilestone(task.isMilestone || false)
      setIsAttentionRequired(task.isAttentionRequired || false)
      setEstimatedHours(task.estimatedHours || 0)
      setUsedHours(task.usedHours || 0)
      setPersonalNotes(task.personalNotes || "")
      setComments(task.comments || [])
      setEditMode(false)
    } else if (isCreating) {
      setTitle("")
      setReference("")
      setDescription("")
      setStatus(defaultStatus)
      setPriority("medium")
      setProjectId(defaultProjectId || "")
      setStartDate(new Date())
      setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
      setProgress(0)
      setAssignee("")
      setTeam("")
      setTags([])
      setIsMilestone(false)
      setIsAttentionRequired(false)
      setEstimatedHours(8)
      setUsedHours(0)
      setPersonalNotes("")
      setComments([])
      setEditMode(true)
    }
  }, [task, isCreating, defaultStatus, defaultProjectId])

  const handleSave = () => {
    if (!title.trim() || !projectId) return

    const taskData: Partial<Task> = {
      ...(task?.id && { id: task.id }),
      title: title.trim(),
      reference: reference.trim() || undefined,
      description: description.trim(),
      status,
      priority,
      projectId,
      startDate: startDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      dueDate: dueDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      progress,
      assignee: assignee.trim() || undefined,
      team: team.trim() || undefined,
      tags,
      isMilestone,
      isAttentionRequired,
      estimatedHours,
      usedHours,
      remainingHours: Math.max(0, estimatedHours - usedHours),
      personalNotes: personalNotes.trim() || undefined,
      comments,
      project: mockProjects.find((p) => p.id === projectId)?.name || "",
    }

    onSave(taskData)
    setEditMode(false)
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

  const handleAddComment = () => {
    if (newComment.trim()) {
      const comment: TaskComment = {
        id: `comment_${Date.now()}`,
        author: "Utilisateur actuel",
        content: newComment.trim(),
        createdAt: new Date().toISOString(),
      }
      setComments([...comments, comment])
      setNewComment("")
    }
  }

  const handleDelete = () => {
    if (task) {
      onDelete(task.id)
      setDeleteDialogOpen(false)
    }
  }

  const isOverdue = task && task.status !== "done" && new Date(task.dueDate) < new Date()
  const daysUntilDue = task ? Math.ceil((new Date(task.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0
  const project = task ? mockProjects.find((p) => p.id === task.projectId) : null
  const remainingHours = Math.max(0, estimatedHours - usedHours)
  const hoursProgress = estimatedHours > 0 ? Math.min(100, (usedHours / estimatedHours) * 100) : 0

  // Empty state
  if (!task && !isCreating) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center p-6 bg-muted/30 rounded-lg">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Target className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">Selectionnez une tache</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Cliquez sur une tache pour voir ses details
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {task && !editMode && (
            <Badge variant="outline" className={cn("text-xs shrink-0", statusColors[task.status])}>
              {statusLabels[task.status]}
            </Badge>
          )}
          {task?.reference && !editMode && (
            <span className="text-xs text-muted-foreground shrink-0">{task.reference}</span>
          )}
          <span className="text-sm font-medium truncate">
            {isCreating ? "Nouvelle tache" : editMode ? "Modification" : task?.title}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {task && !editMode && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditMode(true)}>
              Modifier
            </Button>
          )}
          {editMode && !isCreating && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditMode(false)}>
              Annuler
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {editMode ? (
        // Edit/Create Mode
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <Section title="Description" icon={FileText} defaultOpen>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Reference</Label>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex: PROJ-001" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Projet *</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selectionner" /></SelectTrigger>
                      <SelectContent>
                        {mockProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Titre *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la tache" className="h-8 text-sm" />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} className="rounded" title="Jalon" />
                    <Target className="h-3.5 w-3.5" />
                    Jalon
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={isAttentionRequired} onChange={(e) => setIsAttentionRequired(e.target.checked)} className="rounded" title="Point d'attention" />
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Point d'attention
                  </label>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description detaillee..." rows={4} className="text-sm resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Responsable</Label>
                    <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Nom" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Equipe</Label>
                    <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Equipe" className="h-8 text-sm" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Etiquettes</Label>
                  <div className="flex gap-2">
                    <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Ajouter" className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())} />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleAddTag}><Plus className="h-3 w-3" /></Button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs gap-1">
                          {tag}
                          <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-destructive" title={`Supprimer ${tag}`}><X className="h-2.5 w-2.5" /></button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>

            <Separator />

            <Section title="Dates et duree" icon={CalendarIcon} defaultOpen>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Debut</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("h-8 w-full justify-start text-left text-sm font-normal", !startDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {startDate ? format(startDate, "dd/MM/yyyy", { locale: fr }) : "Selectionner"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus locale={fr} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fin</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("h-8 w-full justify-start text-left text-sm font-normal", !dueDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {dueDate ? format(dueDate, "dd/MM/yyyy", { locale: fr }) : "Selectionner"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus locale={fr} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Statut</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Priorite</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
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
              </div>
            </Section>

            <Separator />

            <Section title="Charge de travail" icon={Timer} defaultOpen>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Charge totale (h)</Label>
                    <Input type="number" value={estimatedHours} onChange={(e) => setEstimatedHours(Number(e.target.value))} className="h-8 text-sm" min={0} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Utilisee (h)</Label>
                    <Input type="number" value={usedHours} onChange={(e) => setUsedHours(Number(e.target.value))} className="h-8 text-sm" min={0} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Progression</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Slider value={[progress]} onValueChange={([v]) => setProgress(v)} max={100} step={5} />
                </div>
              </div>
            </Section>

            <Separator />

            <Section title="Notes personnelles" icon={FileText} defaultOpen={false}>
              <Textarea value={personalNotes} onChange={(e) => setPersonalNotes(e.target.value)} placeholder="Ces notes ne sont visibles que par vous..." rows={3} className="text-sm resize-none" />
            </Section>
          </div>
        </ScrollArea>
      ) : task ? (
        // View Mode with Tabs
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-9 px-2">
            <TabsTrigger value="info" className="text-xs data-[state=active]:bg-background">Information</TabsTrigger>
            <TabsTrigger value="time" className="text-xs data-[state=active]:bg-background">Temps</TabsTrigger>
            <TabsTrigger value="comments" className="text-xs data-[state=active]:bg-background">
              Commentaires {comments.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{comments.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {/* Quick Stats Row */}
                <div className="grid grid-cols-3 gap-2">
                  <Card className="p-2 text-center">
                    <div className="text-[10px] text-muted-foreground mb-1">Priorite</div>
                    <Badge className={cn("text-[10px]", priorityColors[task.priority])}>{priorityLabels[task.priority]}</Badge>
                  </Card>
                  <Card className="p-2 text-center">
                    <div className="text-[10px] text-muted-foreground mb-1">Progression</div>
                    <div className="text-lg font-bold">{task.progress}%</div>
                  </Card>
                  <Card className={cn("p-2 text-center", isOverdue && "border-red-300")}>
                    <div className="text-[10px] text-muted-foreground mb-1">Echeance</div>
                    <div className={cn("text-xs font-medium", isOverdue && "text-red-500")}>
                      {isOverdue ? `J+${Math.abs(daysUntilDue)}` : daysUntilDue === 0 ? "Aujourd'hui" : `J-${daysUntilDue}`}
                    </div>
                  </Card>
                </div>

                <Separator />

                {/* Project & Team */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{project?.code}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="text-muted-foreground">{project?.name}</span>
                  </div>
                  {task?.team && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{task.team}</span>
                    </div>
                  )}
                  {task?.assignee && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px]">{task.assignee.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
                      </Avatar>
                      <span>{task.assignee}</span>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">Debut</div>
                    <div className="text-sm font-medium">
                      {task?.startDate ? format(new Date(task.startDate), "dd MMM yyyy", { locale: fr }) : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">Fin</div>
                    <div className={cn("text-sm font-medium", isOverdue && "text-red-500")}>
                      {task?.dueDate ? format(new Date(task.dueDate), "dd MMM yyyy", { locale: fr }) : "-"}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {task?.description && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">Description</div>
                      <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                    </div>
                  </>
                )}

                {/* Tags */}
                {task?.tags && task.tags.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-2">Etiquettes</div>
                      <div className="flex flex-wrap gap-1">
                        {task.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Personal Notes */}
                {task?.personalNotes && (
                  <>
                    <Separator />
                    <Card className="p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                      <div className="text-[10px] text-amber-700 dark:text-amber-400 mb-1">Notes personnelles</div>
                      <p className="text-sm">{task.personalNotes}</p>
                    </Card>
                  </>
                )}

                {/* Blocked Warning */}
                {task?.status === "blocked" && (
                  <Card className="p-3 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">Tache bloquee</p>
                        <p className="text-xs text-red-600 dark:text-red-400/80">Necessite une attention particuliere</p>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="time" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {/* Progress Card */}
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-2">Progression globale</div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Progress value={task.progress} className="h-3" />
                    </div>
                    <span className="text-2xl font-bold">{task.progress}%</span>
                  </div>
                  {task.status !== "done" && task.status !== "blocked" && (
                    <Button size="sm" className="mt-3 h-7 text-xs" variant="outline">
                      <Play className="h-3 w-3 mr-1" />
                      Commencer la tache
                    </Button>
                  )}
                </Card>

                {/* Workload Card */}
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-3">Charge de travail</div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Estimee</div>
                      <div className="text-lg font-bold">{task?.estimatedHours || 0}h</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Utilisee</div>
                      <div className="text-lg font-bold text-blue-600">{task?.usedHours || 0}h</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Reste</div>
                      <div className={cn("text-lg font-bold", (task?.remainingHours || 0) < 0 && "text-red-500")}>
                        {task?.remainingHours || 0}h
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress value={hoursProgress} className={cn("h-2", hoursProgress > 100 && "bg-red-200")} />
                    <div className="text-[10px] text-muted-foreground mt-1 text-right">
                      {hoursProgress.toFixed(0)}% de la charge utilisee
                    </div>
                  </div>
                </Card>

                {/* Status Change */}
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-3">Statut</div>
                  <div className="grid grid-cols-2 gap-2">
                    {statusOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        variant={task?.status === opt.value ? "default" : "outline"}
                        size="sm"
                        className="h-8 text-xs justify-start"
                        onClick={() => {
                          if (task) {
                            onSave({ ...task, status: opt.value })
                          }
                        }}
                      >
                        <div className={cn("w-2 h-2 rounded-full mr-2", statusColors[opt.value].split(" ")[0].replace("/10", ""))} />
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="comments" className="flex-1 m-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {comments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucun commentaire</p>
                  </div>
                ) : (
                  comments.map((comment) => (
                    <Card key={comment.id} className="p-3">
                      <div className="flex items-start gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[9px]">{comment.author.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">{comment.author}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(comment.createdAt), "dd/MM HH:mm", { locale: fr })}
                            </span>
                          </div>
                          <p className="text-sm mt-1">{comment.content}</p>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="p-3 border-t bg-muted/30">
              <div className="flex gap-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Ajouter un commentaire..."
                  className="min-h-[60px] text-sm resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey) {
                      handleAddComment()
                    }
                  }}
                />
                <Button size="icon" className="h-[60px] w-10 shrink-0" onClick={handleAddComment} disabled={!newComment.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter pour envoyer</p>
            </div>
          </TabsContent>
        </Tabs>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
        {editMode ? (
          <>
            {task && (
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-3 w-3 mr-1" />
                Supprimer
              </Button>
            )}
            {!task && <div />}
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!title.trim() || !projectId}>
              <Save className="h-3 w-3 mr-1" />
              {task ? "Enregistrer" : "Creer"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-3 w-3 mr-1" />
              Supprimer
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => setEditMode(true)}>
              Modifier
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la tache</AlertDialogTitle>
            <AlertDialogDescription>
              Etes-vous sur de vouloir supprimer cette tache ? Cette action est irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function TasksContent() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [tasks, setTasks] = useState<Task[]>(initialMockTasks)
  const [projectFilter, setProjectFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>("todo")
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher taches...",
      onSearchChange: setSearchQuery,
      contextualButtons: [{
        label: "Nouvelle tache",
        icon: Plus,
        onClick: () => router.push("/projects/tasks/new"),
      }],
    })
    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader, router])

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = searchQuery === "" || task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.project.toLowerCase().includes(searchQuery.toLowerCase()) || (task.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (task.reference || "").toLowerCase().includes(searchQuery.toLowerCase())
      const matchesProject = projectFilter === "all" || task.projectId === projectFilter
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter
      return matchesSearch && matchesProject && matchesPriority
    })
  }, [tasks, searchQuery, projectFilter, priorityFilter])

  const groupedTasks = useMemo(() => {
    return columns.reduce((acc, col) => {
      acc[col.status] = filteredTasks.filter((t) => t.status === col.status)
      return acc
    }, {} as Record<TaskStatus, Task[]>)
  }, [filteredTasks])

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string) }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const task = tasks.find((t) => t.id === active.id)
    if (!task) return
    const overColumn = columns.find((c) => c.status === over.id)
    if (overColumn && task.status !== overColumn.status) {
      setTasks((prev) => prev.map((t) => (t.id === active.id ? { ...t, status: overColumn.status } : t)))
      if (selectedTask?.id === active.id) {
        setSelectedTask((prev) => prev ? { ...prev, status: overColumn.status } : null)
      }
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const task = tasks.find((t) => t.id === active.id)
    const overTask = tasks.find((t) => t.id === over.id)
    if (!task) return
    if (overTask && task.status === overTask.status) {
      setTasks((prev) => {
        const columnTasks = prev.filter((t) => t.status === task.status)
        const otherTasks = prev.filter((t) => t.status !== task.status)
        const oldIndex = columnTasks.findIndex((t) => t.id === active.id)
        const newIndex = columnTasks.findIndex((t) => t.id === over.id)
        return [...otherTasks, ...arrayMove(columnTasks, oldIndex, newIndex)]
      })
    }
    const overColumn = columns.find((c) => c.status === over.id)
    if (overColumn && task.status !== overColumn.status) {
      setTasks((prev) => prev.map((t) => (t.id === active.id ? { ...t, status: overColumn.status } : t)))
    }
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setIsCreating(false)
  }

  const handleAddTask = (status: TaskStatus) => {
    // Navigate to dedicated page for creating tasks
    router.push(`/projects/tasks/new?status=${status}`)
  }

  const handleClosePanel = () => {
    if (isCreating) {
      setIsCreating(false)
    } else {
      setSelectedTask(null)
    }
  }

  const handleSaveTask = (taskData: Partial<Task>) => {
    if (taskData.id) {
      setTasks((prev) => prev.map((t) => (t.id === taskData.id ? { ...t, ...taskData } : t)))
      setSelectedTask((prev) => prev ? { ...prev, ...taskData } : null)
    } else {
      const newTask: Task = {
        id: `task_${Date.now()}`,
        title: taskData.title || "",
        reference: taskData.reference,
        description: taskData.description || "",
        status: taskData.status || defaultStatus,
        priority: taskData.priority || "medium",
        projectId: taskData.projectId || "",
        project: taskData.project || "",
        startDate: taskData.startDate || new Date().toISOString().split("T")[0],
        dueDate: taskData.dueDate || new Date().toISOString().split("T")[0],
        progress: taskData.progress || 0,
        assignee: taskData.assignee,
        assignees: taskData.assignee ? [taskData.assignee] : [],
        team: taskData.team,
        tags: taskData.tags || [],
        isMilestone: taskData.isMilestone || false,
        isAttentionRequired: taskData.isAttentionRequired || false,
        estimatedHours: taskData.estimatedHours,
        usedHours: taskData.usedHours,
        remainingHours: taskData.remainingHours,
        personalNotes: taskData.personalNotes,
        comments: taskData.comments || [],
        createdAt: new Date().toISOString(),
      }
      setTasks((prev) => [newTask, ...prev])
      setSelectedTask(newTask)
      setIsCreating(false)
    }
  }

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setSelectedTask(null)
    setIsCreating(false)
  }

  const stats = useMemo(() => {
    const filtered = filteredTasks.filter((t) => !t.isMilestone)
    return {
      total: filtered.length,
      done: filtered.filter((t) => t.status === "done").length,
      inProgress: filtered.filter((t) => t.status === "in-progress").length,
      blocked: filtered.filter((t) => t.status === "blocked").length,
    }
  }, [filteredTasks])

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-7 w-[160px] text-xs">
              <FolderKanban className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les projets</SelectItem>
              {mockProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>{project.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Priorites</SelectItem>
              <SelectItem value="critical">Critique</SelectItem>
              <SelectItem value="high">Haute</SelectItem>
              <SelectItem value="medium">Moyenne</SelectItem>
              <SelectItem value="low">Basse</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{stats.total} taches</span>
          <span className="text-green-600">{stats.done} OK</span>
          <span className="text-blue-600">{stats.inProgress} en cours</span>
          {stats.blocked > 0 && <span className="text-red-600">{stats.blocked} bloquees</span>}
        </div>
      </div>

      {/* Main content: Kanban + Detail panel */}
      <div className="flex flex-1 gap-3 min-h-0">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
            {columns.map((column) => (
              <Column
                key={column.status}
                column={column}
                tasks={groupedTasks[column.status] || []}
                selectedTaskId={selectedTask?.id || null}
                onTaskClick={handleTaskClick}
                onAddTask={handleAddTask}
              />
            ))}
          </div>
          <DragOverlay>{activeTask ? <TaskCardOverlay task={activeTask} /> : null}</DragOverlay>
        </DndContext>

        <div className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden",
          (selectedTask || isCreating) ? "w-[400px] opacity-100" : "w-0 opacity-0"
        )}>
          <TaskPanel
            task={selectedTask}
            isCreating={isCreating}
            defaultStatus={defaultStatus}
            defaultProjectId={projectFilter !== "all" ? projectFilter : undefined}
            onSave={handleSaveTask}
            onDelete={handleDeleteTask}
            onClose={handleClosePanel}
          />
        </div>
      </div>
    </div>
  )
}
