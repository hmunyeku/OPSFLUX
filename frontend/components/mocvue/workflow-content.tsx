"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Plus,
  Save,
  Trash2,
  Settings,
  GitBranch,
  CheckCircle2,
  XCircle,
  Circle,
  ArrowRight,
  Users,
  FileCheck,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ReactFlow,
  type Node,
  type Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  MarkerType,
  BackgroundVariant,
  Panel,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

interface WorkflowNode {
  id: string
  type: "start" | "approval" | "condition" | "end"
  label: string
  x: number
  y: number
  config?: {
    approvers?: string[]
    conditions?: { field: string; operator: string; value: string }[]
    disciplines?: string[]
  }
}

interface WorkflowConnection {
  from: string
  to: string
  label?: string
}

interface Workflow {
  id: string
  name: string
  description: string
  mocType: string
  nodes: WorkflowNode[]
  connections: WorkflowConnection[]
  status: "draft" | "active" | "archived"
  createdAt: string
  updatedAt: string
}

const mockWorkflows: Workflow[] = [
  {
    id: "wf-1",
    name: "MOC Sécurité Standard",
    description: "Workflow de validation pour les MOC de type Sécurité",
    mocType: "safety",
    status: "active",
    createdAt: "2025-01-15",
    updatedAt: "2025-01-20",
    nodes: [
      { id: "start", type: "start", label: "Début", x: 100, y: 100 },
      {
        id: "safety-review",
        type: "approval",
        label: "Revue Sécurité",
        x: 300,
        y: 100,
        config: { approvers: ["HSE Manager"], disciplines: ["Safety"] },
      },
      {
        id: "ops-review",
        type: "approval",
        label: "Revue Opérations",
        x: 500,
        y: 100,
        config: { approvers: ["Operations Manager"] },
      },
      {
        id: "final-approval",
        type: "approval",
        label: "Approbation Finale",
        x: 700,
        y: 100,
        config: { approvers: ["Site Manager"] },
      },
      { id: "end", type: "end", label: "Fin", x: 900, y: 100 },
    ],
    connections: [
      { from: "start", to: "safety-review" },
      { from: "safety-review", to: "ops-review" },
      { from: "ops-review", to: "final-approval" },
      { from: "final-approval", to: "end" },
    ],
  },
  {
    id: "wf-2",
    name: "MOC Opérationnel avec Conditions",
    description: "Workflow avec branchement conditionnel selon le champ",
    mocType: "operational",
    status: "active",
    createdAt: "2025-01-10",
    updatedAt: "2025-01-18",
    nodes: [
      { id: "start", type: "start", label: "Début", x: 100, y: 200 },
      {
        id: "condition-1",
        type: "condition",
        label: "Champ = Drilling?",
        x: 300,
        y: 200,
        config: { conditions: [{ field: "field", operator: "equals", value: "drilling" }] },
      },
      {
        id: "drilling-review",
        type: "approval",
        label: "Revue Drilling",
        x: 500,
        y: 100,
        config: { approvers: ["Drilling Engineer"], disciplines: ["Drilling"] },
      },
      {
        id: "production-review",
        type: "approval",
        label: "Revue Production",
        x: 500,
        y: 300,
        config: { approvers: ["Production Engineer"], disciplines: ["Production"] },
      },
      {
        id: "final-approval",
        type: "approval",
        label: "Approbation Finale",
        x: 700,
        y: 200,
        config: { approvers: ["Operations Manager"] },
      },
      { id: "end", type: "end", label: "Fin", x: 900, y: 200 },
    ],
    connections: [
      { from: "start", to: "condition-1" },
      { from: "condition-1", to: "drilling-review", label: "Oui" },
      { from: "condition-1", to: "production-review", label: "Non" },
      { from: "drilling-review", to: "final-approval" },
      { from: "production-review", to: "final-approval" },
      { from: "final-approval", to: "end" },
    ],
  },
  {
    id: "wf-3",
    name: "MOC Technique Multi-Disciplines",
    description: "Workflow nécessitant validation de plusieurs disciplines",
    mocType: "technical",
    status: "draft",
    createdAt: "2025-01-22",
    updatedAt: "2025-01-22",
    nodes: [
      { id: "start", type: "start", label: "Début", x: 100, y: 150 },
      {
        id: "mech-review",
        type: "approval",
        label: "Revue Mécanique",
        x: 300,
        y: 100,
        config: { approvers: ["Mechanical Engineer"], disciplines: ["Mechanical"] },
      },
      {
        id: "elec-review",
        type: "approval",
        label: "Revue Électrique",
        x: 300,
        y: 200,
        config: { approvers: ["Electrical Engineer"], disciplines: ["Electrical"] },
      },
      {
        id: "process-review",
        type: "approval",
        label: "Revue Process",
        x: 500,
        y: 150,
        config: { approvers: ["Process Engineer"], disciplines: ["Process"] },
      },
      {
        id: "final-approval",
        type: "approval",
        label: "Approbation Finale",
        x: 700,
        y: 150,
        config: { approvers: ["Technical Manager"] },
      },
      { id: "end", type: "end", label: "Fin", x: 900, y: 150 },
    ],
    connections: [
      { from: "start", to: "mech-review" },
      { from: "start", to: "elec-review" },
      { from: "mech-review", to: "process-review" },
      { from: "elec-review", to: "process-review" },
      { from: "process-review", to: "final-approval" },
      { from: "final-approval", to: "end" },
    ],
  },
]

const mocTypes = [
  { value: "safety", label: "Sécurité" },
  { value: "operational", label: "Opérationnel" },
  { value: "technical", label: "Technique" },
  { value: "environmental", label: "Environnemental" },
  { value: "organizational", label: "Organisationnel" },
]

const fields = [
  { value: "drilling", label: "Drilling" },
  { value: "production", label: "Production" },
  { value: "maintenance", label: "Maintenance" },
  { value: "construction", label: "Construction" },
  { value: "logistics", label: "Logistique" },
]

const disciplines = [
  "Mechanical",
  "Electrical",
  "Process",
  "Instrumentation",
  "Civil",
  "Safety",
  "Environmental",
  "Operations",
]

const approvers = [
  "HSE Manager",
  "Operations Manager",
  "Site Manager",
  "Technical Manager",
  "Drilling Engineer",
  "Production Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Process Engineer",
]

const StartNode = ({ data }: { data: any }) => (
  <div className="px-4 py-2 shadow-md rounded-md bg-green-50 border-2 border-green-500">
    <div className="flex items-center gap-2">
      <Circle className="h-4 w-4 text-green-600" />
      <div className="text-sm font-medium">{data.label}</div>
    </div>
  </div>
)

const ApprovalNode = ({ data }: { data: any }) => (
  <div className="px-4 py-3 shadow-md rounded-md bg-blue-50 border-2 border-blue-500 min-w-[180px]">
    <div className="flex items-center gap-2 mb-2">
      <CheckCircle2 className="h-4 w-4 text-blue-600" />
      <div className="text-sm font-medium">{data.label}</div>
    </div>
    {data.config?.approvers && data.config.approvers.length > 0 && (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        <span className="truncate">{data.config.approvers[0]}</span>
      </div>
    )}
    {data.config?.disciplines && data.config.disciplines.length > 0 && (
      <div className="flex gap-1 mt-1.5">
        {data.config.disciplines.slice(0, 2).map((d: string) => (
          <Badge key={d} variant="secondary" className="text-[9px] h-4 px-1">
            {d}
          </Badge>
        ))}
      </div>
    )}
  </div>
)

const ConditionNode = ({ data }: { data: any }) => (
  <div className="px-4 py-2 shadow-md rounded-md bg-yellow-50 border-2 border-yellow-500">
    <div className="flex items-center gap-2">
      <GitBranch className="h-4 w-4 text-yellow-600" />
      <div className="text-sm font-medium">{data.label}</div>
    </div>
  </div>
)

const EndNode = ({ data }: { data: any }) => (
  <div className="px-4 py-2 shadow-md rounded-md bg-red-50 border-2 border-red-500">
    <div className="flex items-center gap-2">
      <XCircle className="h-4 w-4 text-red-600" />
      <div className="text-sm font-medium">{data.label}</div>
    </div>
  </div>
)

const nodeTypes = {
  start: StartNode,
  approval: ApprovalNode,
  condition: ConditionNode,
  end: EndNode,
}

export function WorkflowContent() {
  const [workflows, setWorkflows] = useState<Workflow[]>(mockWorkflows)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showNodeDialog, setShowNodeDialog] = useState(false)
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [newNodeType, setNewNodeType] = useState<WorkflowNode["type"]>("approval")

  const convertToReactFlowNodes = (workflowNodes: WorkflowNode[]): Node[] => {
    return workflowNodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.x, y: node.y },
      data: { label: node.label, config: node.config },
    }))
  }

  const convertToReactFlowEdges = (connections: WorkflowConnection[]): Edge[] => {
    return connections.map((conn, idx) => ({
      id: `e${idx}-${conn.from}-${conn.to}`,
      source: conn.from,
      target: conn.to,
      label: conn.label,
      type: "smoothstep",
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
    }))
  }

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    if (selectedWorkflow) {
      setNodes(convertToReactFlowNodes(selectedWorkflow.nodes))
      setEdges(convertToReactFlowEdges(selectedWorkflow.connections))
    } else {
      setNodes([])
      setEdges([])
    }
  }, [selectedWorkflow, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection) => {
      if (!selectedWorkflow || !isEditing) return

      setEdges((eds) =>
        addEdge({ ...params, type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds),
      )

      const newConnection: WorkflowConnection = {
        from: params.source!,
        to: params.target!,
      }
      setSelectedWorkflow({
        ...selectedWorkflow,
        connections: [...selectedWorkflow.connections, newConnection],
      })
    },
    [selectedWorkflow, isEditing, setEdges],
  )

  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      if (!selectedWorkflow || !isEditing) return

      const updatedNodes = selectedWorkflow.nodes.map((n) =>
        n.id === node.id ? { ...n, x: node.position.x, y: node.position.y } : n,
      )
      setSelectedWorkflow({ ...selectedWorkflow, nodes: updatedNodes })
    },
    [selectedWorkflow, isEditing],
  )

  const onNodeClick = useCallback(
    (_event: any, node: Node) => {
      const workflowNode = selectedWorkflow?.nodes.find((n) => n.id === node.id)
      if (workflowNode) {
        setSelectedNode(workflowNode)
      }
    },
    [selectedWorkflow],
  )

  const handleCreateWorkflow = () => {
    const newWorkflow: Workflow = {
      id: `wf-${Date.now()}`,
      name: "Nouveau Workflow",
      description: "",
      mocType: "operational",
      status: "draft",
      createdAt: new Date().toISOString().split("T")[0],
      updatedAt: new Date().toISOString().split("T")[0],
      nodes: [
        { id: "start", type: "start", label: "Début", x: 100, y: 200 },
        { id: "end", type: "end", label: "Fin", x: 900, y: 200 },
      ],
      connections: [],
    }
    setWorkflows([...workflows, newWorkflow])
    setSelectedWorkflow(newWorkflow)
    setIsEditing(true)
  }

  const handleAddNode = () => {
    if (!selectedWorkflow) return

    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: newNodeType,
      label:
        newNodeType === "approval"
          ? "Nouvelle Approbation"
          : newNodeType === "condition"
            ? "Nouvelle Condition"
            : "Nouveau Nœud",
      x: 400,
      y: 200,
      config:
        newNodeType === "approval"
          ? { approvers: [], disciplines: [] }
          : newNodeType === "condition"
            ? { conditions: [] }
            : undefined,
    }

    setSelectedWorkflow({
      ...selectedWorkflow,
      nodes: [...selectedWorkflow.nodes, newNode],
    })
    setShowNodeDialog(false)
  }

  const handleSaveWorkflow = () => {
    if (!selectedWorkflow) return

    const updatedWorkflows = workflows.map((w) =>
      w.id === selectedWorkflow.id ? { ...selectedWorkflow, updatedAt: new Date().toISOString().split("T")[0] } : w,
    )
    setWorkflows(updatedWorkflows)
    setIsEditing(false)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-2 sm:p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">Workflows MOC</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Définissez visuellement les chemins de validation des MOC
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelectedWorkflow(null)}>
            <FileCheck className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Liste</span>
          </Button>
          <Button size="sm" onClick={handleCreateWorkflow}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nouveau</span>
          </Button>
        </div>
      </div>

      {!selectedWorkflow ? (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <Card
              key={workflow.id}
              className="p-3 hover:border-primary cursor-pointer"
              onClick={() => {
                setSelectedWorkflow(workflow)
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm">{workflow.name}</h3>
                    <Badge variant={getVariant(workflow.status)}>{getStatus(workflow.status)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{workflow.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 pt-3 border-t">
                <div className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  <span>{workflow.nodes.length} nœuds</span>
                </div>
                <div className="flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" />
                  <span>{workflow.connections.length} connexions</span>
                </div>
                <Badge variant="outline" className="text-[10px] h-5">
                  {mocTypes.find((t) => t.value === workflow.mocType)?.label}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row flex-1 gap-3 overflow-hidden">
          <Card className="flex-1 p-0 overflow-hidden relative min-h-[500px] lg:min-h-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={isEditing ? onNodesChange : undefined}
              onEdgesChange={isEditing ? onEdgesChange : undefined}
              onConnect={onConnect}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              nodesDraggable={isEditing}
              nodesConnectable={isEditing}
              elementsSelectable={isEditing}
            >
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
              <Controls showInteractive={false} />
              <MiniMap className="hidden lg:block" />

              <Panel position="top-right" className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setShowNodeDialog(true)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Ajouter Nœud</span>
                    </Button>
                    <Button size="sm" onClick={handleSaveWorkflow}>
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Enregistrer</span>
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setIsEditing(true)}>
                    <Settings className="mr-1.5 h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Modifier</span>
                  </Button>
                )}
              </Panel>
            </ReactFlow>
          </Card>

          <Card className="w-full lg:w-80 p-4 overflow-auto max-h-[400px] lg:max-h-none">
            <Tabs defaultValue="workflow">
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="workflow" className="text-xs">
                  Workflow
                </TabsTrigger>
                <TabsTrigger value="node" className="text-xs" disabled={!selectedNode}>
                  Nœud
                </TabsTrigger>
              </TabsList>

              <TabsContent value="workflow" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label className="text-xs">Nom du Workflow</Label>
                  <Input
                    value={selectedWorkflow.name}
                    onChange={(e) => setSelectedWorkflow({ ...selectedWorkflow, name: e.target.value })}
                    disabled={!isEditing}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={selectedWorkflow.description}
                    onChange={(e) => setSelectedWorkflow({ ...selectedWorkflow, description: e.target.value })}
                    disabled={!isEditing}
                    className="text-xs min-h-[60px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Type de MOC</Label>
                  <Select
                    value={selectedWorkflow.mocType}
                    onValueChange={(value) => setSelectedWorkflow({ ...selectedWorkflow, mocType: value })}
                    disabled={!isEditing}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {mocTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value} className="text-xs">
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Statut</Label>
                  <Select
                    value={selectedWorkflow.status}
                    onValueChange={(value: Workflow["status"]) =>
                      setSelectedWorkflow({ ...selectedWorkflow, status: value })
                    }
                    disabled={!isEditing}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft" className="text-xs">
                        Brouillon
                      </SelectItem>
                      <SelectItem value="active" className="text-xs">
                        Actif
                      </SelectItem>
                      <SelectItem value="archived" className="text-xs">
                        Archivé
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="pt-3 border-t space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Créé le</span>
                    <span>{selectedWorkflow.createdAt}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Modifié le</span>
                    <span>{selectedWorkflow.updatedAt}</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="node" className="space-y-3 mt-3">
                {selectedNode && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Libellé du Nœud</Label>
                      <Input
                        value={selectedNode.label}
                        onChange={(e) => {
                          const updatedNodes = selectedWorkflow.nodes.map((n) =>
                            n.id === selectedNode.id ? { ...n, label: e.target.value } : n,
                          )
                          setSelectedWorkflow({ ...selectedWorkflow, nodes: updatedNodes })
                          setSelectedNode({ ...selectedNode, label: e.target.value })
                        }}
                        disabled={!isEditing}
                        className="h-8 text-xs"
                      />
                    </div>

                    {selectedNode.type === "approval" && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs">Approbateurs</Label>
                          <div className="space-y-1.5">
                            {approvers.map((approver) => (
                              <div key={approver} className="flex items-center space-x-2">
                                <Checkbox
                                  id={approver}
                                  checked={selectedNode.config?.approvers?.includes(approver)}
                                  onCheckedChange={(checked) => {
                                    const currentApprovers = selectedNode.config?.approvers || []
                                    const newApprovers = checked
                                      ? [...currentApprovers, approver]
                                      : currentApprovers.filter((a) => a !== approver)

                                    const updatedNodes = selectedWorkflow.nodes.map((n) =>
                                      n.id === selectedNode.id
                                        ? { ...n, config: { ...n.config, approvers: newApprovers } }
                                        : n,
                                    )
                                    setSelectedWorkflow({ ...selectedWorkflow, nodes: updatedNodes })
                                    setSelectedNode({
                                      ...selectedNode,
                                      config: { ...selectedNode.config, approvers: newApprovers },
                                    })
                                  }}
                                  disabled={!isEditing}
                                  className="h-3.5 w-3.5"
                                />
                                <label htmlFor={approver} className="text-xs cursor-pointer">
                                  {approver}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Disciplines</Label>
                          <div className="space-y-1.5">
                            {disciplines.map((discipline) => (
                              <div key={discipline} className="flex items-center space-x-2">
                                <Checkbox
                                  id={discipline}
                                  checked={selectedNode.config?.disciplines?.includes(discipline)}
                                  onCheckedChange={(checked) => {
                                    const currentDisciplines = selectedNode.config?.disciplines || []
                                    const newDisciplines = checked
                                      ? [...currentDisciplines, discipline]
                                      : currentDisciplines.filter((d) => d !== discipline)

                                    const updatedNodes = selectedWorkflow.nodes.map((n) =>
                                      n.id === selectedNode.id
                                        ? { ...n, config: { ...n.config, disciplines: newDisciplines } }
                                        : n,
                                    )
                                    setSelectedWorkflow({ ...selectedWorkflow, nodes: updatedNodes })
                                    setSelectedNode({
                                      ...selectedNode,
                                      config: { ...selectedNode.config, disciplines: newDisciplines },
                                    })
                                  }}
                                  disabled={!isEditing}
                                  className="h-3.5 w-3.5"
                                />
                                <label htmlFor={discipline} className="text-xs cursor-pointer">
                                  {discipline}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {selectedNode.type === "condition" && (
                      <div className="space-y-2">
                        <Label className="text-xs">Conditions</Label>
                        <div className="space-y-2">
                          <Select disabled={!isEditing}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Champ" />
                            </SelectTrigger>
                            <SelectContent>
                              {fields.map((field) => (
                                <SelectItem key={field.value} value={field.value} className="text-xs">
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select disabled={!isEditing}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Opérateur" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equals" className="text-xs">
                                Égal à
                              </SelectItem>
                              <SelectItem value="not-equals" className="text-xs">
                                Différent de
                              </SelectItem>
                              <SelectItem value="contains" className="text-xs">
                                Contient
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Input placeholder="Valeur" disabled={!isEditing} className="h-8 text-xs" />
                        </div>
                      </div>
                    )}

                    {isEditing && selectedNode.type !== "start" && selectedNode.type !== "end" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          const updatedNodes = selectedWorkflow.nodes.filter((n) => n.id !== selectedNode.id)
                          const updatedConnections = selectedWorkflow.connections.filter(
                            (c) => c.from !== selectedNode.id && c.to !== selectedNode.id,
                          )
                          setSelectedWorkflow({
                            ...selectedWorkflow,
                            nodes: updatedNodes,
                            connections: updatedConnections,
                          })
                          setSelectedNode(null)
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Supprimer le Nœud
                      </Button>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      )}

      <Dialog open={showNodeDialog} onOpenChange={setShowNodeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un Nœud</DialogTitle>
            <DialogDescription>Sélectionnez le type de nœud à ajouter au workflow</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Card
                className={`p-4 cursor-pointer hover:border-primary ${
                  newNodeType === "approval" ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setNewNodeType("approval")}
              >
                <CheckCircle2 className="h-8 w-8 text-blue-500 mb-2" />
                <h4 className="font-medium text-sm">Approbation</h4>
                <p className="text-xs text-muted-foreground">Étape de validation</p>
              </Card>
              <Card
                className={`p-4 cursor-pointer hover:border-primary ${
                  newNodeType === "condition" ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setNewNodeType("condition")}
              >
                <GitBranch className="h-8 w-8 text-yellow-500 mb-2" />
                <h4 className="font-medium text-sm">Condition</h4>
                <p className="text-xs text-muted-foreground">Branchement conditionnel</p>
              </Card>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNodeDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddNode}>Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const getVariant = (status: Workflow["status"]) => {
  const variants = {
    draft: "secondary",
    active: "default",
    archived: "outline",
  } as const
  return variants[status]
}

const getStatus = (status: Workflow["status"]) => {
  return status === "draft" ? "Brouillon" : status === "active" ? "Actif" : "Archivé"
}
