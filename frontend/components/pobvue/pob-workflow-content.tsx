"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Plus, Edit2, Trash2, Play, Pause } from "lucide-react"

interface WorkflowStep {
  id: string
  order: number
  name: string
  type: "approval" | "notification" | "condition" | "action"
  assignee: string
  condition?: string
}

interface Workflow {
  id: string
  name: string
  description: string
  trigger: string
  status: "active" | "inactive"
  steps: WorkflowStep[]
}

const mockWorkflows: Workflow[] = [
  {
    id: "1",
    name: "Validation Standard",
    description: "Workflow de validation standard pour les avis de séjour",
    trigger: "Nouvelle demande",
    status: "active",
    steps: [
      { id: "1", order: 1, name: "Validation POB Manager", type: "approval", assignee: "POB Manager" },
      { id: "2", order: 2, name: "Vérification HSE", type: "approval", assignee: "HSE Coordinator" },
      { id: "3", order: 3, name: "Approbation finale", type: "approval", assignee: "Operations Manager" },
      { id: "4", order: 4, name: "Notification demandeur", type: "notification", assignee: "Système" },
    ],
  },
  {
    id: "2",
    name: "Validation Express",
    description: "Workflow accéléré pour les urgences",
    trigger: "Demande urgente",
    status: "active",
    steps: [
      { id: "1", order: 1, name: "Validation POB Manager", type: "approval", assignee: "POB Manager" },
      { id: "2", order: 2, name: "Notification HSE", type: "notification", assignee: "HSE Coordinator" },
    ],
  },
]

export function POBWorkflowContent() {
  const [workflows, setWorkflows] = useState<Workflow[]>(mockWorkflows)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const getStepTypeBadge = (type: string) => {
    switch (type) {
      case "approval":
        return <Badge variant="default">Approbation</Badge>
      case "notification":
        return <Badge variant="secondary">Notification</Badge>
      case "condition":
        return <Badge variant="outline">Condition</Badge>
      case "action":
        return <Badge>Action</Badge>
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Workflow de Validation</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Définissez les workflows de validation des avis de séjour
          </p>
        </div>
        <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <SheetTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nouveau Workflow
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Créer un Workflow</SheetTitle>
              <SheetDescription>Définissez les étapes de validation pour les avis de séjour</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 py-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Informations Générales</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom du workflow</Label>
                    <Input placeholder="Ex: Validation Standard" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input placeholder="Description du workflow" />
                  </div>
                  <div className="space-y-2">
                    <Label>Déclencheur</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Nouvelle demande</SelectItem>
                        <SelectItem value="urgent">Demande urgente</SelectItem>
                        <SelectItem value="modification">Modification</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Étapes du Workflow</CardTitle>
                  <CardDescription>Ajoutez les étapes de validation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" size="sm" className="w-full bg-transparent">
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter une étape
                  </Button>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={() => setIsCreateOpen(false)}>Créer</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Workflows List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {workflows.map((workflow) => (
          <Card key={workflow.id} className="cursor-pointer hover:border-primary transition-colors">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{workflow.name}</CardTitle>
                  <CardDescription>{workflow.description}</CardDescription>
                </div>
                <Badge variant={workflow.status === "active" ? "default" : "secondary"}>
                  {workflow.status === "active" ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Déclencheur:</span>
                <Badge variant="outline">{workflow.trigger}</Badge>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Étapes ({workflow.steps.length})</div>
                <div className="space-y-2">
                  {workflow.steps.map((step) => (
                    <div key={step.id} className="flex items-center gap-2 text-sm p-2 bg-muted rounded-md">
                      <span className="font-medium text-muted-foreground">{step.order}.</span>
                      <span className="flex-1">{step.name}</span>
                      {getStepTypeBadge(step.type)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="flex-1 bg-transparent">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Modifier
                </Button>
                <Button size="sm" variant="outline">
                  {workflow.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="outline">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
