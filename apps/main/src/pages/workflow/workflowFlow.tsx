import dagre from 'dagre'
import i18n from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  Archive,
  Bell,
  CheckCircle2,
  Code2,
  Diamond,
  GitFork,
  Play,
  Settings2,
  Shield,
  Timer,
  User,
  XCircle,
} from 'lucide-react'
import {
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import type { WorkflowDefinition, WorkflowEdgeDef, WorkflowNodeDef } from '@/services/workflowService'

export const NODE_TYPE_CONFIG: Record<WorkflowNodeDef['type'], {
  icon: React.ReactNode
  labelKey: string
  color: string        // text colour for icon + label
  bgColor: string      // node background
  borderColor: string  // node border
  accentBg: string     // solid left accent bar colour (for rectangle nodes)
  descriptionKey: string
}> = {
  start: {
    icon: <Play size={14} />,
    labelKey: 'workflow.node.start',
    color: 'text-white',
    bgColor: 'bg-blue-600 dark:bg-blue-700',
    borderColor: 'border-blue-700 dark:border-blue-800',
    accentBg: 'bg-blue-800',
    descriptionKey: 'workflow.node_desc.start',
  },
  human_validation: {
    icon: <User size={14} />,
    labelKey: 'workflow.node.human_validation',
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-white dark:bg-slate-900',
    borderColor: 'border-purple-200 dark:border-purple-800',
    accentBg: 'bg-purple-500',
    descriptionKey: 'workflow.node_desc.human_validation',
  },
  system_check: {
    icon: <Settings2 size={14} />,
    labelKey: 'workflow.node.system_check',
    color: 'text-cyan-700 dark:text-cyan-300',
    bgColor: 'bg-white dark:bg-slate-900',
    borderColor: 'border-cyan-200 dark:border-cyan-800',
    accentBg: 'bg-cyan-500',
    descriptionKey: 'workflow.node_desc.system_check',
  },
  notification: {
    icon: <Bell size={14} />,
    labelKey: 'workflow.node.notification',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-white dark:bg-slate-900',
    borderColor: 'border-amber-200 dark:border-amber-800',
    accentBg: 'bg-amber-500',
    descriptionKey: 'workflow.node_desc.notification',
  },
  condition: {
    icon: <Diamond size={14} />,
    labelKey: 'workflow.node.condition',
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-50 dark:bg-orange-950/40',
    borderColor: 'border-orange-300 dark:border-orange-600',
    accentBg: 'bg-orange-500',
    descriptionKey: 'workflow.node_desc.condition',
  },
  parallel: {
    icon: <GitFork size={14} />,
    labelKey: 'workflow.node.parallel',
    color: 'text-indigo-700 dark:text-indigo-300',
    bgColor: 'bg-white dark:bg-slate-900',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
    accentBg: 'bg-indigo-500',
    descriptionKey: 'workflow.node_desc.parallel',
  },
  timer: {
    icon: <Timer size={14} />,
    labelKey: 'workflow.node.timer',
    color: 'text-teal-700 dark:text-teal-300',
    bgColor: 'bg-white dark:bg-slate-900',
    borderColor: 'border-teal-200 dark:border-teal-800',
    accentBg: 'bg-teal-500',
    descriptionKey: 'workflow.node_desc.timer',
  },
  end_approved: {
    icon: <CheckCircle2 size={14} />,
    labelKey: 'workflow.node.end_approved',
    color: 'text-white',
    bgColor: 'bg-emerald-600 dark:bg-emerald-700',
    borderColor: 'border-emerald-700 dark:border-emerald-800',
    accentBg: 'bg-emerald-800',
    descriptionKey: 'workflow.node_desc.end_approved',
  },
  end_rejected: {
    icon: <XCircle size={14} />,
    labelKey: 'workflow.node.end_rejected',
    color: 'text-white',
    bgColor: 'bg-red-600 dark:bg-red-700',
    borderColor: 'border-red-700 dark:border-red-800',
    accentBg: 'bg-red-800',
    descriptionKey: 'workflow.node_desc.end_rejected',
  },
  end_cancelled: {
    icon: <Archive size={14} />,
    labelKey: 'workflow.node.end_cancelled',
    color: 'text-white',
    bgColor: 'bg-zinc-500 dark:bg-zinc-600',
    borderColor: 'border-zinc-600 dark:border-zinc-700',
    accentBg: 'bg-zinc-700',
    descriptionKey: 'workflow.node_desc.end_cancelled',
  },
}

export const MINIMAP_COLORS: Record<string, string> = {
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

type WorkflowCondition = Record<string, unknown>

function _parseConditionValue(raw: string): { value?: unknown; value_from?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { value: '' }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return { value: trimmed.slice(1, -1) }
  }
  if (trimmed === 'true') return { value: true }
  if (trimmed === 'false') return { value: false }
  if (trimmed === 'null') return { value: null }
  if (!Number.isNaN(Number(trimmed))) return { value: Number(trimmed) }
  return { value_from: trimmed }
}

export function parseWorkflowConditionExpression(expression: string | undefined): WorkflowCondition | undefined {
  const raw = expression?.trim()
  if (!raw) return undefined
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed as WorkflowCondition : undefined
    } catch {
      return undefined
    }
  }
  if (raw.startsWith('!')) {
    const field = raw.slice(1).trim()
    return field ? { field, op: 'falsy' } : undefined
  }
  if (/^[A-Za-z_][\w.]*$/.test(raw)) {
    return { field: raw, op: 'truthy' }
  }
  const match = raw.match(/^([A-Za-z_][\w.]*)\s*(==|!=)\s*(.+)$/)
  if (!match) return undefined
  const [, field, operator, rightRaw] = match
  const right = _parseConditionValue(rightRaw)
  return {
    field,
    op: operator === '==' ? 'eq' : 'ne',
    ...right,
  }
}

export function formatWorkflowConditionExpression(condition: unknown): string | undefined {
  if (!condition || typeof condition !== 'object') return undefined
  const typed = condition as Record<string, unknown>
  if ('all' in typed || 'any' in typed || 'not' in typed) {
    return JSON.stringify(condition)
  }
  const field = typeof typed.field === 'string' ? typed.field : undefined
  const op = typeof typed.op === 'string' ? typed.op : 'eq'
  if (!field) return JSON.stringify(condition)
  if (op === 'truthy') return field
  if (op === 'falsy') return `!${field}`
  const right = 'value_from' in typed
    ? String(typed.value_from)
    : typeof typed.value === 'string'
      ? `'${typed.value}'`
      : JSON.stringify(typed.value)
  if (op === 'eq') return `${field} == ${right}`
  if (op === 'ne') return `${field} != ${right}`
  return JSON.stringify(condition)
}

export const EDGE_DEFAULTS = {
  // Filled arrowhead — larger and clearly visible
  markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#64748b' },
  style: { strokeWidth: 2, stroke: '#94a3b8' },
  // Step = orthogonal routing (right-angle corners) → classic flowchart look
  type: 'step' as const,
  // Edge labels rendered as pill bubbles
  labelStyle: { fontSize: 10, fontWeight: 700, fill: '#1e293b' },
  labelBgStyle: { fill: '#f8fafc', fillOpacity: 1, rx: 8, ry: 8 },
  labelBgPadding: [5, 10] as [number, number],
}

// ── Node dimensions ──────────────────────────────────────────────
// Used by both the layout engine and the node renderer.
// Condition nodes are square so the diamond fits without clipping.
export const DIAMOND_SIZE = 100          // container side for condition (px)
export const DIAMOND_INNER = 68          // inner rotated-square side (px)
const PILL_W = 160                       // start / end pill width
const PILL_H = 44                        // start / end pill height
const RECT_W = 210                       // standard process node width
const RECT_H = 68                        // standard process node height

function nodeDims(nodeType: string): { w: number; h: number } {
  if (nodeType === 'start') return { w: PILL_W, h: PILL_H }
  if (nodeType?.startsWith('end_')) return { w: PILL_W + 20, h: PILL_H }
  if (nodeType === 'condition') return { w: DIAMOND_SIZE, h: DIAMOND_SIZE }
  return { w: RECT_W, h: RECT_H }
}

export type LayoutDirection = 'TB' | 'LR'

export function computeAutoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB',
): Node[] {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph({ multigraph: false, compound: false })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: direction === 'TB' ? 80 : 60,
    ranksep: direction === 'TB' ? 120 : 160,
    edgesep: 20,
    marginx: 60,
    marginy: 60,
    ranker: 'longest-path',
    align: 'DL',
  })

  // Use per-type dimensions so Dagre allocates the right bounding box
  nodes.forEach((node) => {
    const { w, h } = nodeDims(String(node.data?.nodeType ?? ''))
    g.setNode(node.id, { width: w, height: h })
  })

  // De-duplicate parallel edges — multiple transitions between the same
  // pair produce one layout edge to prevent rank confusion.
  const seenEdges = new Set<string>()
  edges.forEach((edge) => {
    const key = `${edge.source}→${edge.target}`
    if (!seenEdges.has(key)) {
      seenEdges.add(key)
      g.setEdge(edge.source, edge.target)
    }
  })

  dagre.layout(g)

  const snap = 10
  return nodes.map((node) => {
    const dagreNode = g.node(node.id)
    if (!dagreNode) return node
    const { w, h } = nodeDims(String(node.data?.nodeType ?? ''))
    return {
      ...node,
      position: {
        x: Math.round((dagreNode.x - w / 2) / snap) * snap,
        y: Math.round((dagreNode.y - h / 2) / snap) * snap,
      },
    }
  })
}

/**
 * Returns true when nodes need an auto-layout pass.
 *
 * Detects three cases that produce broken diagrams:
 *  1. All nodes stacked at the origin (fresh definition).
 *  2. Total spread < 50 px (essentially same as case 1).
 *  3. Any two nodes overlap (saved layout is broken / too dense).
 */
function needsAutoLayout(nodes: Node[]): boolean {
  if (nodes.length <= 1) return false
  const positions = nodes.map((n) => n.position)

  // Case 1 & 2: all at origin or spread is negligible
  const allAtOrigin = positions.every((p) => p.x === 0 && p.y === 0)
  if (allAtOrigin) return true
  const xs = positions.map((p) => p.x)
  const ys = positions.map((p) => p.y)
  if (Math.max(...xs) - Math.min(...xs) < 50 && Math.max(...ys) - Math.min(...ys) < 50) return true

  // Case 3: any two nodes share the same cell (overlap detection)
  // Use a loose threshold based on a typical node width/height.
  const xThreshold = RECT_W * 0.75
  const yThreshold = RECT_H * 0.75
  for (let i = 0; i < positions.length - 1; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (
        Math.abs(positions[i].x - positions[j].x) < xThreshold &&
        Math.abs(positions[i].y - positions[j].y) < yThreshold
      ) {
        return true
      }
    }
  }
  return false
}

// ── Shared handle style ──────────────────────────────────────────
const H_TARGET = '!w-3 !h-3 !bg-slate-400 !border-2 !border-white dark:!border-slate-900 !rounded-full'
const H_SOURCE = '!w-3 !h-3 !bg-primary !border-2 !border-white dark:!border-slate-900 !rounded-full'

// ── ① PILL — Start & End nodes ───────────────────────────────────
function PillNode({ data, selected }: NodeProps) {
  const nodeType = (data.nodeType as WorkflowNodeDef['type']) || 'start'
  const config = NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.start
  const isStart = nodeType === 'start'
  const isHighlighted = data.__highlighted as boolean

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-5 rounded-full border-2 shadow transition-all select-none',
        config.bgColor, config.borderColor, config.color,
        selected && 'ring-2 ring-offset-2 ring-primary',
        isHighlighted && 'ring-2 ring-offset-1 ring-emerald-400',
      )}
      style={{ height: PILL_H, minWidth: PILL_W }}
    >
      {!isStart && (
        <Handle type="target" position={Position.Top} className={H_TARGET} />
      )}
      <span className="shrink-0">{config.icon}</span>
      <span className="text-[11px] font-bold tracking-wide truncate">
        {(data.label as string) || i18n.t(config.labelKey)}
      </span>
      {isStart && (
        <Handle type="source" position={Position.Bottom} className={H_SOURCE} />
      )}
    </div>
  )
}

// ── ② DIAMOND — Condition nodes ──────────────────────────────────
function ConditionNode({ data, selected }: NodeProps) {
  const config = NODE_TYPE_CONFIG.condition
  const isHighlighted = data.__highlighted as boolean
  const label = (data.label as string) || i18n.t(config.labelKey)
  const expr = typeof data.expression === 'string' ? data.expression : ''

  return (
    <div style={{ width: DIAMOND_SIZE, height: DIAMOND_SIZE }} className="relative select-none">
      <Handle
        type="target" position={Position.Top}
        style={{ top: 2 }}
        className={H_TARGET}
      />

      {/* Rotated inner square → diamond shape */}
      <div
        className={cn(
          'absolute border-2 transition-all',
          config.bgColor, config.borderColor,
          selected && '!border-primary',
          isHighlighted && '!border-emerald-500',
        )}
        style={{
          width: DIAMOND_INNER,
          height: DIAMOND_INNER,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) rotate(45deg)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }}
      />

      {/* Content — NOT rotated, centred over the diamond */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 z-10 px-2">
        <Diamond size={13} className={config.color} />
        <span className={cn('text-[10px] font-bold text-center leading-tight', config.color)}>
          {label}
        </span>
        {expr && (
          <span className="text-[9px] text-orange-500 dark:text-orange-400 font-mono truncate max-w-[78px]">
            {expr}
          </span>
        )}
      </div>

      <Handle
        type="source" position={Position.Bottom}
        style={{ bottom: 2 }}
        className={H_SOURCE}
      />
    </div>
  )
}

// ── ③ RECTANGLE — All other process nodes ────────────────────────
function RectNode({ data, selected }: NodeProps) {
  const nodeType = (data.nodeType as WorkflowNodeDef['type']) || 'human_validation'
  const config = NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.human_validation
  const isHighlighted = data.__highlighted as boolean

  return (
    <div
      className={cn(
        'flex rounded-lg border shadow-sm transition-all overflow-hidden select-none',
        config.bgColor, config.borderColor,
        selected && 'ring-2 ring-primary shadow-md',
        isHighlighted && 'ring-2 ring-emerald-500 shadow-emerald-200/50 dark:shadow-emerald-900/50',
      )}
      style={{ width: RECT_W, minHeight: RECT_H }}
    >
      <Handle type="target" position={Position.Top} className={H_TARGET} />

      {/* Left accent bar — solid colour per node type */}
      <div className={cn('w-1.5 shrink-0 self-stretch', config.accentBg)} />

      {/* Body */}
      <div className="flex-1 min-w-0 px-3 py-2 flex flex-col justify-center gap-0.5">
        <div className={cn('flex items-center gap-1.5', config.color)}>
          {config.icon}
          <span className="text-[11px] font-semibold leading-snug truncate">
            {(data.label as string) || i18n.t(config.labelKey)}
          </span>
        </div>
        {typeof data.role === 'string' && data.role && (
          <p className="text-[9px] text-muted-foreground truncate flex items-center gap-0.5">
            <Shield size={7} className="shrink-0" />{data.role}
          </p>
        )}
        {typeof data.expression === 'string' && data.expression && (
          <p className="text-[9px] text-muted-foreground font-mono truncate flex items-center gap-0.5">
            <Code2 size={7} className="shrink-0" />{data.expression}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className={H_SOURCE} />
    </div>
  )
}

// ── Dispatcher — routes to the correct shape ──────────────────────
function WorkflowNode(props: NodeProps) {
  const nodeType = props.data?.nodeType as string | undefined
  if (nodeType === 'start' || nodeType?.startsWith('end_')) return <PillNode {...props} />
  if (nodeType === 'condition') return <ConditionNode {...props} />
  return <RectNode {...props} />
}

export const nodeTypes: NodeTypes = { workflowNode: WorkflowNode }

export function definitionToFlow(
  def: WorkflowDefinition,
  highlightNodeId?: string,
  /** Force a fresh Dagre layout regardless of stored positions.
   *  Use this for read-only / published views where users can't drag nodes. */
  forceLayout = false,
): { nodes: Node[]; edges: Edge[] } {
  let nodes: Node[] = (def.nodes || []).map((node) => ({
    id: node.id,
    type: 'workflowNode',
    position: node.position || { x: 0, y: 0 },
    data: {
      label: node.label,
      nodeType: node.type,
      __highlighted: node.id === highlightNodeId,
      ...node.config,
    },
  }))

  const edges: Edge[] = (def.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label || '',
    animated: edge.trigger === 'auto',
    data: {
      condition: edge.condition_expression || formatWorkflowConditionExpression(edge.condition),
      condition_struct: edge.condition,
      required_role: edge.required_role || (Array.isArray(edge.required_roles) ? edge.required_roles[0] : undefined),
      required_roles: edge.required_roles,
      assignee: edge.assignee,
      sla_hours: edge.sla_hours,
      trigger: edge.trigger,
      required_permission: edge.required_permission,
      comment_required: edge.comment_required,
    },
    ...EDGE_DEFAULTS,
  }))

  if (forceLayout || needsAutoLayout(nodes)) {
    nodes = computeAutoLayout(nodes, edges, 'TB')
  }

  return { nodes, edges }
}

export function flowToStructureLockedDefinition(definition: WorkflowDefinition, edges: Edge[]) {
  const states = Array.isArray(definition.states) ? [...definition.states] : definition.states
  const originalTransitions = Array.isArray(definition.transitions) ? definition.transitions : []
  const edgeMap = new Map(edges.map((edge) => [edge.id, edge]))
  const fallbackMap = new Map(edges.map((edge) => [`${edge.source}->${edge.target}`, edge]))

  const transitions = originalTransitions.map((transition, index) => {
    const source = String((transition as Record<string, unknown>).from ?? (transition as Record<string, unknown>).source ?? '')
    const target = String((transition as Record<string, unknown>).to ?? (transition as Record<string, unknown>).target ?? '')
    const edge = edgeMap.get(String((transition as Record<string, unknown>).id ?? '')) ?? fallbackMap.get(`${source}->${target}`)
    const conditionExpression = (typeof edge?.data?.condition === 'string' ? edge.data.condition : undefined)?.trim()
    const requiredRole = (typeof edge?.data?.required_role === 'string' ? edge.data.required_role : undefined)?.trim()
    const assignee = edge?.data?.assignee && typeof edge.data.assignee === 'object'
      ? edge.data.assignee as Record<string, unknown>
      : undefined
    const slaHours = Number(edge?.data?.sla_hours)

    return {
      ...transition,
      label: typeof edge?.label === 'string' ? edge.label : (transition as Record<string, unknown>).label,
      condition: parseWorkflowConditionExpression(conditionExpression) ?? (transition as Record<string, unknown>).condition,
      condition_expression: conditionExpression || undefined,
      required_role: requiredRole || undefined,
      required_roles: requiredRole ? [requiredRole] : undefined,
      required_permission: typeof edge?.data?.required_permission === 'string' && edge.data.required_permission.trim()
        ? edge.data.required_permission.trim()
        : (transition as Record<string, unknown>).required_permission,
      comment_required: Boolean(edge?.data?.comment_required ?? (transition as Record<string, unknown>).comment_required),
      assignee,
      sla_hours: Number.isFinite(slaHours) && slaHours > 0 ? Math.round(slaHours) : undefined,
      trigger: edge?.animated ? 'auto' : 'human',
      id: String((transition as Record<string, unknown>).id ?? edge?.id ?? `locked-${index + 1}-${source}-${target}`),
      from: source,
      to: target,
    }
  })

  return { states, transitions }
}

export function flowToDefinition(nodes: Node[], edges: Edge[]): { nodes: WorkflowNodeDef[]; edges: WorkflowEdgeDef[] } {
  const defNodes: WorkflowNodeDef[] = nodes.map((node) => ({
    id: node.id,
    type: (node.data.nodeType as WorkflowNodeDef['type']) || 'start',
    label: (node.data.label as string) || '',
    config: Object.fromEntries(
      Object.entries(node.data).filter(([key]) => !['label', 'nodeType', '__highlighted'].includes(key)),
    ),
    position: node.position,
  }))

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const defEdges: WorkflowEdgeDef[] = edges.map((edge) => {
    const targetNode = nodeMap.get(edge.target)
    const conditionExpression = (typeof edge.data?.condition === 'string' ? edge.data.condition : undefined)?.trim()
    const requiredRole = (typeof edge.data?.required_role === 'string' ? edge.data.required_role : undefined)?.trim()
    const targetRole = (typeof targetNode?.data?.role === 'string' ? targetNode.data.role : undefined)?.split(',').map((item) => item.trim()).filter(Boolean) || []
    const durationHoursRaw = targetNode?.data?.nodeType === 'timer' ? Number(targetNode.data?.duration_hours) : undefined

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: (edge.label as string) || undefined,
      condition: parseWorkflowConditionExpression(conditionExpression),
      condition_expression: conditionExpression || undefined,
      required_role: requiredRole || undefined,
      required_roles: requiredRole ? [requiredRole] : undefined,
      required_permission: typeof edge.data?.required_permission === 'string' ? edge.data.required_permission : undefined,
      comment_required: Boolean(edge.data?.comment_required),
      assignee: edge.data?.assignee && typeof edge.data.assignee === 'object'
        ? edge.data.assignee as Record<string, unknown>
        : targetNode?.data?.nodeType === 'human_validation' && targetRole.length
          ? { resolver: 'role', role_code: targetRole[0] }
          : undefined,
      sla_hours: durationHoursRaw && durationHoursRaw > 0 ? Math.round(durationHoursRaw) : undefined,
      trigger: edge.animated ? 'auto' as const : 'human' as const,
    }
  })

  return { nodes: defNodes, edges: defEdges }
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  message: string
  nodeId?: string
}

export function validateWorkflow(nodes: Node[], edges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const nodeTypeSet = new Set(nodes.map((node) => node.data.nodeType as string))
  const nodeIds = new Set(nodes.map((node) => node.id))

  if (!nodeTypeSet.has('start')) {
    issues.push({ severity: 'error', message: i18n.t('workflow.validation.start_required') })
  }
  const endTypes = ['end_approved', 'end_rejected', 'end_cancelled']
  if (!endTypes.some((type) => nodeTypeSet.has(type))) {
    issues.push({ severity: 'error', message: i18n.t('workflow.validation.end_required') })
  }
  if (nodes.length < 2) {
    issues.push({ severity: 'error', message: i18n.t('workflow.validation.min_nodes') })
  }
  if (edges.length === 0) {
    issues.push({ severity: 'error', message: i18n.t('workflow.validation.min_edges') })
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push({ severity: 'error', message: i18n.t('workflow.validation.missing_source', { source: edge.source }) })
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({ severity: 'error', message: i18n.t('workflow.validation.missing_target', { target: edge.target }) })
    }
  }

  const connectedIds = new Set<string>()
  for (const edge of edges) {
    connectedIds.add(edge.source)
    connectedIds.add(edge.target)
  }
  for (const node of nodes) {
    if (!connectedIds.has(node.id)) {
      issues.push({ severity: 'warning', message: i18n.t('workflow.validation.unconnected_node', { node: String(node.data.label || node.id) }), nodeId: node.id })
    }
  }

  for (const node of nodes) {
    if (node.data.nodeType === 'human_validation' && !node.data.role) {
      issues.push({ severity: 'warning', message: i18n.t('workflow.validation.no_role', { node: String(node.data.label || node.id) }), nodeId: node.id })
    }
    if (node.data.nodeType === 'condition' && !node.data.expression) {
      issues.push({ severity: 'warning', message: i18n.t('workflow.validation.no_condition', { node: String(node.data.label || node.id) }), nodeId: node.id })
    }
    if (node.data.nodeType === 'timer' && !node.data.duration_hours) {
      issues.push({ severity: 'warning', message: i18n.t('workflow.validation.no_duration', { node: String(node.data.label || node.id) }), nodeId: node.id })
    }
    if (node.data.nodeType === 'system_check' && !node.data.check_name) {
      issues.push({ severity: 'warning', message: i18n.t('workflow.validation.no_check', { node: String(node.data.label || node.id) }), nodeId: node.id })
    }
    if (node.data.nodeType === 'notification' && !node.data.template) {
      issues.push({ severity: 'warning', message: i18n.t('workflow.validation.no_template', { node: String(node.data.label || node.id) }), nodeId: node.id })
    }
  }

  for (const edge of edges) {
    if (typeof edge.data?.condition === 'string' && edge.data.condition.trim() && !parseWorkflowConditionExpression(edge.data.condition)) {
      issues.push({
        severity: 'error',
        message: i18n.t('workflow.validation.invalid_condition', { edge: String(edge.label || edge.id) }),
      })
    }
  }

  const startNodes = nodes.filter((node) => node.data.nodeType === 'start')
  for (const startNode of startNodes) {
    if (edges.some((edge) => edge.target === startNode.id)) {
      issues.push({ severity: 'warning', message: i18n.t('workflow.validation.start_incoming') })
    }
  }

  const endNodes = nodes.filter((node) => (node.data.nodeType as string)?.startsWith('end_'))
  for (const endNode of endNodes) {
    if (edges.some((edge) => edge.source === endNode.id)) {
      issues.push({ severity: 'warning', message: i18n.t('workflow.validation.end_outgoing', { node: String(endNode.data.label || endNode.id) }) })
    }
  }

  return issues
}
