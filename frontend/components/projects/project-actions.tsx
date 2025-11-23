"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useProjectPermissions, Can } from "@/hooks/use-project-permissions"
import type { Project, ProjectStatus } from "@/lib/projects-api"
import {
  MoreVertical,
  Edit,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  Download,
  Share2,
  Star,
  StarOff,
  Eye,
  Play,
  Pause,
  XCircle,
  CheckCircle,
  FileText,
  FileSpreadsheet,
  FileJson,
  ExternalLink,
  Send,
  Link2,
} from "lucide-react"

interface ProjectActionsProps {
  project: Project
  onUpdate?: (project: Project) => void
  onDelete?: (projectId: string) => void
  variant?: "dropdown" | "buttons"
  size?: "sm" | "default"
}

const statusTransitions: Record<ProjectStatus, { label: string; icon: typeof Play; nextStatus: ProjectStatus }[]> = {
  draft: [
    { label: "Demarrer la planification", icon: Play, nextStatus: "planning" },
  ],
  planning: [
    { label: "Activer le projet", icon: Play, nextStatus: "active" },
    { label: "Mettre en pause", icon: Pause, nextStatus: "on-hold" },
  ],
  active: [
    { label: "Mettre en pause", icon: Pause, nextStatus: "on-hold" },
    { label: "Marquer comme termine", icon: CheckCircle, nextStatus: "completed" },
    { label: "Annuler le projet", icon: XCircle, nextStatus: "cancelled" },
  ],
  "on-hold": [
    { label: "Reprendre le projet", icon: Play, nextStatus: "active" },
    { label: "Annuler le projet", icon: XCircle, nextStatus: "cancelled" },
  ],
  completed: [
    { label: "Archiver", icon: Archive, nextStatus: "archived" },
  ],
  cancelled: [
    { label: "Reprendre le projet", icon: Play, nextStatus: "active" },
    { label: "Archiver", icon: Archive, nextStatus: "archived" },
  ],
  archived: [
    { label: "Restaurer", icon: ArchiveRestore, nextStatus: "active" },
  ],
}

export function ProjectActions({
  project,
  onUpdate,
  onDelete,
  variant = "dropdown",
  size = "default",
}: ProjectActionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { canEdit, canDelete, canArchive, canExport } = useProjectPermissions({
    projectId: project.id,
  })

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [duplicateName, setDuplicateName] = useState(`${project.name} (copie)`)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    setIsProcessing(true)
    try {
      // In production, call API
      // await ProjectsApi.updateStatus(project.id, newStatus)

      const statusLabels: Record<ProjectStatus, string> = {
        draft: "Brouillon",
        planning: "Planification",
        active: "Actif",
        "on-hold": "En pause",
        completed: "Termine",
        cancelled: "Annule",
        archived: "Archive",
      }

      toast({
        title: "Statut mis a jour",
        description: `Le projet est maintenant "${statusLabels[newStatus]}".`,
      })

      if (onUpdate) {
        onUpdate({ ...project, status: newStatus })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de changer le statut du projet.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleToggleFavorite = async () => {
    try {
      const newFavorite = !project.isFavorite
      toast({
        title: newFavorite ? "Ajoute aux favoris" : "Retire des favoris",
        description: newFavorite
          ? "Le projet a ete ajoute a vos favoris."
          : "Le projet a ete retire de vos favoris.",
      })

      if (onUpdate) {
        onUpdate({ ...project, isFavorite: newFavorite })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Operation impossible.",
      })
    }
  }

  const handleArchive = async () => {
    setIsProcessing(true)
    try {
      const isArchived = project.status === "archived"
      const newStatus = isArchived ? "active" : "archived"

      toast({
        title: isArchived ? "Projet restaure" : "Projet archive",
        description: isArchived
          ? "Le projet a ete restaure."
          : "Le projet a ete archive.",
      })

      if (onUpdate) {
        onUpdate({ ...project, status: newStatus as ProjectStatus })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Operation impossible.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDuplicate = async () => {
    setIsProcessing(true)
    try {
      // In production, call API
      // const duplicated = await ProjectsApi.duplicate(project.id, duplicateName)

      toast({
        title: "Projet duplique",
        description: `Le projet "${duplicateName}" a ete cree.`,
      })

      setShowDuplicateDialog(false)

      // Redirect to the new project or refresh list
      // router.push(`/projects/${duplicated.id}`)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de dupliquer le projet.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async () => {
    setIsProcessing(true)
    try {
      // In production, call API
      // await ProjectsApi.delete(project.id)

      toast({
        title: "Projet supprime",
        description: "Le projet a ete supprime avec succes.",
      })

      setShowDeleteDialog(false)

      if (onDelete) {
        onDelete(project.id)
      } else {
        router.push("/projects/list")
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer le projet.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExport = async (format: "pdf" | "xlsx" | "json") => {
    setIsProcessing(true)
    try {
      // In production, call API and download
      // const blob = await ProjectsApi.export(project.id, format)
      // downloadBlob(blob, `${project.code}_export.${format}`)

      toast({
        title: "Export en cours",
        description: `Le projet sera exporte au format ${format.toUpperCase()}.`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'exporter le projet.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopyLink = () => {
    const url = `${window.location.origin}/projects/${project.id}`
    navigator.clipboard.writeText(url)
    toast({
      title: "Lien copie",
      description: "Le lien du projet a ete copie dans le presse-papiers.",
    })
  }

  const availableTransitions = statusTransitions[project.status] || []
  const isArchived = project.status === "archived"

  if (variant === "buttons") {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size={size} onClick={() => router.push(`/projects/${project.id}`)}>
          <Eye className="h-4 w-4 mr-2" />
          Voir
        </Button>

        <Can permission="project:edit" projectId={project.id}>
          <Button variant="outline" size={size} onClick={() => router.push(`/projects/${project.id}/edit`)}>
            <Edit className="h-4 w-4 mr-2" />
            Modifier
          </Button>
        </Can>

        <ProjectActionsDropdown
          project={project}
          onStatusChange={handleStatusChange}
          onToggleFavorite={handleToggleFavorite}
          onArchive={handleArchive}
          onDuplicate={() => setShowDuplicateDialog(true)}
          onDelete={() => setShowDeleteDialog(true)}
          onExport={handleExport}
          onCopyLink={handleCopyLink}
          availableTransitions={availableTransitions}
          isArchived={isArchived}
          size={size}
        />

        {/* Dialogs */}
        <DeleteDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDelete}
          projectName={project.name}
          isProcessing={isProcessing}
        />

        <DuplicateDialog
          open={showDuplicateDialog}
          onOpenChange={setShowDuplicateDialog}
          onConfirm={handleDuplicate}
          name={duplicateName}
          onNameChange={setDuplicateName}
          isProcessing={isProcessing}
        />
      </div>
    )
  }

  return (
    <>
      <ProjectActionsDropdown
        project={project}
        onStatusChange={handleStatusChange}
        onToggleFavorite={handleToggleFavorite}
        onArchive={handleArchive}
        onDuplicate={() => setShowDuplicateDialog(true)}
        onDelete={() => setShowDeleteDialog(true)}
        onExport={handleExport}
        onCopyLink={handleCopyLink}
        availableTransitions={availableTransitions}
        isArchived={isArchived}
        size={size}
      />

      {/* Dialogs */}
      <DeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        projectName={project.name}
        isProcessing={isProcessing}
      />

      <DuplicateDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        onConfirm={handleDuplicate}
        name={duplicateName}
        onNameChange={setDuplicateName}
        isProcessing={isProcessing}
      />
    </>
  )
}

// Dropdown component
function ProjectActionsDropdown({
  project,
  onStatusChange,
  onToggleFavorite,
  onArchive,
  onDuplicate,
  onDelete,
  onExport,
  onCopyLink,
  availableTransitions,
  isArchived,
  size,
}: {
  project: Project
  onStatusChange: (status: ProjectStatus) => void
  onToggleFavorite: () => void
  onArchive: () => void
  onDuplicate: () => void
  onDelete: () => void
  onExport: (format: "pdf" | "xlsx" | "json") => void
  onCopyLink: () => void
  availableTransitions: { label: string; icon: typeof Play; nextStatus: ProjectStatus }[]
  isArchived: boolean
  size: "sm" | "default"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size === "sm" ? "sm" : "icon"} className={size === "sm" ? "h-8 w-8 p-0" : ""}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Quick Actions */}
        <DropdownMenuItem onClick={onToggleFavorite}>
          {project.isFavorite ? (
            <>
              <StarOff className="h-4 w-4 mr-2" />
              Retirer des favoris
            </>
          ) : (
            <>
              <Star className="h-4 w-4 mr-2" />
              Ajouter aux favoris
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onCopyLink}>
          <Link2 className="h-4 w-4 mr-2" />
          Copier le lien
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Status Transitions */}
        {availableTransitions.length > 0 && (
          <>
            {availableTransitions.map((transition) => (
              <DropdownMenuItem
                key={transition.nextStatus}
                onClick={() => onStatusChange(transition.nextStatus)}
              >
                <transition.icon className="h-4 w-4 mr-2" />
                {transition.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Edit & Duplicate */}
        <Can permission="project:edit" projectId={project.id}>
          <DropdownMenuItem asChild>
            <a href={`/projects/${project.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Modifier
            </a>
          </DropdownMenuItem>
        </Can>

        <Can permission="project:duplicate" projectId={project.id}>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            Dupliquer
          </DropdownMenuItem>
        </Can>

        {/* Export */}
        <Can permission="project:export" projectId={project.id}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download className="h-4 w-4 mr-2" />
              Exporter
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => onExport("pdf")}>
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("xlsx")}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("json")}>
                <FileJson className="h-4 w-4 mr-2" />
                Export JSON
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Can>

        <DropdownMenuSeparator />

        {/* Archive */}
        <Can permission="project:archive" projectId={project.id}>
          <DropdownMenuItem onClick={onArchive}>
            {isArchived ? (
              <>
                <ArchiveRestore className="h-4 w-4 mr-2" />
                Restaurer
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 mr-2" />
                Archiver
              </>
            )}
          </DropdownMenuItem>
        </Can>

        {/* Delete */}
        <Can permission="project:delete" projectId={project.id}>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </DropdownMenuItem>
        </Can>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Delete confirmation dialog
function DeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  projectName,
  isProcessing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  projectName: string
  isProcessing: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer le projet ?</AlertDialogTitle>
          <AlertDialogDescription>
            Vous etes sur le point de supprimer definitivement le projet{" "}
            <strong>"{projectName}"</strong>. Cette action est irreversible et toutes les
            donnees associees (taches, documents, historique) seront perdues.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isProcessing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isProcessing ? "Suppression..." : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Duplicate dialog
function DuplicateDialog({
  open,
  onOpenChange,
  onConfirm,
  name,
  onNameChange,
  isProcessing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  name: string
  onNameChange: (name: string) => void
  isProcessing: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dupliquer le projet</DialogTitle>
          <DialogDescription>
            Une copie du projet sera creee avec toutes ses donnees (sauf l'historique).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="duplicate-name">Nom du nouveau projet</Label>
            <Input
              id="duplicate-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Nom du projet"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Annuler
          </Button>
          <Button onClick={onConfirm} disabled={isProcessing || !name.trim()}>
            {isProcessing ? "Duplication..." : "Dupliquer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
