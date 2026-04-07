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
import i18n from '@/lib/i18n'
import {
  GitBranch, Plus, Play, Pause, Archive, Copy, Send,
  CheckCircle2, Clock, ArrowLeft, XCircle,
  Loader2, Tag, LayoutList,
  AlertTriangle, Undo2, Redo2, Shield,
  LayoutGrid, ArrowDownUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { usePageSize } from '@/hooks/usePageSize'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { useRoles } from '@/hooks/useRbac'
import {
  useWorkflowDefinitions,
  useWorkflowDefinition,
  useCreateWorkflowDefinition,
  useUpdateWorkflowDefinition,
  usePublishWorkflowDefinition,
  useArchiveWorkflowDefinition,
  useCloneWorkflowDefinition,
  useWorkflowStats,
  useDeleteWorkflowDefinition,
} from '@/hooks/useWorkflow'
import type {
  WorkflowDefinition,
  WorkflowNodeDef,
  WorkflowEdgeDef,
} from '@/services/workflowService'
import { CreateDialog, DefinitionSection, InstancesTable, StatusFilter, WorkflowStatCard } from './workflowCatalog'
import { EditorToolbox, EdgeConfigPanel, NodeConfigPanel, ValidationPanel } from './workflowEditorPanels'
import { entityTypeLabel, isStructureLockedDefinition } from './workflowShared'
import {
  computeAutoLayout,
  definitionToFlow,
  EDGE_DEFAULTS,
  flowToDefinition,
  flowToStructureLockedDefinition,
  LayoutDirection,
  MINIMAP_COLORS,
  NODE_TYPE_CONFIG,
  nodeTypes,
  validateWorkflow,
} from './workflowFlow'
import { InstanceDetailPanel } from './workflowInstance'

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
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const FALLBACK_ROLES = [
  'DO', 'DPROD', 'HSE_ADMIN', 'SITE_MGR', 'PROJ_MGR',
  'MAINT_MGR', 'LOG_COORD', 'TRANSP_COORD', 'PAX_ADMIN',
  'CDS', 'CHSE', 'READER',
] as const

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
// FLOATING TOOLBOX
// ══════════════════════════════════════════════════════════════════════════════

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
  onSave: (payload: { nodes?: WorkflowNodeDef[]; edges?: WorkflowEdgeDef[]; states?: unknown; transitions?: unknown }) => void
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
  onSave: (payload: { nodes?: WorkflowNodeDef[]; edges?: WorkflowEdgeDef[]; states?: unknown; transitions?: unknown }) => void
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
  const structureLocked = isStructureLockedDefinition(definition)
  const { data: roleCatalog } = useRoles()
  const availableRoles = useMemo(() => {
    const codes = (roleCatalog || []).map((role) => role.code).filter(Boolean)
    return codes.length > 0 ? codes : [...FALLBACK_ROLES]
  }, [roleCatalog])

  // Undo/redo
  const { saveSnapshot, undo, redo, pushToFuture, canUndo, canRedo } = useUndoRedo(initial.nodes, initial.edges)

  useEffect(() => {
    setNodes(initial.nodes)
    setEdges(initial.edges)
    setSelectedNode(null)
    setSelectedEdge(null)
    setShowValidation(false)
    setTimeout(() => {
      reactFlow.fitView({ padding: 0.2, maxZoom: 1.8 })
    }, 50)
  }, [definition.id, initial.nodes, initial.edges, reactFlow, setNodes, setEdges])

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
    if (structureLocked) return
    saveSnapshot(nodes, edges)
    setEdges((eds) => addEdge({
      ...connection,
      id: `e-${++nodeIdCounter.current}`,
      ...EDGE_DEFAULTS,
    }, eds))
  }, [setEdges, saveSnapshot, nodes, edges, structureLocked])

  const handleAddNode = useCallback((type: WorkflowNodeDef['type']) => {
    if (structureLocked) return
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
      data: { label: i18n.t(config.labelKey), nodeType: type },
    }])
  }, [setNodes, nodes, edges, reactFlow, saveSnapshot, structureLocked])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    if (structureLocked) return
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
      data: { label: i18n.t(config.labelKey), nodeType: type },
    }])
  }, [setNodes, reactFlow, saveSnapshot, nodes, edges, structureLocked])

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
    if (structureLocked) return
    saveSnapshot(nodes, edges)
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)))
  }, [setNodes, saveSnapshot, nodes, edges, structureLocked])

  const handleNodeDelete = useCallback((id: string) => {
    if (structureLocked) return
    saveSnapshot(nodes, edges)
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
  }, [setNodes, setEdges, saveSnapshot, nodes, edges, structureLocked])

  const handleEdgeUpdate = useCallback((id: string, changes: Partial<Edge>) => {
    saveSnapshot(nodes, edges)
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, ...changes } : e)))
    setSelectedEdge((prev) => prev && prev.id === id ? { ...prev, ...changes } : prev)
  }, [setEdges, saveSnapshot, nodes, edges])

  const handleEdgeDelete = useCallback((id: string) => {
    if (structureLocked) return
    saveSnapshot(nodes, edges)
    setEdges((eds) => eds.filter((e) => e.id !== id))
  }, [setEdges, saveSnapshot, nodes, edges, structureLocked])

  const handleSave = useCallback(() => {
    if (structureLocked) {
      onSave(flowToStructureLockedDefinition(definition, edges))
      return
    }
    const result = flowToDefinition(nodes, edges)
    onSave({ nodes: result.nodes, edges: result.edges })
  }, [nodes, edges, onSave, structureLocked, definition])

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
          {isDraft && !structureLocked && (
            <>
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-30"
                title={t('workflow.shortcut_undo')}
              >
                <Undo2 size={14} />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-30"
                title={t('workflow.shortcut_redo')}
              >
                <Redo2 size={14} />
              </button>
              <div className="w-px h-5 bg-border" />
            </>
          )}

          {/* Auto-layout */}
          {isDraft && !structureLocked && (
            <>
              <button
                onClick={() => handleAutoLayout('TB')}
                className={cn(
                  'p-1.5 rounded-md hover:bg-accent text-muted-foreground',
                  layoutDirection === 'TB' && 'bg-accent/60 text-foreground',
                )}
                title={t('workflow.auto_layout_vertical')}
              >
                <ArrowDownUp size={14} />
              </button>
              <button
                onClick={() => handleAutoLayout('LR')}
                className={cn(
                  'p-1.5 rounded-md hover:bg-accent text-muted-foreground',
                  layoutDirection === 'LR' && 'bg-accent/60 text-foreground',
                )}
                title={t('workflow.auto_layout_horizontal')}
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

          {structureLocked && (
            <div className="hidden lg:flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              <Shield size={11} />
              {t('workflow.structure_locked')}
            </div>
          )}

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
              title={hasErrors ? t('workflow.fix_errors_before_publish') : t('workflow.publish')}
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
              <span className="text-[10px] text-muted-foreground hidden sm:block">{t('workflow.shortcut_save')}</span>
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
            {isDraft && !structureLocked && <EditorToolbox onAddNode={handleAddNode} />}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={isDraft && !structureLocked ? onNodesChange : undefined}
              onEdgesChange={isDraft && !structureLocked ? onEdgesChange : undefined}
              onConnect={isDraft && !structureLocked ? onConnect : undefined}
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
              deleteKeyCode={isDraft && !structureLocked ? ['Backspace', 'Delete'] : []}
              nodesDraggable={isDraft && !structureLocked}
              nodesConnectable={isDraft && !structureLocked}
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
              {isDraft && structureLocked && (
                <Panel position="top-center">
                  <div className="px-3 py-1.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded-md text-xs font-medium shadow-sm">
                    {t('workflow.safe_system_mode')}
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
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onDelete={handleNodeDelete}
            onClose={() => setSelectedNode(null)}
            availableRoles={availableRoles}
            structureLocked={structureLocked}
          />
        )}
        {selectedEdge && isDraft && (
          <EdgeConfigPanel
            edge={selectedEdge}
            onUpdate={handleEdgeUpdate}
            onDelete={handleEdgeDelete}
            onClose={() => setSelectedEdge(null)}
            availableRoles={availableRoles}
            structureLocked={structureLocked}
          />
        )}
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
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingInstanceId, setViewingInstanceId] = useState<string | null>(null)
  const [instanceDefinitionFilter, setInstanceDefinitionFilter] = useState<string | undefined>(undefined)
  const [showCreate, setShowCreate] = useState(false)

  // ── Data ──
  const { data: defsData, isLoading } = useWorkflowDefinitions({
    status: statusFilter || undefined,
    search: search || undefined,
    entity_type: entityTypeFilter || undefined,
    page_size: pageSize,
  })
  const {
    data: editingDef,
    isLoading: editingDefLoading,
    isError: editingDefError,
  } = useWorkflowDefinition(editingId || '')
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
          { id: 'n-start', type: 'start', label: t('workflow.default_start_label'), config: {}, position: { x: 250, y: 50 } },
          { id: 'n-end', type: 'end_approved', label: t('workflow.default_approved_label'), config: {}, position: { x: 250, y: 300 } },
        ],
        edges: [],
      },
      {
        onSuccess: (def) => {
          toast({ title: t('workflow.created'), variant: 'success' })
          setEditingId(def.id)
        },
      },
    )
  }, [createMut, toast, t])

  const handleSave = useCallback((payload: { nodes?: WorkflowNodeDef[]; edges?: WorkflowEdgeDef[]; states?: unknown; transitions?: unknown }) => {
    if (!editingId) return
    updateMut.mutate(
      { id: editingId, payload },
      { onSuccess: () => toast({ title: t('workflow.saved'), variant: 'success' }) },
    )
  }, [editingId, updateMut, toast, t])

  const handlePublish = useCallback((id: string) => {
    publishMut.mutate(id, {
      onSuccess: () => toast({ title: t('workflow.published_success'), variant: 'success' }),
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
      onSuccess: () => toast({ title: t('workflow.archived_success'), variant: 'success' }),
    })
  }, [archiveMut, toast, t])

  const handleClone = useCallback((id: string) => {
    cloneMut.mutate(id, {
      onSuccess: (def) => {
        toast({ title: t('workflow.cloned_success'), variant: 'success' })
        setEditingId(def.id)
      },
    })
  }, [cloneMut, toast, t])

  const handleDelete = useCallback(async (id: string, name: string) => {
    const ok = await confirm({
      title: t('workflow.delete_confirm_title'),
      message: t('workflow.delete_confirm_message', { name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'danger',
    })
    if (!ok) return
    deleteMut.mutate(id, {
      onSuccess: () => toast({ title: t('workflow.deleted_success'), variant: 'success' }),
      onError: (err: Error) => {
        const detail = (err as any)?.response?.data?.detail
        toast({ title: t('common.error'), description: String(detail || err.message), variant: 'error' })
      },
    })
  }, [deleteMut, toast, confirm, t])

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

  const entityTypeOptions = useMemo(() => {
    const values = Array.from(new Set((defsData?.items || []).map((item) => item.entity_type).filter(Boolean))).sort()
    return values.map((value) => ({ value, label: entityTypeLabel(value) }))
  }, [defsData?.items])

  const definitionBuckets = useMemo(() => {
    const items = defsData?.items || []
    const system = items.filter((item) => isStructureLockedDefinition(item))
    const custom = items.filter((item) => !isStructureLockedDefinition(item))
    return {
      systemPublished: system.filter((item) => item.status === 'published'),
      systemDrafts: system.filter((item) => item.status === 'draft'),
      customDrafts: custom.filter((item) => item.status === 'draft'),
      customPublished: custom.filter((item) => item.status === 'published'),
      archived: items.filter((item) => item.status === 'archived'),
    }
  }, [defsData?.items])

  const totalInstances = useMemo(
    () => Object.values(statsMap).reduce((sum, entry) => sum + (entry.total || 0), 0),
    [statsMap],
  )

  // ═══ Instance detail mode ═══
  if (viewingInstanceId) {
    return (
      <InstanceDetailPanel
        instanceId={viewingInstanceId}
        onBack={() => setViewingInstanceId(null)}
      />
    )
  }

  if (editingId && editingDefLoading && !editingDef) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader icon={GitBranch} title={t('workflow.title')} subtitle={t('workflow.subtitle')}>
          <ToolbarButton icon={ArrowLeft} label={t('common.back')} variant="default" onClick={() => setEditingId(null)} />
        </PanelHeader>
        <PanelContent className="flex flex-1 items-center justify-center p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            {t('common.loading')}
          </div>
        </PanelContent>
      </div>
    )
  }

  if (editingId && editingDefError && !editingDef) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader icon={GitBranch} title={t('workflow.title')} subtitle={t('workflow.subtitle')}>
          <ToolbarButton icon={ArrowLeft} label={t('common.back')} variant="default" onClick={() => setEditingId(null)} />
        </PanelHeader>
        <PanelContent className="p-6">
          <EmptyState
            icon={AlertTriangle}
            title={t('common.error')}
            description={t('workflow.definition_load_error')}
            action={{ label: t('common.back'), onClick: () => setEditingId(null) }}
          />
        </PanelContent>
      </div>
    )
  }

  // ═══ Editor mode ═══
  if (editingId && editingDef) {
    return (
      <WorkflowEditor
        key={editingDef.id}
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
            <>
              <StatusFilter value={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                className="gl-form-input h-8 w-[210px] text-xs"
              >
                <option value="">{t('workflow.all_entity_types')}</option>
                {entityTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </>
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
                title={statusFilter || entityTypeFilter || search ? t('workflow.no_workflow_filtered') : t('workflow.no_workflow')}
                description={statusFilter || entityTypeFilter || search
                  ? t('workflow.no_workflow_filtered_desc')
                  : t('workflow.no_workflow_desc')}
                action={canCreate ? { label: t('workflow.new_workflow'), onClick: () => setShowCreate(true) } : undefined}
              />
            )}

            {!isLoading && defsData?.items && defsData.items.length > 0 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <WorkflowStatCard
                    icon={GitBranch}
                    label={t('workflow.visible_definitions')}
                    value={defsData.items.length}
                    subtitle={t('workflow.visible_definitions_desc')}
                  />
                  <WorkflowStatCard
                    icon={Shield}
                    label={t('workflow.system_workflows')}
                    value={definitionBuckets.systemPublished.length + definitionBuckets.systemDrafts.length}
                    tone="system"
                    subtitle={t('workflow.system_workflows_desc')}
                  />
                  <WorkflowStatCard
                    icon={Clock}
                    label={t('workflow.active_instances')}
                    value={totalInstances}
                    tone="success"
                    subtitle={t('workflow.active_instances_desc')}
                  />
                  <WorkflowStatCard
                    icon={Copy}
                    label={t('workflow.adjustable_versions')}
                    value={definitionBuckets.customDrafts.length + definitionBuckets.customPublished.length}
                    tone="warning"
                    subtitle={t('workflow.adjustable_versions_desc')}
                  />
                </div>

                <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">{t('workflow.catalog_title')}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('workflow.catalog_description')}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300 lg:max-w-[360px]">
                      {t('workflow.catalog_hint')}
                    </div>
                  </div>
                </div>

                <DefinitionSection
                  title={t('workflow.system_workflows')}
                  subtitle={t('workflow.system_section_desc')}
                  items={[...definitionBuckets.systemPublished, ...definitionBuckets.systemDrafts]}
                  statsMap={statsMap}
                  onOpen={setEditingId}
                  onPublish={handlePublish}
                  onArchive={handleArchive}
                  onClone={handleClone}
                  onDelete={handleDelete}
                  onViewInstances={(id) => {
                    setInstanceDefinitionFilter(id)
                    setActiveTab('instances')
                  }}
                  canDelete={canDelete}
                />

                <DefinitionSection
                  title={t('workflow.custom_drafts')}
                  subtitle={t('workflow.custom_drafts_desc')}
                  items={definitionBuckets.customDrafts}
                  statsMap={statsMap}
                  onOpen={setEditingId}
                  onPublish={handlePublish}
                  onArchive={handleArchive}
                  onClone={handleClone}
                  onDelete={handleDelete}
                  onViewInstances={(id) => {
                    setInstanceDefinitionFilter(id)
                    setActiveTab('instances')
                  }}
                  canDelete={canDelete}
                />

                <DefinitionSection
                  title={t('workflow.custom_published')}
                  subtitle={t('workflow.custom_published_desc')}
                  items={definitionBuckets.customPublished}
                  statsMap={statsMap}
                  onOpen={setEditingId}
                  onPublish={handlePublish}
                  onArchive={handleArchive}
                  onClone={handleClone}
                  onDelete={handleDelete}
                  onViewInstances={(id) => {
                    setInstanceDefinitionFilter(id)
                    setActiveTab('instances')
                  }}
                  canDelete={canDelete}
                />

                <DefinitionSection
                  title={t('workflow.archives_title')}
                  subtitle={t('workflow.archives_desc')}
                  items={definitionBuckets.archived}
                  statsMap={statsMap}
                  onOpen={setEditingId}
                  onPublish={handlePublish}
                  onArchive={handleArchive}
                  onClone={handleClone}
                  onDelete={handleDelete}
                  onViewInstances={(id) => {
                    setInstanceDefinitionFilter(id)
                    setActiveTab('instances')
                  }}
                  canDelete={canDelete}
                />
              </div>
            )}
          </div>
        )}

        {/* ═══ Instances Tab ═══ */}
        {activeTab === 'instances' && (
          <div className="mt-1">
            {instanceDefinitionFilter && (
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-xs text-muted-foreground">{t('workflow.filtered_by_definition')}</span>
                <span className="text-xs font-medium text-foreground">{instanceDefinitionFilter.slice(0, 8)}...</span>
                <button
                  onClick={() => setInstanceDefinitionFilter(undefined)}
                  className="text-xs text-primary hover:underline"
                >
                  {t('workflow.view_all')}
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
