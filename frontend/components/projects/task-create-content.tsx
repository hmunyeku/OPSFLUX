"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useHeaderContext } from "@/components/header-context"
import { mockProjects, type Task, type TaskStatus, type TaskPriority } from "@/lib/projects-data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ArrowLeft,
  CalendarIcon,
  X,
  Plus,
  Clock,
  User,
  Users,
  FolderKanban,
  Flag,
  Target,
  Hash,
  FileText,
  CheckCircle2,
  Circle,
  Pause,
  AlertCircle,
  PlayCircle,
  ChevronRight,
  Sparkles,
  Link2,
  Paperclip,
  AtSign,
  ListTodo,
  MoreHorizontal,
  Check,
  Info
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format, differenceInDays } from "date-fns"
import { fr } from "date-fns/locale"

// Status configuration
const statusConfig: Record<TaskStatus, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  "todo": { label: "À faire", icon: Circle, color: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200" },
  "in-progress": { label: "En cours", icon: PlayCircle, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  "review": { label: "En revue", icon: Pause, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  "done": { label: "Terminé", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  "blocked": { label: "Bloqué", icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
}

// Priority configuration
const priorityConfig: Record<TaskPriority, { label: string; color: string; icon: string; bg: string }> = {
  "critical": { label: "Urgente", color: "text-red-600", icon: "🔴", bg: "bg-red-50" },
  "high": { label: "Haute", color: "text-orange-600", icon: "🟠", bg: "bg-orange-50" },
  "medium": { label: "Moyenne", color: "text-blue-600", icon: "🔵", bg: "bg-blue-50" },
  "low": { label: "Basse", color: "text-slate-500", icon: "⚪", bg: "bg-slate-50" },
}

// Team members mock
const teamMembers = [
  { id: "1", name: "Alice Martin", initials: "AM", role: "Chef de projet" },
  { id: "2", name: "Bob Dupont", initials: "BD", role: "Développeur" },
  { id: "3", name: "Claire Bernard", initials: "CB", role: "Designer" },
  { id: "4", name: "David Leroy", initials: "DL", role: "Analyste" },
]

function TaskCreateContentInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultProjectId = searchParams?.get("projectId") || ""
  const defaultStatus = (searchParams?.get("status") as TaskStatus) || "todo"
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  // Form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<TaskStatus>(defaultStatus)
  const [priority, setPriority] = useState<TaskPriority>("medium")
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())
  const [dueDate, setDueDate] = useState<Date | undefined>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  const [assignee, setAssignee] = useState<string>("")
  const [team, setTeam] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [isMilestone, setIsMilestone] = useState(false)
  const [estimatedHours, setEstimatedHours] = useState(8)
  const [personalNotes, setPersonalNotes] = useState("")

  // Popover states
  const [statusOpen, setStatusOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [assigneeOpen, setAssigneeOpen] = useState(false)

  useEffect(() => {
    setContextualHeader({ contextualButtons: [] })
    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const handleSave = () => {
    if (!title.trim() || !projectId) return

    const newTask: Partial<Task> = {
      id: `task_${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      projectId,
      project: mockProjects.find((p) => p.id === projectId)?.name || "",
      startDate: startDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      dueDate: dueDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      progress: 0,
      assignee: assignee || undefined,
      team: team.trim() || undefined,
      tags,
      isMilestone,
      estimatedHours,
      usedHours: 0,
      remainingHours: estimatedHours,
      personalNotes: personalNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    }

    console.log("Creating task:", newTask)
    router.push("/projects/tasks")
  }

  const isValid = title.trim() && projectId
  const selectedProject = mockProjects.find((p) => p.id === projectId)
  const daysUntilDue = dueDate && startDate ? differenceInDays(dueDate, startDate) : 0
  const selectedAssignee = teamMembers.find(m => m.name === assignee)

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-slate-50/50 dark:bg-slate-950/50">
        {/* Header */}
        <div className="h-16 bg-background border-b flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => router.push("/projects/tasks")}
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <ListTodo className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">Nouvelle tâche</h1>
                <p className="text-xs text-muted-foreground">Création d'une tâche</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => router.push("/projects/tasks")}>
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isValid}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
            >
              <Check className="h-4 w-4 mr-2" />
              Créer la tâche
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Form Section */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="max-w-4xl mx-auto py-8 px-8">
                {/* Title Section */}
                <div className="bg-background rounded-xl border shadow-sm p-6 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center shrink-0 mt-1">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Titre de la tâche *
                      </Label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Implémenter la fonctionnalité de recherche"
                        className="w-full text-xl font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/40 mt-2"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Actions Bar */}
                <div className="bg-background rounded-xl border shadow-sm p-4 mb-6">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Status */}
                    <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-9 gap-2 transition-all",
                            statusConfig[status].bg,
                            statusConfig[status].border,
                            statusConfig[status].color
                          )}
                        >
                          {(() => {
                            const Icon = statusConfig[status].icon
                            return <Icon className="h-4 w-4" />
                          })()}
                          {statusConfig[status].label}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-52 p-2" align="start">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                          Statut
                        </div>
                        {(Object.entries(statusConfig) as [TaskStatus, typeof statusConfig[TaskStatus]][]).map(([key, config]) => {
                          const Icon = config.icon
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => { setStatus(key); setStatusOpen(false) }}
                              className={cn(
                                "w-full flex items-center gap-3 px-2 py-2 text-sm rounded-lg transition-colors",
                                status === key ? "bg-accent" : "hover:bg-accent/50"
                              )}
                            >
                              <Icon className={cn("h-4 w-4", config.color)} />
                              <span className="font-medium">{config.label}</span>
                              {status === key && <Check className="h-4 w-4 ml-auto text-blue-600" />}
                            </button>
                          )
                        })}
                      </PopoverContent>
                    </Popover>

                    {/* Priority */}
                    <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn("h-9 gap-2", priorityConfig[priority].bg)}
                        >
                          <span>{priorityConfig[priority].icon}</span>
                          <span className={priorityConfig[priority].color}>{priorityConfig[priority].label}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-2" align="start">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                          Priorité
                        </div>
                        {(Object.entries(priorityConfig) as [TaskPriority, typeof priorityConfig[TaskPriority]][]).map(([key, config]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => { setPriority(key); setPriorityOpen(false) }}
                            className={cn(
                              "w-full flex items-center gap-3 px-2 py-2 text-sm rounded-lg transition-colors",
                              priority === key ? "bg-accent" : "hover:bg-accent/50"
                            )}
                          >
                            <span>{config.icon}</span>
                            <span className={cn("font-medium", config.color)}>{config.label}</span>
                            {priority === key && <Check className="h-4 w-4 ml-auto text-blue-600" />}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>

                    <Separator orientation="vertical" className="h-6" />

                    {/* Project */}
                    <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-9 gap-2",
                            selectedProject ? "border-blue-200 bg-blue-50/50" : ""
                          )}
                        >
                          <FolderKanban className="h-4 w-4 text-muted-foreground" />
                          {selectedProject ? (
                            <span className="font-medium">{selectedProject.code}</span>
                          ) : (
                            <span className="text-muted-foreground">Projet *</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-2" align="start">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                          Sélectionner un projet
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {mockProjects.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => { setProjectId(project.id); setProjectOpen(false) }}
                              className={cn(
                                "w-full flex items-center gap-3 px-2 py-2.5 text-sm rounded-lg transition-colors text-left",
                                projectId === project.id ? "bg-accent" : "hover:bg-accent/50"
                              )}
                            >
                              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center shrink-0">
                                <FolderKanban className="h-4 w-4 text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold">{project.code}</p>
                                <p className="text-xs text-muted-foreground truncate">{project.name}</p>
                              </div>
                              {projectId === project.id && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Assignee */}
                    <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 gap-2">
                          {selectedAssignee ? (
                            <>
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-500 to-indigo-500 text-white">
                                  {selectedAssignee.initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="max-w-24 truncate font-medium">{selectedAssignee.name}</span>
                            </>
                          ) : (
                            <>
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Assigner</span>
                            </>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                          Responsable
                        </div>
                        {teamMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => { setAssignee(member.name); setAssigneeOpen(false) }}
                            className={cn(
                              "w-full flex items-center gap-3 px-2 py-2 text-sm rounded-lg transition-colors",
                              assignee === member.name ? "bg-accent" : "hover:bg-accent/50"
                            )}
                          >
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-indigo-500 text-white">
                                {member.initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-left">
                              <p className="font-medium">{member.name}</p>
                              <p className="text-xs text-muted-foreground">{member.role}</p>
                            </div>
                            {assignee === member.name && <Check className="h-4 w-4 text-blue-600" />}
                          </button>
                        ))}
                        {assignee && (
                          <>
                            <Separator className="my-2" />
                            <button
                              type="button"
                              onClick={() => { setAssignee(""); setAssigneeOpen(false) }}
                              className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-lg transition-colors text-red-600 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                              <span>Retirer l'assignation</span>
                            </button>
                          </>
                        )}
                      </PopoverContent>
                    </Popover>

                    {/* Due Date Quick */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 gap-2">
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          {dueDate ? (
                            <span className="font-medium">{format(dueDate, "d MMM", { locale: fr })}</span>
                          ) : (
                            <span className="text-muted-foreground">Échéance</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dueDate} onSelect={setDueDate} locale={fr} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Description Section */}
                <div className="bg-background rounded-xl border shadow-sm p-6 mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Description</h3>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Décrivez en détail ce qui doit être accompli..."
                    className="min-h-[140px] resize-none border-muted bg-slate-50/50 dark:bg-slate-900/50"
                  />
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Supporte le formatage Markdown</span>
                  </div>
                </div>

                {/* Properties Grid */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  {/* Dates Card */}
                  <div className="bg-background rounded-xl border shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Planification</h3>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Date de début</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start h-10 font-normal">
                              <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                              {startDate ? format(startDate, "d MMMM yyyy", { locale: fr }) : "Sélectionner"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={fr} />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Date d'échéance</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start h-10 font-normal">
                              <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                              {dueDate ? format(dueDate, "d MMMM yyyy", { locale: fr }) : "Sélectionner"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={dueDate} onSelect={setDueDate} locale={fr} />
                          </PopoverContent>
                        </Popover>
                      </div>
                      {daysUntilDue > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2">
                          <Info className="h-4 w-4" />
                          <span>Durée: <strong className="text-foreground">{daysUntilDue} jours</strong></span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Time & Resources Card */}
                  <div className="bg-background rounded-xl border shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Temps & Ressources</h3>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Temps estimé</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={estimatedHours}
                            onChange={(e) => setEstimatedHours(Number(e.target.value))}
                            className="h-10"
                            min={0}
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">heures</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          ≈ {(estimatedHours / 8).toFixed(1)} jour(s) de travail
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Équipe</Label>
                        <div className="relative">
                          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={team}
                            onChange={(e) => setTeam(e.target.value)}
                            placeholder="Ex: Développement"
                            className="pl-9 h-10"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tags & Options */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Tags Card */}
                  <div className="bg-background rounded-xl border shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Étiquettes</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="h-7 gap-1 pr-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border-0">
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 p-0.5 rounded hover:bg-blue-200"
                            title={`Supprimer ${tag}`}
                            aria-label={`Supprimer ${tag}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {tags.length === 0 && (
                        <span className="text-sm text-muted-foreground">Aucune étiquette</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Ajouter une étiquette..."
                        className="h-9"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddTag()
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={handleAddTag}
                        disabled={!newTag.trim()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Options Card */}
                  <div className="bg-background rounded-xl border shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <Flag className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Options</h3>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border border-violet-100 dark:border-violet-900">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                          <Target className="h-5 w-5 text-violet-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Jalon du projet</p>
                          <p className="text-xs text-muted-foreground">
                            Marquer comme étape importante
                          </p>
                        </div>
                      </div>
                      <Switch checked={isMilestone} onCheckedChange={setIsMilestone} />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Right Sidebar */}
          <div className="w-80 border-l bg-background overflow-hidden shrink-0">
            <ScrollArea className="h-full">
              <div className="p-6">
                {/* Preview Section */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-6 w-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                    <h3 className="text-sm font-semibold">Aperçu</h3>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border p-4 space-y-4">
                    {/* Title */}
                    <div>
                      <p className="font-semibold line-clamp-2">
                        {title || <span className="text-muted-foreground italic">Sans titre</span>}
                      </p>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1.5",
                          statusConfig[status].bg,
                          statusConfig[status].border,
                          statusConfig[status].color
                        )}
                      >
                        {(() => {
                          const Icon = statusConfig[status].icon
                          return <Icon className="h-3 w-3" />
                        })()}
                        {statusConfig[status].label}
                      </Badge>
                      <Badge variant="outline" className="gap-1.5">
                        <span className="text-xs">{priorityConfig[priority].icon}</span>
                        {priorityConfig[priority].label}
                      </Badge>
                    </div>

                    {/* Project */}
                    {selectedProject && (
                      <div className="flex items-center gap-2 text-sm">
                        <FolderKanban className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">{selectedProject.code}</span>
                        <span className="text-muted-foreground">-</span>
                        <span className="text-muted-foreground truncate">{selectedProject.name}</span>
                      </div>
                    )}

                    {/* Assignee */}
                    {selectedAssignee && (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-gradient-to-br from-blue-500 to-indigo-500 text-white">
                            {selectedAssignee.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{selectedAssignee.name}</span>
                      </div>
                    )}

                    {/* Dates */}
                    <div className="flex items-center justify-between text-sm pt-3 border-t">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {startDate && dueDate ? (
                            <>
                              {format(startDate, "d MMM", { locale: fr })} → {format(dueDate, "d MMM", { locale: fr })}
                            </>
                          ) : (
                            <span className="text-muted-foreground">Non défini</span>
                          )}
                        </span>
                      </div>
                      {daysUntilDue > 0 && (
                        <Badge variant="secondary" className="text-xs">{daysUntilDue}j</Badge>
                      )}
                    </div>

                    {/* Hours */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Charge</span>
                      </div>
                      <span className="font-semibold">{estimatedHours}h</span>
                    </div>

                    {/* Milestone */}
                    {isMilestone && (
                      <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 border-violet-200">
                        <Target className="h-3 w-3 mr-1" />
                        Jalon
                      </Badge>
                    )}

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                        {tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs bg-blue-50 text-blue-600 border-0">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="my-6" />

                {/* Notes Section */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-6 w-6 rounded-md bg-amber-100 flex items-center justify-center">
                      <FileText className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <h3 className="text-sm font-semibold">Notes personnelles</h3>
                  </div>
                  <Textarea
                    value={personalNotes}
                    onChange={(e) => setPersonalNotes(e.target.value)}
                    placeholder="Ajoutez vos notes privées..."
                    className="resize-none bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30 min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Info className="h-3 w-3" />
                    Visibles uniquement par vous
                  </p>
                </div>

                <Separator className="my-6" />

                {/* Quick Tips */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl p-4 border border-blue-100 dark:border-blue-900">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Conseils</h4>
                  </div>
                  <ul className="space-y-2 text-xs text-blue-800 dark:text-blue-200">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Un titre clair aide l'équipe à comprendre la tâche</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Les jalons marquent les étapes clés du projet</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Utilisez les étiquettes pour filtrer facilement</span>
                    </li>
                  </ul>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

export function TaskCreateContent() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center">Chargement...</div>}>
      <TaskCreateContentInner />
    </Suspense>
  )
}
