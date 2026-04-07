import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  History,
  Loader2,
  MessageSquare,
  Play,
  Tag,
  Zap,
} from 'lucide-react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useWorkflowDefinition, useWorkflowInstance, useWorkflowInstanceHistory, useWorkflowTransition } from '@/hooks/useWorkflow'
import type { WorkflowDefinition } from '@/services/workflowService'
import { entityTypeLabel } from './workflowShared'
import { computeAutoLayout, definitionToFlow, MINIMAP_COLORS, nodeTypes } from './workflowFlow'

function InstanceFlowView({ definition, currentState }: { definition: WorkflowDefinition; currentState: string }) {
  const flow = useMemo(() => {
    const result = definitionToFlow(definition, currentState)
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

export function InstanceDetailPanel({
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

  const handleTransition = (target: string) => {
    transitionMut.mutate(
      { id: instanceId, to_state: target, comment: comment || undefined },
      {
        onSuccess: () => {
          setComment('')
          setSelectedTransition(null)
          toast({ title: t('workflow.transition_success', { state: target }), variant: 'success' })
        },
        onError: (err: Error) => {
          toast({ title: t('workflow.error_transition'), description: err.message, variant: 'error' })
        },
      },
    )
  }

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
          <span className="text-sm text-muted-foreground">{t('workflow.instance_not_found')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">
            {instance.definition_name || t('workflow.instance')}
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
        <div className="flex-1 min-w-0">
          {definition ? (
            <ReactFlowProvider>
              <InstanceFlowView definition={definition} currentState={instance.current_state} />
            </ReactFlowProvider>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> {t('workflow.loading_diagram')}
            </div>
          )}
        </div>

        <div className="w-[280px] shrink-0 border-l border-border bg-card overflow-y-auto">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{t('workflow.current_state')}</p>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-sm font-semibold">
                <Zap size={14} />
                {instance.current_state}
              </span>
            </div>
          </div>

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
              <p className="text-xs text-muted-foreground italic">{t('workflow.no_transition_history')}</p>
            )}
            {!historyLoading && history && history.length > 0 && (
              <div className="space-y-0">
                {history.map((transition, index) => (
                  <div key={transition.id} className="relative pl-4 pb-3">
                    {index < history.length - 1 && (
                      <div className="absolute left-[7px] top-3 bottom-0 w-px bg-border" />
                    )}
                    <div className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-2 border-primary bg-background flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[10px] font-medium text-foreground">
                        <span className="text-muted-foreground">{transition.from_state}</span>
                        <ArrowRight size={8} className="text-muted-foreground/50" />
                        <span className="text-primary">{transition.to_state}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {new Date(transition.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {transition.comment && (
                        <p className="text-[9px] text-muted-foreground/80 mt-0.5 flex items-start gap-1">
                          <MessageSquare size={8} className="mt-0.5 shrink-0" />
                          {transition.comment}
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
