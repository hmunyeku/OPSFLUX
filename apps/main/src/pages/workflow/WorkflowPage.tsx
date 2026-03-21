/**
 * Workflow page — Professional workflow engine with visual editor.
 *
 * Three modes:
 * 1. List mode: Definitions tab + Instances tab with cards/tables
 * 2. Editor mode: React Flow canvas for editing a specific definition
 * 3. Instance detail: View instance state + execute transitions + history
 *
 * Design rules applied:
 * - No local search bar — uses globalSearch from uiStore (topbar)
 * - DangerConfirmButton for destructive actions in panels
 * - Edge condition & required_role editing (RBAC)
 * - Validation warnings panel before publish
 * - Undo/redo history stack
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GitBranch, Plus, Play, Pause, Archive, Copy, Send,
  CheckCircle2, Clock, ArrowRight, ArrowLeft, XCircle,
  User, Settings2, Bell, GitFork, Timer, Diamond,
  Loader2, Trash2, Tag, Eye, History,
  ChevronRight, MessageSquare, Zap, LayoutList,
  AlertTriangle, Undo2, Redo2, Shield, Code2,
  LayoutGrid, ArrowDownUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { usePageSize } from '@/hooks/usePageSize'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DangerConfirmButton } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import {
  useWorkflowDefinitions,
  useWorkflowDefinition,
  useCreateWorkflowDefinition,
  useUpdateWorkflowDefinition,
  usePublishWorkflowDefinition,
  useArchiveWorkflowDefinition,
  useCloneWorkflowDefinition,
  useWorkflowStats,
  useWorkflowInstances,
  useWorkflowInstance,
  useWorkflowInstanceHistory,
  useWorkflowTransition,
  useDeleteWorkflowDefinition,
} from '@/hooks/useWorkflow'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type {
  WorkflowDefinition,
  WorkflowDefinitionSummary,
  WorkflowInstance,
  WorkflowNodeDef,
  WorkflowEdgeDef,
} from '@/services/workflowService'

// ── React Flow imports ──
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const AVAILABLE_ROLES = [
  'DO', 'DPROD', 'HSE_ADMIN', 'SITE_MGR', 'PROJ_MGR',
  'MAINT_MGR', 'LOG_COORD', 'TRANSP_COORD', 'PAX_ADMIN',
  'CDS', 'CHSE', 'READER',
] as const

const NODE_TYPE_CONFIG: Record<WorkflowNodeDef['type'], {
  icon: React.ReactNode
  label: string
  color: string
  bgColor: string
  borderColor: string
  description: string
}> = {
  start: {
    icon: <Play size={16} />,
    label: 'Démarrage',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    borderColor: 'border-blue-300 dark:border-blue-700',
    description: 'Point d\'entrée du workflow',
  },
  human_validation: {
    icon: <User size={16} />,
    label: 'Validation humaine',
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-50 dark:bg-purple-950/40',
    borderColor: 'border-purple-300 dark:border-purple-700',
    description: 'Étape nécessitant une action humaine',
  },
  system_check: {
    icon: <Settings2 size={16} />,
    label: 'Vérification système',
    color: 'text-cyan-700 dark:text-cyan-300',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950/40',
    borderColor: 'border-cyan-300 dark:border-cyan-700',
    description: 'Contrôle automatique (compliance, quota...)',
  },
  notification: {
    icon: <Bell size={16} />,
    label: 'Notification',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-300 dark:border-amber-700',
    description: 'Envoi automatique de notification',
  },
  condition: {
    icon: <Diamond size={16} />,
    label: 'Condition',
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-50 dark:bg-orange-950/40',
    borderColor: 'border-orange-300 dark:border-orange-700',
    description: 'Branchement conditionnel',
  },
  parallel: {
    icon: <GitFork size={16} />,
    label: 'Parallèle',
    color: 'text-indigo-700 dark:text-indigo-300',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/40',
    borderColor: 'border-indigo-300 dark:border-indigo-700',
    description: 'Exécution de branches parallèles',
  },
  timer: {
    icon: <Timer size={16} />,
    label: 'Minuteur',
    color: 'text-teal-700 dark:text-teal-300',
    bgColor: 'bg-teal-50 dark:bg-teal-950/40',
    borderColor: 'border-teal-300 dark:border-teal-700',
    description: 'Délai d\'attente configuré',
  },
  end_approved: {
    icon: <CheckCircle2 size={16} />,
    label: 'Fin — Approuvé',
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    description: 'Terminaison avec approbation',
  },
  end_rejected: {
    icon: <XCircle size={16} />,
    label: 'Fin — Rejeté',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-50 dark:bg-red-950/40',
    borderColor: 'border-red-300 dark:border-red-700',
    description: 'Terminaison avec rejet',
  },
  end_cancelled: {
    icon: <Archive size={16} />,
    label: 'Fin — Annulé',
    color: 'text-zinc-600 dark:text-zinc-400',
    bgColor: 'bg-zinc-100 dark:bg-zinc-800/60',
    borderColor: 'border-zinc-300 dark:border-zinc-600',
    description: 'Terminaison par annulation',
  },
}

const MINIMAP_COLORS: Record<string, string> = {
  start: '#3b82f6',
  human_validation: '#a855f7',
  system_check: '#06b6d4',
  notification: '#f59e0b',
  condition: '#f97316',
  parallel: '#6366f1',
  timer: '#14b8a6',
  end_approved: '#10b981',
  end_rejected: '#ef4444',
  end_cancelled: '#71717a',
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  avis_sejour: 'Avis de Séjour',
  work_order: 'Ordre de Travail',
  purchase_order: 'Bon de Commande',
  asset: 'Asset',
  workflow: 'Général',
}

function entityTypeLabel(type: string): string {
  return ENTITY_TYPE_LABELS[type] || type
}

const EDGE_DEFAULTS = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
  style: { strokeWidth: 2 },
  labelStyle: { fontSize: 11, fontWeight: 600 },
  labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, rx: 4, ry: 4 },
  type: 'smoothstep' as const,
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-LAYOUT (dagre)
// ══════════════════════════════════════════════════════════════════════════════

const NODE_WIDTH = 180
const NODE_HEIGHT = 60

type LayoutDirection = 'TB' | 'LR'

/**
 * Compute hierarchical layout using dagre.
 * Direction: TB (top-to-bottom) or LR (left-to-right).
 * Returns new nodes with updated positions.
 */
function computeAutoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB',
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 80,
    edgesep: 30,
    marginx: 40,
    marginy: 40,
  })

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  return nodes.map((node) => {
    const dagreNode = g.node(node.id)
    if (!dagreNode) return node
    return {
      ...node,
      position: {
        x: Math.round((dagreNode.x - NODE_WIDTH / 2) / 20) * 20,
        y: Math.round((dagreNode.y - NODE_HEIGHT / 2) / 20) * 20,
      },
    }
  })
}

/**
 * Check if nodes need auto-layout (all stacked at origin or too close together).
 */
function needsAutoLayout(nodes: Node[]): boolean {
  if (nodes.length <= 1) return false
  const positions = nodes.map((n) => n.position)
  const allAtOrigin = positions.every((p) => p.x === 0 && p.y === 0)
  if (allAtOrigin) return true
  // Check if all nodes are in a tiny area (< 50px spread)
  const xs = positions.map((p) => p.x)
  const ys = positions.map((p) => p.y)
  const spreadX = Math.max(...xs) - Math.min(...xs)
  const spreadY = Math.max(...ys) - Math.min(...ys)
  return spreadX < 50 && spreadY < 50
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM NODE
// ══════════════════════════════════════════════════════════════════════════════

function WorkflowNode({ data, selected }: NodeProps) {
  const nodeType = (data.nodeType as WorkflowNodeDef['type']) || 'start'
  const config = NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.start
  const isStart = nodeType === 'start'
  const isEnd = nodeType.startsWith('end_')
  const isHighlighted = data.__highlighted as boolean

  return (
    <div className={cn(
      'rounded-md border shadow-sm transition-all',
      config.bgColor, config.borderColor,
      selected ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-md',
      isHighlighted && 'ring-2 ring-emerald-500 shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/50',
    )} style={{ minWidth: 130, maxWidth: 220 }}>
      {!isStart && (
        <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-muted-foreground !border-2 !border-background" />
      )}
      <div className="px-3 py-1.5">
        <div className={cn('flex items-center gap-1.5', config.color)}>
          {config.icon}
          <span className="text-xs font-semibold leading-tight truncate">
            {(data.label as string) || config.label}
          </span>
        </div>
        {typeof data.role === 'string' && data.role && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-0.5">
            <Shield size={8} className="shrink-0" /> {data.role}
          </p>
        )}
        {typeof data.expression === 'string' && data.expression && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5 font-mono flex items-center gap-0.5">
            <Code2 size={8} className="shrink-0" /> {data.expression}
          </p>
        )}
      </div>
      {!isEnd && (
        <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
      )}
    </div>
  )
}

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode }

// ══════════════════════════════════════════════════════════════════════════════
// CONVERTERS
// ══════════════════════════════════════════════════════════════════════════════

function definitionToFlow(def: WorkflowDefinition, highlightNodeId?: string): { nodes: Node[]; edges: Edge[] } {
  let nodes: Node[] = (def.nodes || []).map((n) => ({
    id: n.id,
    type: 'workflowNode',
    position: n.position || { x: 0, y: 0 },
    data: {
      label: n.label,
      nodeType: n.type,
      __highlighted: n.id === highlightNodeId,
      ...n.config,
    },
  }))

  const edges: Edge[] = (def.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || '',
    animated: e.trigger === 'auto',
    data: { condition: e.condition, required_role: e.required_role, trigger: e.trigger },
    ...EDGE_DEFAULTS,
  }))

  // Auto-layout if positions are missing or all stacked
  if (needsAutoLayout(nodes)) {
    nodes = computeAutoLayout(nodes, edges, 'TB')
  }

  return { nodes, edges }
}

function flowToDefinition(nodes: Node[], edges: Edge[]): { nodes: WorkflowNodeDef[]; edges: WorkflowEdgeDef[] } {
  const defNodes: WorkflowNodeDef[] = nodes.map((n) => ({
    id: n.id,
    type: (n.data.nodeType as WorkflowNodeDef['type']) || 'start',
    label: (n.data.label as string) || '',
    config: Object.fromEntries(
      Object.entries(n.data).filter(([k]) => !['label', 'nodeType', '__highlighted'].includes(k))
    ),
    position: n.position,
  }))

  const defEdges: WorkflowEdgeDef[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.label as string) || undefined,
    condition: (typeof e.data?.condition === 'string' ? e.data.condition : undefined) || undefined,
    required_role: (typeof e.data?.required_role === 'string' ? e.data.required_role : undefined) || undefined,
    trigger: e.animated ? 'auto' as const : 'human' as const,
  }))

  return { nodes: defNodes, edges: defEdges }
}

// ══════════════════════════════════════════════════════════════════════════════
// UNDO/REDO HOOK
// ══════════════════════════════════════════════════════════════════════════════

interface FlowSnapshot { nodes: Node[]; edges: Edge[] }

function useUndoRedo(_initialNodes: Node[], _initialEdges: Edge[]) {
  const [past, setPast] = useState<FlowSnapshot[]>([])
  const [future, setFuture] = useState<FlowSnapshot[]>([])
  const lastSaved = useRef<FlowSnapshot | null>(null)

  const saveSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
    const snap: FlowSnapshot = { nodes: structuredClone(nodes), edges: structuredClone(edges) }
    // Deduplicate: don't save if identical to last
    if (lastSaved.current &&
      JSON.stringify(lastSaved.current.nodes.map(n => ({ id: n.id, pos: n.position }))) ===
      JSON.stringify(snap.nodes.map(n => ({ id: n.id, pos: n.position }))) &&
      lastSaved.current.edges.length === snap.edges.length
    ) return
    setPast(p => [...p.slice(-30), snap])
    setFuture([])
    lastSaved.current = snap
  }, [])

  const undo = useCallback((): FlowSnapshot | null => {
    if (past.length === 0) return null
    const prev = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    return prev
  }, [past])

  const redo = useCallback((): FlowSnapshot | null => {
    if (future.length === 0) return null
    const next = future[0]
    setFuture(f => f.slice(1))
    return next
  }, [future])

  const pushToFuture = useCallback((snap: FlowSnapshot) => {
    setFuture(f => [snap, ...f.slice(0, 30)])
  }, [])

  return { saveSnapshot, undo, redo, pushToFuture, canUndo: past.length > 0, canRedo: future.length > 0 }
}

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATION ENGINE
// ══════════════════════════════════════════════════════════════════════════════

interface ValidationIssue {
  severity: 'error' | 'warning'
  message: string
  nodeId?: string
}

function validateWorkflow(nodes: Node[], edges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const nodeTypes = new Set(nodes.map(n => n.data.nodeType as string))
  const nodeIds = new Set(nodes.map(n => n.id))

  // Must have start node
  if (!nodeTypes.has('start')) {
    issues.push({ severity: 'error', message: 'Le workflow doit contenir un noeud de démarrage (start)' })
  }

  // Must have at least one end node
  const endTypes = ['end_approved', 'end_rejected', 'end_cancelled']
  if (!endTypes.some(t => nodeTypes.has(t))) {
    issues.push({ severity: 'error', message: 'Le workflow doit contenir au moins un noeud de fin' })
  }

  // At least 2 nodes
  if (nodes.length < 2) {
    issues.push({ severity: 'error', message: 'Le workflow doit contenir au moins 2 noeuds' })
  }

  // At least 1 edge
  if (edges.length === 0) {
    issues.push({ severity: 'error', message: 'Le workflow doit contenir au moins une transition' })
  }

  // Edge references must be valid
  for (const e of edges) {
    if (!nodeIds.has(e.source)) {
      issues.push({ severity: 'error', message: `Transition référence un noeud source inexistant: '${e.source}'` })
    }
    if (!nodeIds.has(e.target)) {
      issues.push({ severity: 'error', message: `Transition référence un noeud cible inexistant: '${e.target}'` })
    }
  }

  // Disconnected nodes (no edges in or out)
  const connectedIds = new Set<string>()
  for (const e of edges) { connectedIds.add(e.source); connectedIds.add(e.target) }
  for (const n of nodes) {
    if (!connectedIds.has(n.id)) {
      issues.push({ severity: 'warning', message: `Le noeud "${n.data.label || n.id}" n'est connecté à aucune transition`, nodeId: n.id })
    }
  }

  // human_validation without role
  for (const n of nodes) {
    if (n.data.nodeType === 'human_validation' && !n.data.role) {
      issues.push({ severity: 'warning', message: `Noeud "${n.data.label}" : aucun rôle requis défini`, nodeId: n.id })
    }
    if (n.data.nodeType === 'condition' && !n.data.expression) {
      issues.push({ severity: 'warning', message: `Noeud "${n.data.label}" : aucune expression conditionnelle`, nodeId: n.id })
    }
    if (n.data.nodeType === 'timer' && !n.data.duration_hours) {
      issues.push({ severity: 'warning', message: `Noeud "${n.data.label}" : aucune durée configurée`, nodeId: n.id })
    }
    if (n.data.nodeType === 'system_check' && !n.data.check_name) {
      issues.push({ severity: 'warning', message: `Noeud "${n.data.label}" : aucun check système défini`, nodeId: n.id })
    }
    if (n.data.nodeType === 'notification' && !n.data.template) {
      issues.push({ severity: 'warning', message: `Noeud "${n.data.label}" : aucun template de notification`, nodeId: n.id })
    }
  }

  // Start node should have outgoing edges only
  const startNodes = nodes.filter(n => n.data.nodeType === 'start')
  for (const s of startNodes) {
    const incoming = edges.filter(e => e.target === s.id)
    if (incoming.length > 0) {
      issues.push({ severity: 'warning', message: 'Le noeud de démarrage ne devrait pas avoir de transitions entrantes' })
    }
  }

  // End nodes should have no outgoing edges
  const endNodes = nodes.filter(n => (n.data.nodeType as string)?.startsWith('end_'))
  for (const s of endNodes) {
    const outgoing = edges.filter(e => e.source === s.id)
    if (outgoing.length > 0) {
      issues.push({ severity: 'warning', message: `Le noeud de fin "${s.data.label}" ne devrait pas avoir de transitions sortantes` })
    }
  }

  return issues
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOATING TOOLBOX
// ══════════════════════════════════════════════════════════════════════════════

const TOOLBOX_CATEGORIES = [
  { label: 'Flux', types: ['start', 'condition', 'parallel', 'timer'] as const },
  { label: 'Actions', types: ['human_validation', 'system_check', 'notification'] as const },
  { label: 'Fin', types: ['end_approved', 'end_rejected', 'end_cancelled'] as const },
]

function EditorToolbox({ onAddNode }: { onAddNode: (type: WorkflowNodeDef['type']) => void }) {
  const [collapsed, setCollapsed] = useState(false)

  const onDragStart = useCallback((event: React.DragEvent, type: string) => {
    event.dataTransfer.setData('application/reactflow-nodetype', type)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  return (
    <div className={cn(
      'absolute top-2 left-2 z-10 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg transition-all overflow-hidden',
      collapsed ? 'w-8' : 'w-[150px]',
    )}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        <GitBranch size={12} />
        {!collapsed && <span className="flex-1 text-left uppercase tracking-wider">Blocs</span>}
        <ArrowLeft size={10} className={cn('transition-transform', collapsed && 'rotate-180')} />
      </button>
      {!collapsed && (
        <div className="px-1.5 pb-1.5 space-y-1">
          {TOOLBOX_CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <p className="text-[8px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-1 mb-0.5">{cat.label}</p>
              {cat.types.map((key) => {
                const config = NODE_TYPE_CONFIG[key]
                return (
                  <button
                    key={key}
                    type="button"
                    draggable
                    onClick={() => onAddNode(key)}
                    onDragStart={(e) => onDragStart(e, key)}
                    className={cn(
                      'w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left cursor-grab active:cursor-grabbing',
                      'hover:bg-accent/60 transition-colors',
                      config.color,
                    )}
                    title={config.description}
                  >
                    {config.icon}
                    <span className="text-[10px] font-medium text-foreground truncate">{config.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE CONFIG PANEL (professional — with descriptions & role picker)
// ══════════════════════════════════════════════════════════════════════════════

function NodeConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: {
  node: Node
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const nodeType = (node.data.nodeType as WorkflowNodeDef['type']) || 'start'
  const config = NODE_TYPE_CONFIG[nodeType]

  return (
    <div className="w-[260px] shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <span className={config.color}>{config.icon}</span>
          <h3 className="text-xs font-semibold text-foreground">{config.label}</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <XCircle size={14} />
        </button>
      </div>

      {/* Description */}
      <div className="px-3 pt-2 pb-1">
        <p className="text-[10px] text-muted-foreground italic">{config.description}</p>
      </div>

      <div className="p-3 space-y-3">
        {/* Label — all node types */}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Label</label>
          <input
            type="text"
            className="gl-form-input text-xs w-full"
            defaultValue={(node.data.label as string) || ''}
            onBlur={(e) => onUpdate(node.id, { ...node.data, label: e.target.value })}
          />
        </div>

        {/* human_validation: Role picker with dropdown */}
        {nodeType === 'human_validation' && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Shield size={10} className="inline mr-0.5" /> Rôle(s) requis
            </label>
            <select
              className="gl-form-input text-xs w-full mb-1"
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                const existing = (node.data.role as string) || ''
                const roles = existing ? existing.split(',').map(r => r.trim()) : []
                if (!roles.includes(e.target.value)) {
                  roles.push(e.target.value)
                  onUpdate(node.id, { ...node.data, role: roles.join(', ') })
                }
                e.target.value = ''
              }}
            >
              <option value="">Ajouter un rôle...</option>
              {AVAILABLE_ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input
              type="text"
              className="gl-form-input text-xs w-full font-mono"
              placeholder="CDS, CHSE, DO..."
              defaultValue={(node.data.role as string) || ''}
              onBlur={(e) => onUpdate(node.id, { ...node.data, role: e.target.value })}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              L'utilisateur doit posséder au moins un de ces rôles pour valider cette étape.
            </p>
          </div>
        )}

        {/* condition: Expression */}
        {nodeType === 'condition' && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Code2 size={10} className="inline mr-0.5" /> Expression
            </label>
            <input
              type="text"
              className="gl-form-input text-xs w-full font-mono"
              placeholder="pax_count > quota"
              defaultValue={(node.data.expression as string) || ''}
              onBlur={(e) => onUpdate(node.id, { ...node.data, expression: e.target.value })}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              Expression booléenne évaluée avec les données de l'instance.
            </p>
          </div>
        )}

        {/* timer: Duration */}
        {nodeType === 'timer' && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Timer size={10} className="inline mr-0.5" /> Durée (heures)
            </label>
            <input
              type="number"
              className="gl-form-input text-xs w-full"
              placeholder="48"
              min={0}
              step={0.5}
              defaultValue={(node.data.duration_hours as number) || ''}
              onBlur={(e) => onUpdate(node.id, { ...node.data, duration_hours: Number(e.target.value) })}
            />
          </div>
        )}

        {/* notification: Template */}
        {nodeType === 'notification' && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Bell size={10} className="inline mr-0.5" /> Template
            </label>
            <input
              type="text"
              className="gl-form-input text-xs w-full"
              placeholder="notify_creator"
              defaultValue={(node.data.template as string) || ''}
              onBlur={(e) => onUpdate(node.id, { ...node.data, template: e.target.value })}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              Identifiant du template email/notification à envoyer.
            </p>
          </div>
        )}

        {/* system_check: Check name */}
        {nodeType === 'system_check' && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Settings2 size={10} className="inline mr-0.5" /> Check système
            </label>
            <input
              type="text"
              className="gl-form-input text-xs w-full font-mono"
              placeholder="check_hse_compliance"
              defaultValue={(node.data.check_name as string) || ''}
              onBlur={(e) => onUpdate(node.id, { ...node.data, check_name: e.target.value })}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              Nom du hook système appelé automatiquement à cette étape.
            </p>
          </div>
        )}

        {/* Delete — DangerConfirmButton pattern */}
        <div className="pt-2 border-t border-border/50">
          <DangerConfirmButton
            icon={<Trash2 size={12} />}
            onConfirm={() => { onDelete(node.id); onClose() }}
            confirmLabel="Confirmer ?"
          >
            Supprimer ce noeud
          </DangerConfirmButton>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CONFIG PANEL (professional — with condition & required_role)
// ══════════════════════════════════════════════════════════════════════════════

function EdgeConfigPanel({
  edge,
  onUpdate,
  onDelete,
  onClose,
}: {
  edge: Edge
  onUpdate: (id: string, changes: Partial<Edge>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="w-[260px] shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1">
          <ArrowRight size={12} /> Transition
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <XCircle size={14} />
        </button>
      </div>
      <div className="p-3 space-y-3">
        {/* Label */}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Label</label>
          <input
            type="text"
            className="gl-form-input text-xs w-full"
            defaultValue={(edge.label as string) || ''}
            placeholder="Approuver, Rejeter..."
            onBlur={(e) => onUpdate(edge.id, { label: e.target.value })}
          />
        </div>

        {/* Trigger type */}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">Déclenchement</label>
          <div className="flex gap-1">
            <button
              onClick={() => onUpdate(edge.id, { animated: false })}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                !edge.animated ? 'bg-primary/15 text-primary' : 'bg-accent/50 text-muted-foreground hover:bg-accent',
              )}
            >
              <User size={10} className="inline mr-1" />Manuel
            </button>
            <button
              onClick={() => onUpdate(edge.id, { animated: true })}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                edge.animated ? 'bg-primary/15 text-primary' : 'bg-accent/50 text-muted-foreground hover:bg-accent',
              )}
            >
              <Zap size={10} className="inline mr-1" />Auto
            </button>
          </div>
        </div>

        {/* Condition (RBAC — new) */}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">
            <Code2 size={10} className="inline mr-0.5" /> Condition (optionnelle)
          </label>
          <input
            type="text"
            className="gl-form-input text-xs w-full font-mono"
            placeholder="result == 'compliant'"
            defaultValue={(edge.data?.condition as string) || ''}
            onBlur={(e) => onUpdate(edge.id, { data: { ...edge.data, condition: e.target.value || undefined } })}
          />
          <p className="text-[9px] text-muted-foreground mt-1">
            Expression évaluée pour autoriser la transition automatique.
          </p>
        </div>

        {/* Required Role (RBAC — new) */}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">
            <Shield size={10} className="inline mr-0.5" /> Rôle requis (RBAC)
          </label>
          <select
            className="gl-form-input text-xs w-full"
            value={(edge.data?.required_role as string) || ''}
            onChange={(e) => onUpdate(edge.id, { data: { ...edge.data, required_role: e.target.value || undefined } })}
          >
            <option value="">Aucun (tous autorisés)</option>
            {AVAILABLE_ROLES.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <p className="text-[9px] text-muted-foreground mt-1">
            Seuls les utilisateurs ayant ce rôle pourront déclencher cette transition.
          </p>
        </div>

        {/* Delete — DangerConfirmButton */}
        <div className="pt-2 border-t border-border/50">
          <DangerConfirmButton
            icon={<Trash2 size={10} />}
            onConfirm={() => { onDelete(edge.id); onClose() }}
            confirmLabel="Confirmer ?"
          >
            Supprimer la transition
          </DangerConfirmButton>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATION PANEL (bottom panel showing issues)
// ══════════════════════════════════════════════════════════════════════════════

function ValidationPanel({
  issues,
  onClose,
  onFocusNode,
}: {
  issues: ValidationIssue[]
  onClose: () => void
  onFocusNode: (nodeId: string) => void
}) {
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')

  return (
    <div className="border-t border-border bg-card shrink-0 max-h-[160px] overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <AlertTriangle size={12} className="text-amber-500" />
          Validation
          {errors.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">
              {errors.length} erreur{errors.length > 1 ? 's' : ''}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
              {warnings.length} avert.
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
          <XCircle size={12} />
        </button>
      </div>
      <div className="divide-y divide-border/30">
        {issues.map((issue, i) => (
          <div
            key={i}
            className={cn(
              'flex items-start gap-2 px-3 py-1.5 text-[11px]',
              issue.nodeId && 'cursor-pointer hover:bg-accent/30',
            )}
            onClick={() => issue.nodeId && onFocusNode(issue.nodeId)}
          >
            {issue.severity === 'error'
              ? <XCircle size={11} className="text-red-500 shrink-0 mt-0.5" />
              : <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />}
            <span className="text-foreground/80">{issue.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// WORKFLOW EDITOR
// ══════════════════════════════════════════════════════════════════════════════

function WorkflowEditor({
  definition,
  onSave,
  onBack,
  onPublish,
  onArchive,
  onClone,
  saving,
  canDelete = true,
}: {
  definition: WorkflowDefinition
  onSave: (nodes: WorkflowNodeDef[], edges: WorkflowEdgeDef[]) => void
  onBack: () => void
  onPublish: () => void
  onArchive: () => void
  onClone: () => void
  saving: boolean
  canDelete?: boolean
}) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner
        definition={definition}
        onSave={onSave}
        onBack={onBack}
        onPublish={onPublish}
        onArchive={onArchive}
        onClone={onClone}
        saving={saving}
        canDelete={canDelete}
      />
    </ReactFlowProvider>
  )
}

function WorkflowEditorInner({
  definition,
  onSave,
  onBack,
  onPublish,
  onArchive,
  onClone,
  saving,
  canDelete = true,
}: {
  definition: WorkflowDefinition
  onSave: (nodes: WorkflowNodeDef[], edges: WorkflowEdgeDef[]) => void
  onBack: () => void
  onPublish: () => void
  onArchive: () => void
  onClone: () => void
  saving: boolean
  canDelete?: boolean
}) {
  const { t } = useTranslation()
  const reactFlow = useReactFlow()
  const initial = useMemo(() => definitionToFlow(definition), [definition])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null)
  const [showValidation, setShowValidation] = useState(false)
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('TB')
  const nodeIdCounter = useRef(Date.now())
  const isDraft = definition.status === 'draft'

  // Undo/redo
  const { saveSnapshot, undo, redo, pushToFuture, canUndo, canRedo } = useUndoRedo(initial.nodes, initial.edges)

  // Auto-layout handler
  const handleAutoLayout = useCallback((direction?: LayoutDirection) => {
    const dir = direction || layoutDirection
    saveSnapshot(nodes, edges)
    const layoutedNodes = computeAutoLayout(nodes, edges, dir)
    setNodes(layoutedNodes)
    if (direction) setLayoutDirection(direction)
    // Fit view after layout
    setTimeout(() => reactFlow.fitView({ padding: 0.2, maxZoom: 1.8 }), 50)
  }, [nodes, edges, layoutDirection, saveSnapshot, setNodes, reactFlow])

  const handleUndo = useCallback(() => {
    const snap = undo()
    if (snap) {
      pushToFuture({ nodes: structuredClone(nodes), edges: structuredClone(edges) })
      setNodes(snap.nodes)
      setEdges(snap.edges)
      setSelectedNode(null)
      setSelectedEdge(null)
    }
  }, [undo, pushToFuture, nodes, edges, setNodes, setEdges])

  const handleRedo = useCallback(() => {
    const snap = redo()
    if (snap) {
      saveSnapshot(nodes, edges)
      setNodes(snap.nodes)
      setEdges(snap.edges)
      setSelectedNode(null)
      setSelectedEdge(null)
    }
  }, [redo, saveSnapshot, nodes, edges, setNodes, setEdges])

  // Validation
  const validationIssues = useMemo(() => validateWorkflow(nodes, edges), [nodes, edges])
  const hasErrors = validationIssues.some(i => i.severity === 'error')

  const onConnect = useCallback((connection: Connection) => {
    saveSnapshot(nodes, edges)
    setEdges((eds) => addEdge({
      ...connection,
      id: `e-${++nodeIdCounter.current}`,
      ...EDGE_DEFAULTS,
    }, eds))
  }, [setEdges, saveSnapshot, nodes, edges])

  const handleAddNode = useCallback((type: WorkflowNodeDef['type']) => {
    saveSnapshot(nodes, edges)
    const id = `n-${++nodeIdCounter.current}`
    const config = NODE_TYPE_CONFIG[type]
    const bounds = document.querySelector('.react-flow')?.getBoundingClientRect()
    const cx = (bounds?.left || 0) + (bounds?.width || 800) / 2
    const cy = (bounds?.top || 0) + (bounds?.height || 600) / 2
    const position = reactFlow.screenToFlowPosition({ x: cx, y: cy })
    const nearby = nodes.filter(n =>
      Math.abs(n.position.x - position.x) < 60 && Math.abs(n.position.y - position.y) < 60
    ).length
    position.x += nearby * 30
    position.y += nearby * 30
    position.x = Math.round(position.x / 20) * 20
    position.y = Math.round(position.y / 20) * 20

    setNodes((nds) => [...nds, {
      id, type: 'workflowNode', position,
      data: { label: config.label, nodeType: type },
    }])
  }, [setNodes, nodes, edges, reactFlow, saveSnapshot])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/reactflow-nodetype') as WorkflowNodeDef['type']
    if (!type || !NODE_TYPE_CONFIG[type]) return
    saveSnapshot(nodes, edges)
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    position.x = Math.round(position.x / 20) * 20
    position.y = Math.round(position.y / 20) * 20
    const id = `n-${++nodeIdCounter.current}`
    const config = NODE_TYPE_CONFIG[type]
    setNodes((nds) => [...nds, {
      id, type: 'workflowNode', position,
      data: { label: config.label, nodeType: type },
    }])
  }, [setNodes, reactFlow, saveSnapshot, nodes, edges])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node); setSelectedEdge(null)
  }, [])
  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge); setSelectedNode(null)
  }, [])
  const handlePaneClick = useCallback(() => {
    setSelectedNode(null); setSelectedEdge(null)
  }, [])

  const handleNodeUpdate = useCallback((id: string, data: Record<string, unknown>) => {
    saveSnapshot(nodes, edges)
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)))
  }, [setNodes, saveSnapshot, nodes, edges])

  const handleNodeDelete = useCallback((id: string) => {
    saveSnapshot(nodes, edges)
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
  }, [setNodes, setEdges, saveSnapshot, nodes, edges])

  const handleEdgeUpdate = useCallback((id: string, changes: Partial<Edge>) => {
    saveSnapshot(nodes, edges)
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, ...changes } : e)))
    setSelectedEdge((prev) => prev && prev.id === id ? { ...prev, ...changes } : prev)
  }, [setEdges, saveSnapshot, nodes, edges])

  const handleEdgeDelete = useCallback((id: string) => {
    saveSnapshot(nodes, edges)
    setEdges((eds) => eds.filter((e) => e.id !== id))
  }, [setEdges, saveSnapshot, nodes, edges])

  const handleSave = useCallback(() => {
    const result = flowToDefinition(nodes, edges)
    onSave(result.nodes, result.edges)
  }, [nodes, edges, onSave])

  const handleFocusNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (node) {
      reactFlow.fitView({ nodes: [node], padding: 0.5, maxZoom: 2 })
      setSelectedNode(node)
      setSelectedEdge(null)
    }
  }, [nodes, reactFlow])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (isDraft) handleSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (isDraft) handleUndo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (isDraft) handleRedo()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleSave, handleUndo, handleRedo, isDraft])

  return (
    <div className="flex flex-col h-full">
      {/* ── Editor Header ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">{definition.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
              definition.status === 'published'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : definition.status === 'draft'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
            )}>
              {definition.status === 'published' ? <Play size={9} /> : definition.status === 'draft' ? <Pause size={9} /> : <Archive size={9} />}
              {t(`workflow.${definition.status}`)}
            </span>
            <span className="text-[10px] text-muted-foreground">v{definition.version}</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-[10px] font-medium">
              <Tag size={8} />
              {entityTypeLabel(definition.entity_type)}
            </span>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-1.5">
          {/* Undo/Redo (draft only) */}
          {isDraft && (
            <>
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-30"
                title="Annuler (Ctrl+Z)"
              >
                <Undo2 size={14} />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-30"
                title="Rétablir (Ctrl+Y)"
              >
                <Redo2 size={14} />
              </button>
              <div className="w-px h-5 bg-border" />
            </>
          )}

          {/* Auto-layout */}
          {isDraft && (
            <>
              <button
                onClick={() => handleAutoLayout('TB')}
                className={cn(
                  'p-1.5 rounded-md hover:bg-accent text-muted-foreground',
                  layoutDirection === 'TB' && 'bg-accent/60 text-foreground',
                )}
                title="Auto-layout vertical (haut → bas)"
              >
                <ArrowDownUp size={14} />
              </button>
              <button
                onClick={() => handleAutoLayout('LR')}
                className={cn(
                  'p-1.5 rounded-md hover:bg-accent text-muted-foreground',
                  layoutDirection === 'LR' && 'bg-accent/60 text-foreground',
                )}
                title="Auto-layout horizontal (gauche → droite)"
              >
                <LayoutGrid size={14} />
              </button>
              <div className="w-px h-5 bg-border" />
            </>
          )}

          {/* Validation toggle */}
          <button
            onClick={() => setShowValidation(!showValidation)}
            className={cn(
              'gl-button-sm text-[10px]',
              hasErrors
                ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                : validationIssues.length > 0
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400',
            )}
          >
            {hasErrors ? <XCircle size={11} /> : validationIssues.length > 0 ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
            {validationIssues.length > 0 ? `${validationIssues.length}` : 'OK'}
          </button>

          <div className="w-px h-5 bg-border" />

          {/* Clone */}
          <button onClick={onClone} className="gl-button-sm gl-button-default text-[10px]" title={t('workflow.clone')}>
            <Copy size={11} /> {t('workflow.clone')}
          </button>

          {/* Publish (draft only) */}
          {isDraft && (
            <button
              onClick={onPublish}
              disabled={hasErrors}
              className="gl-button-sm text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 disabled:opacity-40 disabled:cursor-not-allowed"
              title={hasErrors ? 'Corrigez les erreurs avant de publier' : t('workflow.publish')}
            >
              <Send size={11} /> {t('workflow.publish')}
            </button>
          )}

          {/* Archive (published only) */}
          {definition.status === 'published' && canDelete && (
            <button onClick={onArchive} className="gl-button-sm gl-button-default text-[10px]">
              <Archive size={11} /> {t('workflow.archive')}
            </button>
          )}

          {/* Save (draft only) */}
          {isDraft && (
            <>
              <div className="w-px h-5 bg-border" />
              <span className="text-[10px] text-muted-foreground hidden sm:block">Ctrl+S</span>
              <button onClick={handleSave} disabled={saving} className="gl-button-sm gl-button-confirm">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {t('workflow.save')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Editor body ── */}
      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-w-0 flex flex-col" onDragOver={onDragOver} onDrop={onDrop}>
          <div className="relative flex-1 min-h-0">
            {isDraft && <EditorToolbox onAddNode={handleAddNode} />}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={isDraft ? onNodesChange : undefined}
              onEdgesChange={isDraft ? onEdgesChange : undefined}
              onConnect={isDraft ? onConnect : undefined}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onPaneClick={handlePaneClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.8 }}
              minZoom={0.15}
              maxZoom={2.5}
              snapToGrid
              snapGrid={[20, 20]}
              deleteKeyCode={isDraft ? ['Backspace', 'Delete'] : []}
              className="bg-background"
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={EDGE_DEFAULTS}
            >
              <Background gap={20} size={1} color="var(--border)" />
              <Controls position="bottom-left" showInteractive={false} className="!bg-card !border-border !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent" />
              <MiniMap
                position="bottom-right"
                nodeStrokeWidth={2}
                nodeColor={(node) => MINIMAP_COLORS[(node.data.nodeType as string)] || '#71717a'}
                className="!bg-card !border-border !rounded-lg"
                maskColor="rgba(0,0,0,0.15)"
                pannable
                zoomable
              />
              {!isDraft && (
                <Panel position="top-center">
                  <div className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md text-xs font-medium shadow-sm">
                    {t('workflow.read_only')}
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>

          {/* Validation panel (bottom) */}
          {showValidation && validationIssues.length > 0 && (
            <ValidationPanel
              issues={validationIssues}
              onClose={() => setShowValidation(false)}
              onFocusNode={handleFocusNode}
            />
          )}
        </div>

        {selectedNode && isDraft && (
          <NodeConfigPanel node={selectedNode} onUpdate={handleNodeUpdate} onDelete={handleNodeDelete} onClose={() => setSelectedNode(null)} />
        )}
        {selectedEdge && isDraft && (
          <EdgeConfigPanel edge={selectedEdge} onUpdate={handleEdgeUpdate} onDelete={handleEdgeDelete} onClose={() => setSelectedEdge(null)} />
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// INSTANCE DETAIL PANEL
// ══════════════════════════════════════════════════════════════════════════════

function InstanceDetailPanel({
  instanceId,
  onBack,
}: {
  instanceId: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: instance, isLoading } = useWorkflowInstance(instanceId)
  const { data: history, isLoading: historyLoading } = useWorkflowInstanceHistory(instanceId)
  const { data: definition } = useWorkflowDefinition(instance?.workflow_definition_id || '')
  const transitionMut = useWorkflowTransition()
  const [comment, setComment] = useState('')
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null)

  const handleTransition = useCallback((toState: string) => {
    transitionMut.mutate(
      { id: instanceId, to_state: toState, comment: comment || undefined },
      {
        onSuccess: () => {
          toast({ title: `Transition vers "${toState}" effectuée`, variant: 'success' })
          setComment('')
          setSelectedTransition(null)
        },
        onError: (err: Error) => {
          toast({ title: 'Erreur de transition', description: err.message, variant: 'error' })
        },
      },
    )
  }, [instanceId, comment, transitionMut, toast])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!instance) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm text-muted-foreground">Instance introuvable</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">
            {instance.definition_name || 'Instance'}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-[10px] font-medium">
              <Tag size={8} /> {entityTypeLabel(instance.entity_type)}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">{instance.entity_id_ref.slice(0, 8)}...</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Workflow diagram */}
        <div className="flex-1 min-w-0">
          {definition ? (
            <ReactFlowProvider>
              <InstanceFlowView definition={definition} currentState={instance.current_state} />
            </ReactFlowProvider>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> Chargement du diagramme...
            </div>
          )}
        </div>

        {/* Right: State + Actions + History */}
        <div className="w-[280px] shrink-0 border-l border-border bg-card overflow-y-auto">
          {/* Current state */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{t('workflow.current_state')}</p>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-sm font-semibold">
                <Zap size={14} />
                {instance.current_state}
              </span>
            </div>
          </div>

          {/* Allowed transitions */}
          {instance.allowed_transitions && instance.allowed_transitions.length > 0 && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{t('workflow.transition_to')}</p>
              <div className="space-y-1.5">
                {instance.allowed_transitions.map((target) => (
                  <div key={target}>
                    <button
                      onClick={() => setSelectedTransition(selectedTransition === target ? null : target)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left',
                        selectedTransition === target
                          ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                          : 'bg-accent/50 text-foreground hover:bg-accent',
                      )}
                    >
                      <ChevronRight size={12} className={cn('transition-transform', selectedTransition === target && 'rotate-90')} />
                      {target}
                    </button>
                    {selectedTransition === target && (
                      <div className="mt-1.5 pl-4 space-y-1.5">
                        <textarea
                          className="gl-form-input text-xs w-full min-h-[50px] resize-y"
                          placeholder={t('workflow.transition_comment')}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <button
                          onClick={() => handleTransition(target)}
                          disabled={transitionMut.isPending}
                          className="gl-button-sm gl-button-confirm w-full text-[10px]"
                        >
                          {transitionMut.isPending
                            ? <Loader2 size={10} className="animate-spin" />
                            : <Play size={10} />}
                          {t('workflow.execute_transition')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transition history */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <History size={10} className="inline mr-1" />
              {t('workflow.history')}
            </p>
            {historyLoading && (
              <div className="flex justify-center py-4">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {!historyLoading && (!history || history.length === 0) && (
              <p className="text-xs text-muted-foreground italic">Aucune transition enregistrée</p>
            )}
            {!historyLoading && history && history.length > 0 && (
              <div className="space-y-0">
                {history.map((tr, i) => (
                  <div key={tr.id} className="relative pl-4 pb-3">
                    {i < history.length - 1 && (
                      <div className="absolute left-[7px] top-3 bottom-0 w-px bg-border" />
                    )}
                    <div className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-2 border-primary bg-background flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[10px] font-medium text-foreground">
                        <span className="text-muted-foreground">{tr.from_state}</span>
                        <ArrowRight size={8} className="text-muted-foreground/50" />
                        <span className="text-primary">{tr.to_state}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {new Date(tr.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {tr.comment && (
                        <p className="text-[9px] text-muted-foreground/80 mt-0.5 flex items-start gap-1">
                          <MessageSquare size={8} className="mt-0.5 shrink-0" />
                          {tr.comment}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InstanceFlowView({ definition, currentState }: { definition: WorkflowDefinition; currentState: string }) {
  const flow = useMemo(() => {
    const result = definitionToFlow(definition, currentState)
    // Always auto-layout for instance view for clean display
    const layouted = computeAutoLayout(result.nodes, result.edges, 'TB')
    return { nodes: layouted, edges: result.edges }
  }, [definition, currentState])

  return (
    <ReactFlow
      nodes={flow.nodes}
      edges={flow.edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1.5 }}
      minZoom={0.15}
      maxZoom={2.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      className="bg-background"
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="var(--border)" />
      <Controls position="bottom-left" showInteractive={false} className="!bg-card !border-border !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent" />
      <MiniMap
        position="bottom-right"
        nodeStrokeWidth={2}
        nodeColor={(node) => MINIMAP_COLORS[(node.data.nodeType as string)] || '#71717a'}
        className="!bg-card !border-border !rounded-lg"
        maskColor="rgba(0,0,0,0.15)"
        pannable
        zoomable
      />
    </ReactFlow>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STATUS FILTER TABS
// ══════════════════════════════════════════════════════════════════════════════

function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: string
  onChange: (v: string) => void
  counts: Record<string, number>
}) {
  const { t } = useTranslation()
  const tabs = [
    { key: '', label: t('workflow.all'), count: Object.values(counts).reduce((a, b) => a + b, 0) },
    { key: 'draft', label: t('workflow.draft'), count: counts.draft || 0 },
    { key: 'published', label: t('workflow.published'), count: counts.published || 0 },
    { key: 'archived', label: t('workflow.archived'), count: counts.archived || 0 },
  ]

  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            value === tab.key
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className="ml-1 text-[10px] bg-accent rounded-full px-1.5">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DEFINITION CARD
// ══════════════════════════════════════════════════════════════════════════════

function DefinitionCard({
  def,
  stats,
  onOpen,
  onPublish,
  onArchive,
  onClone,
  onDelete,
  onViewInstances,
  canDelete = true,
}: {
  def: WorkflowDefinitionSummary
  stats?: { total: number; by_state: Record<string, number> }
  onOpen: () => void
  onPublish: () => void
  onArchive: () => void
  onClone: () => void
  onDelete: () => void
  onViewInstances: () => void
  canDelete?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className="rounded-md border border-border bg-card hover:bg-accent/20 transition-colors cursor-pointer group"
      onClick={onOpen}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-[13px] font-semibold text-foreground truncate">{def.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <span className={cn(
              'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[10px] font-medium leading-none',
              def.status === 'published'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : def.status === 'draft'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
            )}>
              {def.status === 'published' ? <Play size={8} /> : def.status === 'draft' ? <Pause size={8} /> : <Archive size={8} />}
              {t(`workflow.${def.status}`)}
            </span>
            <span className="text-[10px] text-muted-foreground leading-none">v{def.version}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400 font-medium">
            <Tag size={7} />
            {entityTypeLabel(def.entity_type)}
          </span>
          <span className="flex items-center gap-0.5">
            <CheckCircle2 size={10} /> {def.node_count}
          </span>
          <span className="flex items-center gap-0.5">
            <ArrowRight size={10} /> {def.edge_count}
          </span>
          {stats && stats.total > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewInstances() }}
              className="flex items-center gap-0.5 text-primary hover:underline"
            >
              <Clock size={10} /> {stats.total}
            </button>
          )}
        </div>

        {def.description && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{def.description}</p>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {def.status === 'draft' && (
          <>
            <button onClick={onPublish} className="gl-button-sm gl-button-confirm text-[10px]">
              <Send size={9} /> {t('workflow.publish')}
            </button>
            {canDelete && (
              <button onClick={onDelete} className="gl-button-sm gl-button-danger text-[10px]">
                <Trash2 size={9} /> Supprimer
              </button>
            )}
          </>
        )}
        {def.status === 'published' && (
          <>
            {canDelete && (
              <button onClick={onArchive} className="gl-button-sm gl-button-default text-[10px]">
                <Archive size={9} /> {t('workflow.archive')}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onViewInstances() }} className="gl-button-sm gl-button-default text-[10px]">
              <Eye size={9} /> Instances
            </button>
          </>
        )}
        <button onClick={onClone} className="gl-button-sm gl-button-default text-[10px]">
          <Copy size={9} /> {t('workflow.clone')}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// INSTANCE TABLE
// ══════════════════════════════════════════════════════════════════════════════

function InstancesTable({
  definitionFilter,
  onViewInstance,
}: {
  definitionFilter?: string
  onViewInstance: (id: string) => void
}) {
  const { t } = useTranslation()
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useWorkflowInstances({
    definition_id: definitionFilter,
    page_size: pageSize,
  })

  const instances = useMemo(() => {
    const items = data?.items || []
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((i) =>
      (i.definition_name || '').toLowerCase().includes(q)
      || i.entity_type.toLowerCase().includes(q)
      || i.current_state.toLowerCase().includes(q)
    )
  }, [data?.items, search])

  const columns = useMemo<ColumnDef<WorkflowInstance, unknown>[]>(() => [
    {
      id: 'workflow',
      header: 'Workflow',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-foreground">
          {row.original.definition_name || row.original.workflow_definition_id.slice(0, 8)}
        </span>
      ),
    },
    {
      accessorKey: 'entity_type',
      header: t('workflow.entity_type'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400 text-[10px] font-medium">
          <Tag size={8} /> {entityTypeLabel(row.original.entity_type)}
        </span>
      ),
    },
    {
      id: 'ref',
      header: 'Ref',
      cell: ({ row }) => (
        <span className="text-[11px] font-mono text-muted-foreground">
          {row.original.entity_id_ref.slice(0, 8)}...
        </span>
      ),
    },
    {
      accessorKey: 'current_state',
      header: t('workflow.current_state'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">
          <Zap size={9} /> {row.original.current_state}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-[11px] text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <button className="p-1 rounded hover:bg-accent text-muted-foreground">
          <Eye size={12} />
        </button>
      ),
      size: 40,
    },
  ], [t])

  return (
    <DataTable
      columns={columns}
      data={instances}
      isLoading={isLoading}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Rechercher par workflow, état…"
      onRowClick={(row) => onViewInstance(row.id)}
      emptyIcon={LayoutList}
      emptyTitle={t('workflow.no_instances')}
      importExport={{
        exportFormats: ['csv', 'xlsx'],
        advancedExport: true,
        filenamePrefix: 'workflows',
        exportHeaders: {
          entity_type: 'Type entite',
          current_state: 'Etat courant',
          created_at: 'Date',
        },
      }}
      storageKey="workflow-instances"
    />
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE DEFINITION DIALOG
// ══════════════════════════════════════════════════════════════════════════════

function CreateDialog({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (name: string, description: string, entityType: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [entityType, setEntityType] = useState('workflow')

  const ENTITY_TYPE_OPTIONS = [
    { value: 'workflow', label: 'Général' },
    { value: 'avis_sejour', label: 'Avis de Séjour (AdS)' },
    { value: 'work_order', label: 'Ordre de Travail' },
    { value: 'purchase_order', label: 'Bon de Commande' },
    { value: 'asset', label: 'Asset' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground mb-4">Nouveau workflow</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Nom</label>
            <input
              type="text"
              className="gl-form-input text-sm w-full"
              placeholder="Validation AdS — Standard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('workflow.entity_type')}</label>
            <select
              className="gl-form-input text-sm w-full"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              {ENTITY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Associe ce workflow à un type d'objet métier spécifique.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Description</label>
            <textarea
              className="gl-form-input text-sm w-full min-h-[60px] resize-y"
              placeholder="Processus de validation en 2 étapes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="gl-button-sm gl-button-default">Annuler</button>
          <button
            onClick={() => { onCreate(name, description, entityType); onClose() }}
            disabled={!name.trim()}
            className="gl-button-sm gl-button-confirm"
          >
            <Plus size={12} /> Créer
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export function WorkflowPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()

  // ── Permissions ──
  const { hasPermission } = usePermission()
  const canCreate = hasPermission('workflow.definition.create')
  // canUpdate reserved for future inline-edit gating: hasPermission('workflow.definition.update')
  const canDelete = hasPermission('workflow.definition.read') // only admins should delete

  // ── Global search from topbar (no local search bar) ──
  const { pageSize } = usePageSize()
  const search = useUIStore((s) => s.globalSearch)

  // ── Navigation state ──
  const [activeTab, setActiveTab] = useState<'definitions' | 'instances'>('definitions')
  const [statusFilter, setStatusFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingInstanceId, setViewingInstanceId] = useState<string | null>(null)
  const [instanceDefinitionFilter, setInstanceDefinitionFilter] = useState<string | undefined>(undefined)
  const [showCreate, setShowCreate] = useState(false)

  // ── Data ──
  const { data: defsData, isLoading } = useWorkflowDefinitions({
    status: statusFilter || undefined,
    search: search || undefined,
    page_size: pageSize,
  })
  const { data: editingDef } = useWorkflowDefinition(editingId || '')
  const { data: stats } = useWorkflowStats()

  // ── Mutations ──
  const createMut = useCreateWorkflowDefinition()
  const updateMut = useUpdateWorkflowDefinition()
  const publishMut = usePublishWorkflowDefinition()
  const archiveMut = useArchiveWorkflowDefinition()
  const cloneMut = useCloneWorkflowDefinition()
  const deleteMut = useDeleteWorkflowDefinition()

  const handleCreate = useCallback((name: string, description: string, entityType: string) => {
    createMut.mutate(
      {
        name,
        description,
        entity_type: entityType,
        nodes: [
          { id: 'n-start', type: 'start', label: 'Démarrage', config: {}, position: { x: 250, y: 50 } },
          { id: 'n-end', type: 'end_approved', label: 'Approuvé', config: {}, position: { x: 250, y: 300 } },
        ],
        edges: [],
      },
      {
        onSuccess: (def) => {
          toast({ title: 'Workflow créé', variant: 'success' })
          setEditingId(def.id)
        },
      },
    )
  }, [createMut, toast])

  const handleSave = useCallback((nodes: WorkflowNodeDef[], edges: WorkflowEdgeDef[]) => {
    if (!editingId) return
    updateMut.mutate(
      { id: editingId, payload: { nodes, edges } },
      { onSuccess: () => toast({ title: 'Workflow enregistré', variant: 'success' }) },
    )
  }, [editingId, updateMut, toast])

  const handlePublish = useCallback((id: string) => {
    publishMut.mutate(id, {
      onSuccess: () => toast({ title: 'Workflow publié', variant: 'success' }),
      onError: (err: Error) => {
        const detail = (err as any)?.response?.data?.detail
        if (typeof detail === 'object' && detail?.errors) {
          toast({
            title: t('workflow.publish_error'),
            description: detail.errors.join('\n'),
            variant: 'error',
          })
        } else {
          toast({ title: t('workflow.publish_error'), description: String(detail || err.message), variant: 'error' })
        }
      },
    })
  }, [publishMut, toast, t])

  const handleArchive = useCallback((id: string) => {
    archiveMut.mutate(id, {
      onSuccess: () => toast({ title: 'Workflow archivé', variant: 'success' }),
    })
  }, [archiveMut, toast])

  const handleClone = useCallback((id: string) => {
    cloneMut.mutate(id, {
      onSuccess: (def) => {
        toast({ title: 'Workflow cloné', variant: 'success' })
        setEditingId(def.id)
      },
    })
  }, [cloneMut, toast])

  const handleDelete = useCallback(async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Supprimer ce workflow ?',
      message: `Le workflow « ${name} » sera supprimé définitivement. Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      variant: 'danger',
    })
    if (!ok) return
    deleteMut.mutate(id, {
      onSuccess: () => toast({ title: 'Workflow supprimé', variant: 'success' }),
      onError: (err: Error) => {
        const detail = (err as any)?.response?.data?.detail
        toast({ title: 'Erreur', description: String(detail || err.message), variant: 'error' })
      },
    })
  }, [deleteMut, toast, confirm])

  // ── Computed ──
  const statusCounts = useMemo(() => {
    const items = defsData?.items || []
    return {
      draft: items.filter((d) => d.status === 'draft').length,
      published: items.filter((d) => d.status === 'published').length,
      archived: items.filter((d) => d.status === 'archived').length,
    }
  }, [defsData])

  const statsMap = useMemo(() => {
    const map: Record<string, { total: number; by_state: Record<string, number> }> = {}
    for (const s of stats || []) {
      const byState: Record<string, number> = {}
      if (Array.isArray(s.by_state)) {
        for (const b of s.by_state) byState[b.state] = b.count
      }
      map[s.definition_id] = { total: s.total, by_state: byState }
    }
    return map
  }, [stats])

  // ═══ Instance detail mode ═══
  if (viewingInstanceId) {
    return (
      <InstanceDetailPanel
        instanceId={viewingInstanceId}
        onBack={() => setViewingInstanceId(null)}
      />
    )
  }

  // ═══ Editor mode ═══
  if (editingId && editingDef) {
    return (
      <WorkflowEditor
        definition={editingDef}
        onSave={handleSave}
        onBack={() => setEditingId(null)}
        onPublish={() => handlePublish(editingId)}
        onArchive={() => handleArchive(editingId)}
        onClone={() => handleClone(editingId)}
        saving={updateMut.isPending}
        canDelete={canDelete}
      />
    )
  }

  // ═══ List mode ═══
  return (
    <div className="flex flex-col h-full">
      <PanelHeader icon={GitBranch} title={t('workflow.title')} subtitle={t('workflow.subtitle')}>
        {canCreate && <ToolbarButton icon={Plus} label={t('workflow.create')} variant="primary" onClick={() => setShowCreate(true)} />}
      </PanelHeader>

      <PanelContent className="p-4">
        {/* ── Top bar: Tabs only (search comes from topbar) ── */}
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-0.5 bg-accent/30 rounded-lg p-0.5">
            <button
              onClick={() => { setActiveTab('definitions'); setInstanceDefinitionFilter(undefined) }}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === 'definitions'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <GitBranch size={12} className="inline mr-1.5" />
              {t('workflow.definitions')}
            </button>
            <button
              onClick={() => { setActiveTab('instances'); setInstanceDefinitionFilter(undefined) }}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === 'instances'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutList size={12} className="inline mr-1.5" />
              {t('workflow.instance_list')}
            </button>
          </div>

          {/* Status filter (definitions tab only) */}
          {activeTab === 'definitions' && (
            <StatusFilter value={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
          )}
        </div>

        {/* ═══ Definitions Tab ═══ */}
        {activeTab === 'definitions' && (
          <div className="mt-1">
            {isLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && (!defsData?.items || defsData.items.length === 0) && (
              <EmptyState
                icon={GitBranch}
                title="Aucun workflow"
                description="Créez votre premier workflow pour automatiser vos processus métiers."
                action={canCreate ? { label: 'Nouveau workflow', onClick: () => setShowCreate(true) } : undefined}
              />
            )}

            {!isLoading && defsData?.items && defsData.items.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {defsData.items.map((def) => (
                  <DefinitionCard
                    key={def.id}
                    def={def}
                    stats={statsMap[def.id]}
                    onOpen={() => setEditingId(def.id)}
                    onPublish={() => handlePublish(def.id)}
                    onArchive={() => handleArchive(def.id)}
                    onClone={() => handleClone(def.id)}
                    onDelete={() => handleDelete(def.id, def.name)}
                    onViewInstances={() => {
                      setInstanceDefinitionFilter(def.id)
                      setActiveTab('instances')
                    }}
                    canDelete={canDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ Instances Tab ═══ */}
        {activeTab === 'instances' && (
          <div className="mt-1">
            {instanceDefinitionFilter && (
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-xs text-muted-foreground">Filtrée par définition :</span>
                <span className="text-xs font-medium text-foreground">{instanceDefinitionFilter.slice(0, 8)}...</span>
                <button
                  onClick={() => setInstanceDefinitionFilter(undefined)}
                  className="text-xs text-primary hover:underline"
                >
                  Voir toutes
                </button>
              </div>
            )}
            <InstancesTable
              definitionFilter={instanceDefinitionFilter}
              onViewInstance={(id) => setViewingInstanceId(id)}
            />
          </div>
        )}
      </PanelContent>

      {showCreate && (
        <CreateDialog
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
