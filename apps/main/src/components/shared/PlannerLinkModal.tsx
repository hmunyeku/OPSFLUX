/**
 * PlannerLinkModal — Select individual tasks to send to the Planner.
 *
 * Opens from the ProjectDetailPanel or Gantt toolbar. Shows the task
 * tree with checkboxes (task-by-task, no group auto-select), filters
 * by status/priority/assignee, shows which tasks are already linked.
 * On submit, batch-creates PlannerActivities via POST /send-to-planner.
 */
import { useState, useMemo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X, Search, CheckSquare, Square, Loader2, Calendar, Send, Zap, Eye, Unlink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectTasks, usePlannerLinks, useSendToPlanner, useUnlinkTaskFromPlanner } from '@/hooks/useProjets'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import type { ProjectTask } from '@/types/api'

const STATUS_LABELS: Record<string, string> = {
  todo: 'À faire', in_progress: 'En cours', review: 'Revue', done: 'Terminé', cancelled: 'Annulé',
}
const STATUS_COLORS: Record<string, string> = {
  todo: '#9ca3af', in_progress: '#3b82f6', review: '#eab308', done: '#22c55e', cancelled: '#ef4444',
}
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
}

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  projectCode: string
  assetId?: string | null
}

export function PlannerLinkModal({ open, onClose, projectId, projectCode, assetId }: Props) {
  const { data: tasks } = useProjectTasks(open ? projectId : undefined)
  const { data: links } = usePlannerLinks(open ? projectId : undefined)
  const sendToPlanner = useSendToPlanner()
  const unlinkTaskFromPlanner = useUnlinkTaskFromPlanner()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 200)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Optional override: when null, the backend inherits each task's
  // own pob_quota field as the planner activity's initial pax_quota.
  const [paxQuotaOverride, setPaxQuotaOverride] = useState<number | null>(null)
  const [priority, setPriority] = useState('medium')

  // Already-linked task IDs
  const linkedIds = useMemo(() => new Set((links || []).map(l => l.task_id)), [links])
  const linkedByTaskId = useMemo(() => new Map((links || []).map(l => [l.task_id, l])), [links])

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let list = tasks || []
    if (statusFilter.length > 0) list = list.filter(t => statusFilter.includes(t.status))
    if (priorityFilter.length > 0) list = list.filter(t => priorityFilter.includes(t.priority))
    if (debouncedSearch) {
      const needle = debouncedSearch.toLowerCase()
      list = list.filter(t => t.title.toLowerCase().includes(needle) || (t.code || '').toLowerCase().includes(needle))
    }
    return list
  }, [tasks, statusFilter, priorityFilter, debouncedSearch])

  // Build tree for display
  const tree = useMemo(() => {
    const m = new Map<string | null, ProjectTask[]>()
    for (const t of filteredTasks) {
      const k = t.parent_id ?? null
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    return m
  }, [filteredTasks])

  // Collect all leaf descendant IDs recursively
  const getLeafDescendants = useCallback((parentId: string): string[] => {
    const children = tree.get(parentId) || []
    if (children.length === 0) return [parentId] // is a leaf itself
    const leaves: string[] = []
    for (const child of children) {
      leaves.push(...getLeafDescendants(child.id))
    }
    return leaves
  }, [tree])

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Toggle all leaf children of a parent task
  const toggleParent = useCallback((parentId: string) => {
    const leafIds = getLeafDescendants(parentId).filter(id => !linkedIds.has(id))
    if (leafIds.length === 0) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      // If all leaves are already selected → deselect all; otherwise select all
      const allSelected = leafIds.every(id => next.has(id))
      for (const id of leafIds) {
        if (allSelected) next.delete(id); else next.add(id)
      }
      return next
    })
  }, [getLeafDescendants, linkedIds])

  const handleSend = async () => {
    if (selectedIds.size === 0) return
    try {
      // When paxQuotaOverride is null we omit pax_quota from the payload
      // so the backend inherits each task's own pob_quota.
      const items = [...selectedIds].map(id => (
        paxQuotaOverride !== null
          ? { task_id: id, pax_quota: paxQuotaOverride, priority }
          : { task_id: id, priority }
      ))
      const res = await sendToPlanner.mutateAsync({ projectId, items, assetId: assetId || undefined })
      toast({
        title: `${res.created} activité${res.created > 1 ? 's' : ''} créée${res.created > 1 ? 's' : ''} dans le Planner`,
        description: res.skipped > 0 ? `${res.skipped} déjà liée(s)` : undefined,
        variant: res.errors.length > 0 ? 'warning' : 'success',
      })
      setSelectedIds(new Set())
      if (res.errors.length === 0) onClose()
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Échec', description: String(msg), variant: 'error' })
    }
  }

  const toggleChip = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  }

  const renderTask = (task: ProjectTask, depth: number): React.ReactNode => {
    const children = tree.get(task.id) || []
    const linked = linkedIds.has(task.id)
    const linkedEntry = linkedByTaskId.get(task.id)
    const checked = selectedIds.has(task.id)
    const isLeaf = children.length === 0

    // For parent tasks: check if all/some/none leaf descendants are selected
    let parentState: 'all' | 'some' | 'none' = 'none'
    if (!isLeaf) {
      const leafIds = getLeafDescendants(task.id).filter(id => !linkedIds.has(id))
      if (leafIds.length > 0) {
        const selectedCount = leafIds.filter(id => selectedIds.has(id)).length
        parentState = selectedCount === leafIds.length ? 'all' : selectedCount > 0 ? 'some' : 'none'
      }
    }

    return (
      <div key={task.id}>
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded text-xs',
            !linked && 'hover:bg-muted/40 cursor-pointer',
            (checked || parentState === 'all') && 'bg-primary/5',
            linked && 'opacity-60',
          )}
          style={{ paddingLeft: `${8 + depth * 18}px` }}
          onClick={() => {
            if (linked) return
            if (isLeaf) toggle(task.id)
            else toggleParent(task.id)
          }}
        >
          {/* Checkbox — leaf tasks: simple toggle */}
          {isLeaf && !linked && (
            <button className="shrink-0" onClick={e => { e.stopPropagation(); toggle(task.id) }}>
              {checked ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} className="text-muted-foreground" />}
            </button>
          )}
          {/* Checkbox — parent tasks: toggle all children */}
          {!isLeaf && !linked && (
            <button className="shrink-0" onClick={e => { e.stopPropagation(); toggleParent(task.id) }}>
              {parentState === 'all' ? <CheckSquare size={14} className="text-primary" />
                : parentState === 'some' ? <CheckSquare size={14} className="text-primary/40" />
                : <Square size={14} className="text-muted-foreground" />}
            </button>
          )}
          {linked && <Zap size={11} className="text-green-500 shrink-0" />}

          {/* Status dot */}
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[task.status] || '#9ca3af' }} />

          {/* Title */}
          <span className={cn('flex-1 truncate', children.length > 0 && 'font-semibold', linked && 'line-through')}>
            {task.title}
          </span>

          {/* Meta */}
          {task.progress > 0 && <span className="text-muted-foreground tabular-nums">{task.progress}%</span>}
          {task.assignee_name && <span className="text-muted-foreground truncate max-w-[80px]">{task.assignee_name}</span>}
          {task.due_date && (
            <span className="text-muted-foreground tabular-nums flex items-center gap-0.5">
              <Calendar size={9} />{new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            </span>
          )}
          {linked && (
            <>
              <span className="text-green-600 text-[10px]">Déjà planifié</span>
              {linkedEntry?.activity_id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openDynamicPanel({ type: 'detail', module: 'planner', id: linkedEntry.activity_id })
                  }}
                  className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground hover:bg-muted"
                >
                  <Eye size={10} />
                  Ouvrir
                </button>
              )}
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    await unlinkTaskFromPlanner.mutateAsync({ projectId, taskId: task.id })
                    toast({ title: 'Lien Planner supprimé', variant: 'success' })
                  } catch {
                    toast({ title: 'Impossible de retirer cette activité du Planner', variant: 'error' })
                  }
                }}
                className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground hover:bg-muted"
                disabled={unlinkTaskFromPlanner.isPending}
              >
                <Unlink size={10} />
                Retirer
              </button>
            </>
          )}
        </div>
        {children.map(c => renderTask(c, depth + 1))}
      </div>
    )
  }

  const roots = tree.get(null) || []
  const selectableCount = filteredTasks.filter(t => !linkedIds.has(t.id) && (tree.get(t.id) || []).length === 0).length

  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4 w-[95vw] max-w-3xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div>
              <Dialog.Title className="text-sm font-semibold">Envoyer au Planner</Dialog.Title>
              <p className="text-xs text-muted-foreground mt-0.5">Projet {projectCode} — sélectionnez les tâches à planifier individuellement</p>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-accent"><X size={14} /></button>
            </Dialog.Close>
          </div>

          {/* Filters */}
          <div className="px-4 py-2 border-b border-border bg-muted/30 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une tâche..."
                  className="w-full h-7 pl-7 pr-2 text-xs border border-border rounded bg-background" />
              </div>
              <span className="text-xs text-muted-foreground">{selectableCount} planifiable{selectableCount > 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <button key={v} onClick={() => toggleChip(statusFilter, v, setStatusFilter)}
                  className={cn('px-1.5 py-0.5 rounded border text-xs flex items-center gap-1',
                    statusFilter.includes(v) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[v] }} />{l}
                </button>
              ))}
              <span className="text-muted-foreground">|</span>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                <button key={v} onClick={() => toggleChip(priorityFilter, v, setPriorityFilter)}
                  className={cn('px-1.5 py-0.5 rounded border text-xs',
                    priorityFilter.includes(v) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Task tree */}
          <div className="flex-1 overflow-y-auto p-2">
            {roots.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground italic">
                {(tasks || []).length === 0 ? 'Ce projet n\'a pas de tâches' : 'Aucune tâche ne correspond aux filtres'}
              </div>
            )}
            {roots.map(r => renderTask(r, 0))}
          </div>

          {/* Footer: pax quota + priority + send */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">PAX:</span>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={paxQuotaOverride ?? ''}
                  placeholder="Tâche"
                  onChange={e => {
                    const v = e.target.value
                    setPaxQuotaOverride(v === '' ? null : Math.max(0, Number(v) || 0))
                  }}
                  className="w-16 h-6 px-1.5 text-xs border border-border rounded bg-background tabular-nums"
                  title="Vide = utilise le POB de chaque tâche. Sinon, force la valeur saisie pour toutes."
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Priorité:</span>
                <select value={priority} onChange={e => setPriority(e.target.value)}
                  className="h-6 px-1.5 text-xs border border-border rounded bg-background">
                  <option value="low">Basse</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Haute</option>
                  <option value="critical">Critique</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
              <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted">Annuler</button>
              <button onClick={handleSend} disabled={selectedIds.size === 0 || sendToPlanner.isPending}
                className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1.5">
                {sendToPlanner.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                Envoyer au Planner ({selectedIds.size})
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
