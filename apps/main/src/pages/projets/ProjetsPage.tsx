/**
 * Projets (Project Management) page — inspired by Gouti.
 *
 * Architecture:
 *  - DataTable with enriched columns (code, name, status, weather, %, manager, dates)
 *  - ProjectDetailPanel: fiche projet + equipe + taches + jalons + notes/documents
 *  - CreateProjectPanel: full creation form
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderKanban, Plus, Loader2, Trash2, Users, Target, X, Check,
  Sun, Cloud, CloudRain, CloudLightning, Milestone, ListTodo, UserPlus,
  Circle, CircleDot, CheckCircle2, CircleSlash, Clock,
  Sheet, CalendarRange, ChevronRight, Layers,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef, InlineEditConfig } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
  InlineEditableTags,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
  SectionColumns,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { TagManager } from '@/components/shared/TagManager'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { useAsset } from '@/hooks/useAssets'
import {
  useProjects, useProject, useCreateProject, useUpdateProject, useArchiveProject,
  useProjectTasks, useCreateProjectTask, useUpdateProjectTask, useDeleteProjectTask,
  useProjectMembers, useAddProjectMember, useRemoveProjectMember,
  useProjectMilestones, useCreateProjectMilestone, useUpdateProjectMilestone, useDeleteProjectMilestone,
  useAllProjectTasks, useSubProjects,
} from '@/hooks/useProjets'
import { projetsService } from '@/services/projetsService'
import type { Project, ProjectCreate, ProjectTask, ProjectTaskEnriched, ProjectMilestone as ProjectMilestoneType, ProjectMember as ProjectMemberType } from '@/types/api'

// -- Constants ----------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'planned', label: 'Planifie' },
  { value: 'active', label: 'Actif' },
  { value: 'on_hold', label: 'Suspendu' },
  { value: 'completed', label: 'Termine' },
  { value: 'cancelled', label: 'Annule' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
  { value: 'critical', label: 'Critique' },
]

const WEATHER_OPTIONS = [
  { value: 'sunny', label: 'Ensoleille', icon: Sun },
  { value: 'cloudy', label: 'Nuageux', icon: Cloud },
  { value: 'rainy', label: 'Pluvieux', icon: CloudRain },
  { value: 'stormy', label: 'Orageux', icon: CloudLightning },
]

const TASK_STATUS_OPTIONS = [
  { value: 'todo', label: 'A faire', icon: Circle, color: 'text-muted-foreground' },
  { value: 'in_progress', label: 'En cours', icon: CircleDot, color: 'text-primary' },
  { value: 'review', label: 'Revue', icon: Clock, color: 'text-yellow-500' },
  { value: 'done', label: 'Terminee', icon: CheckCircle2, color: 'text-green-500' },
  { value: 'cancelled', label: 'Annulee', icon: CircleSlash, color: 'text-red-500' },
]

const MEMBER_ROLE_OPTIONS = [
  { value: 'manager', label: 'Chef de projet' },
  { value: 'member', label: 'Membre' },
  { value: 'reviewer', label: 'Reviseur' },
  { value: 'stakeholder', label: 'Partie prenante' },
]

function WeatherIcon({ weather, size = 14 }: { weather: string; size?: number }) {
  const opt = WEATHER_OPTIONS.find(w => w.value === weather)
  if (!opt) return null
  const Icon = opt.icon
  const color = weather === 'sunny' ? 'text-yellow-500' : weather === 'cloudy' ? 'text-gray-400' : weather === 'rainy' ? 'text-blue-400' : 'text-red-500'
  return <Icon size={size} className={color} />
}

// -- Create Project Panel -----------------------------------------------------

function CreateProjectPanel() {
  const { t } = useTranslation()
  const createProject = useCreateProject()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const { data: projectsData } = useProjects({ page_size: 100 })
  const [form, setForm] = useState<ProjectCreate>({
    name: '',
    description: null,
    status: 'draft',
    priority: 'medium',
    weather: 'sunny',
    start_date: null,
    end_date: null,
    budget: null,
    manager_id: null,
    parent_id: null,
    tier_id: null,
    asset_id: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createProject.mutateAsync(form)
      closeDynamicPanel()
      toast({ title: 'Projet cree', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouveau projet"
      subtitle="Projets"
      icon={<FolderKanban size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createProject.isPending}
            onClick={() => (document.getElementById('create-project-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createProject.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-project-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title="Identification">
                <FormGrid>
                  <DynamicPanelField label="Code">
                    <span className="text-sm font-mono text-muted-foreground italic">Auto-généré à la création</span>
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom" required>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Nom du projet" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Macro-projet (parent)">
                    <select
                      value={form.parent_id ?? ''}
                      onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
                      className={panelInputClass}
                    >
                      <option value="">Aucun (projet independant)</option>
                      {projectsData?.items?.map(p => (
                        <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                      ))}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Site">
                    <AssetPicker
                      value={form.asset_id || null}
                      onChange={(id) => setForm({ ...form, asset_id: id || null })}
                      label="Site"
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>

              <FormSection title="Planning">
                <FormGrid>
                  <DynamicPanelField label="Date de debut">
                    <input type="date" value={form.start_date?.split('T')[0] ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Date de fin">
                    <input type="date" value={form.end_date?.split('T')[0] ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Budget">
                    <input type="number" step="any" value={form.budget ?? ''} onChange={(e) => setForm({ ...form, budget: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>

            <div className="@container space-y-5">
              <FormSection title="Statut">
                <TagSelector options={STATUS_OPTIONS} value={form.status || 'draft'} onChange={(v) => setForm({ ...form, status: v })} />
              </FormSection>

              <FormSection title="Priorite">
                <TagSelector options={PRIORITY_OPTIONS} value={form.priority || 'medium'} onChange={(v) => setForm({ ...form, priority: v })} />
              </FormSection>

              <FormSection title="Description" collapsible defaultExpanded={false}>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description du projet..."
                  rows={3}
                />
              </FormSection>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Task Status Cycle (click to advance) ------------------------------------

function TaskStatusIcon({ status, size = 13 }: { status: string; size?: number }) {
  const opt = TASK_STATUS_OPTIONS.find(s => s.value === status)
  if (!opt) return <Circle size={size} className="text-muted-foreground" />
  const Icon = opt.icon
  return <Icon size={size} className={opt.color} />
}

function nextTaskStatus(current: string): string {
  const cycle = ['todo', 'in_progress', 'review', 'done']
  const idx = cycle.indexOf(current)
  if (idx === -1) return 'todo'
  return cycle[(idx + 1) % cycle.length]
}

// -- Task Create Form (full, like Gouti task sheet) ---------------------------

function TaskCreateForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const createTask = useCreateProjectTask()
  const { toast } = useToast()
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: '',
    due_date: '',
    estimated_hours: '',
  })

  const handleSubmit = async () => {
    if (!form.title.trim()) return
    try {
      await createTask.mutateAsync({
        projectId,
        payload: {
          title: form.title.trim(),
          description: form.description || null,
          status: form.status,
          priority: form.priority,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        },
      })
      toast({ title: 'Tache creee', variant: 'success' })
      onClose()
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <div className="border border-primary/30 rounded-md bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary">Nouvelle tache</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
      </div>

      <input
        type="text"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className={`${panelInputClass} w-full text-xs`}
        placeholder="Titre de la tache *"
        autoFocus
      />

      <textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className={`${panelInputClass} w-full text-xs min-h-[40px] resize-y`}
        placeholder="Description..."
        rows={2}
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Statut</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={`${panelInputClass} w-full text-xs`}>
            {TASK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Priorite</label>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`${panelInputClass} w-full text-xs`}>
            {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Date debut</label>
          <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={`${panelInputClass} w-full text-xs`} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Date fin</label>
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={`${panelInputClass} w-full text-xs`} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Heures est.</label>
          <input type="number" step="0.5" min="0" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} className={`${panelInputClass} w-full text-xs`} placeholder="0" />
        </div>
      </div>

      <div className="flex justify-end gap-1.5 pt-1">
        <button onClick={onClose} className="px-2.5 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground">Annuler</button>
        <button onClick={handleSubmit} disabled={createTask.isPending || !form.title.trim()} className="px-2.5 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {createTask.isPending ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
          Creer
        </button>
      </div>
    </div>
  )
}

// -- Task Row (interactive, expandable) --------------------------------------

function TaskRow({ task, projectId }: { task: ProjectTask; projectId: string }) {
  const updateTask = useUpdateProjectTask()
  const deleteTask = useDeleteProjectTask()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleStatusChange = (newStatus: string) => {
    updateTask.mutate({ projectId, taskId: task.id, payload: { status: newStatus } })
  }

  const handleFieldSave = (field: string, value: string | number | null) => {
    updateTask.mutate({ projectId, taskId: task.id, payload: { [field]: value } })
  }

  const handleDelete = () => {
    deleteTask.mutate({ projectId, taskId: task.id })
    setConfirmDelete(false)
  }

  const statusOpt = TASK_STATUS_OPTIONS.find(s => s.value === task.status)
  const priorityOpt = PRIORITY_OPTIONS.find(p => p.value === task.priority)

  return (
    <div className="border-b border-border/60 last:border-0">
      {/* Summary row */}
      <div className="group flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <button onClick={(e) => { e.stopPropagation(); handleStatusChange(nextTaskStatus(task.status)) }} className="shrink-0 hover:scale-110 transition-transform" title={statusOpt?.label}>
          <TaskStatusIcon status={task.status} />
        </button>
        <span className={cn('flex-1 truncate font-medium', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</span>
        {(task.priority === 'high' || task.priority === 'critical') && (
          <span className={cn('text-[9px] px-1 rounded', task.priority === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500')}>
            {priorityOpt?.label}
          </span>
        )}
        {task.due_date && (
          <span className="text-muted-foreground text-[10px] tabular-nums">{new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        )}
        {task.progress > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">{task.progress}%</span>}
        {task.assignee_name && <span className="text-muted-foreground text-[10px] max-w-[70px] truncate">{task.assignee_name}</span>}
        {confirmDelete ? (
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleDelete} className="p-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"><Check size={10} /></button>
            <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 size={10} />
          </button>
        )}
      </div>

      {/* Expanded detail (like Gouti task sheet) */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-2.5 border-t border-border/30">
          {/* Status + Priority selectors */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Statut</label>
              <select value={task.status} onChange={(e) => handleStatusChange(e.target.value)} className={`${panelInputClass} w-full text-xs`}>
                {TASK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Priorite</label>
              <select value={task.priority} onChange={(e) => handleFieldSave('priority', e.target.value)} className={`${panelInputClass} w-full text-xs`}>
                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Date debut</label>
              <input
                type="date"
                defaultValue={task.start_date?.split('T')[0] ?? ''}
                onBlur={(e) => handleFieldSave('start_date', e.target.value || null)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Date fin</label>
              <input
                type="date"
                defaultValue={task.due_date?.split('T')[0] ?? ''}
                onBlur={(e) => handleFieldSave('due_date', e.target.value || null)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
          </div>

          {/* Progress + Hours */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Progression %</label>
              <input
                type="number" min="0" max="100" step="5"
                defaultValue={task.progress}
                onBlur={(e) => handleFieldSave('progress', e.target.value ? Number(e.target.value) : 0)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Heures est.</label>
              <input
                type="number" min="0" step="0.5"
                defaultValue={task.estimated_hours ?? ''}
                onBlur={(e) => handleFieldSave('estimated_hours', e.target.value ? Number(e.target.value) : null)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Heures reelles</label>
              <input
                type="number" min="0" step="0.5"
                defaultValue={task.actual_hours ?? ''}
                onBlur={(e) => handleFieldSave('actual_hours', e.target.value ? Number(e.target.value) : null)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Description</label>
            <textarea
              defaultValue={task.description ?? ''}
              onBlur={(e) => handleFieldSave('description', e.target.value || null)}
              className={`${panelInputClass} w-full text-xs min-h-[36px] resize-y`}
              rows={2}
              placeholder="Description de la tache..."
            />
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
            {task.code && <span>Ref: {task.code}</span>}
            {task.assignee_name && <span>Resp: {task.assignee_name}</span>}
            <span>Cree le {new Date(task.created_at).toLocaleDateString('fr-FR')}</span>
            {task.completed_at && <span>Termine le {new Date(task.completed_at).toLocaleDateString('fr-FR')}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// -- Milestone Row (interactive) ---------------------------------------------

function MilestoneRow({ ms, projectId }: { ms: ProjectMilestoneType; projectId: string }) {
  const updateMs = useUpdateProjectMilestone()
  const deleteMs = useDeleteProjectMilestone()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggleComplete = () => {
    if (ms.status === 'completed') {
      updateMs.mutate({ projectId, msId: ms.id, payload: { status: 'pending', completed_at: null } })
    } else {
      updateMs.mutate({ projectId, msId: ms.id, payload: { status: 'completed', completed_at: new Date().toISOString() } })
    }
  }

  return (
    <div className="group flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
      <button onClick={toggleComplete} className="shrink-0 hover:scale-110 transition-transform">
        {ms.status === 'completed'
          ? <CheckCircle2 size={12} className="text-green-500" />
          : ms.status === 'overdue'
            ? <Milestone size={12} className="text-red-500" />
            : <Milestone size={12} className="text-muted-foreground" />
        }
      </button>
      <span className={cn('flex-1 truncate text-foreground', ms.status === 'completed' && 'line-through text-muted-foreground')}>{ms.name}</span>
      {ms.due_date && (
        <span className="text-muted-foreground text-[10px] tabular-nums">{new Date(ms.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
      )}
      {confirmDelete ? (
        <div className="flex items-center gap-0.5">
          <button onClick={() => { deleteMs.mutate({ projectId, msId: ms.id }); setConfirmDelete(false) }} className="p-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"><Check size={10} /></button>
          <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}

// -- Milestone Quick Add -----------------------------------------------------

function MilestoneQuickAdd({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const createMs = useCreateProjectMilestone()

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await createMs.mutateAsync({ projectId, payload: { name: trimmed, due_date: dueDate || null } })
    setName('')
    setDueDate('')
    inputRef.current?.focus()
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
      >
        <Plus size={12} /> Ajouter un jalon
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setOpen(false); setName(''); setDueDate('') } }}
        className={`${panelInputClass} flex-1 text-xs`}
        placeholder="Nom du jalon..."
        autoFocus
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className={`${panelInputClass} w-[110px] text-xs`}
      />
      <button onClick={handleSubmit} disabled={createMs.isPending || !name.trim()} className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-40">
        {createMs.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button onClick={() => { setOpen(false); setName(''); setDueDate('') }} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <X size={12} />
      </button>
    </div>
  )
}

// -- Member Row (interactive) ------------------------------------------------

function MemberRow({ member, projectId }: { member: ProjectMemberType; projectId: string }) {
  const removeMember = useRemoveProjectMember()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const roleLbl = MEMBER_ROLE_OPTIONS.find(r => r.value === member.role)?.label ?? member.role

  return (
    <div className="group flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
      <Users size={11} className="text-muted-foreground shrink-0" />
      <span className="flex-1 truncate text-foreground">{member.member_name || '(inconnu)'}</span>
      <span className="text-muted-foreground text-[10px]">{roleLbl}</span>
      {confirmDelete ? (
        <div className="flex items-center gap-0.5">
          <button onClick={() => { removeMember.mutate({ projectId, memberId: member.id }); setConfirmDelete(false) }} className="p-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"><Check size={10} /></button>
          <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}

// -- Member Quick Add --------------------------------------------------------

function MemberQuickAdd({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('member')
  const addMember = useAddProjectMember()

  const handleSubmit = async () => {
    if (!userId.trim()) return
    await addMember.mutateAsync({ projectId, payload: { user_id: userId.trim(), role } })
    setUserId('')
    setRole('member')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
      >
        <UserPlus size={12} /> Ajouter un membre
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setOpen(false); setUserId('') } }}
        className={`${panelInputClass} flex-1 text-xs`}
        placeholder="ID utilisateur..."
        autoFocus
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} className={`${panelInputClass} w-[100px] text-xs`}>
        {MEMBER_ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <button onClick={handleSubmit} disabled={addMember.isPending || !userId.trim()} className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-40">
        {addMember.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button onClick={() => { setOpen(false); setUserId('') }} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <X size={12} />
      </button>
    </div>
  )
}

// -- Task Section (list + create) — like Gouti "Progression et controle" -----

function TaskSection({ projectId, tasks }: { projectId: string; tasks: ProjectTask[] }) {
  const [showCreate, setShowCreate] = useState(false)

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length
  const reviewCount = tasks.filter(t => t.status === 'review').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <FormSection
      title={`Taches (${tasks.length})`}
      collapsible
      defaultExpanded
      storageKey="project-detail-tasks"
    >
      {/* Kanban counters — like Gouti kanban columns header */}
      <div className="flex items-center gap-2 text-[10px] mb-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{todoCount} a faire</span>
        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{inProgressCount} en cours</span>
        {reviewCount > 0 && <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600">{reviewCount} revue</span>}
        <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">{doneCount} terminees</span>
      </div>

      {/* Task list */}
      {tasks.length > 0 ? (
        <div className="border border-border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} projectId={projectId} />
          ))}
        </div>
      ) : (
        <EmptyState icon={ListTodo} title="Aucune tache" variant="search" size="compact" />
      )}

      {/* Create form or button */}
      {showCreate ? (
        <TaskCreateForm projectId={projectId} onClose={() => setShowCreate(false)} />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
        >
          <Plus size={12} /> Ajouter une tache
        </button>
      )}
    </FormSection>
  )
}

// -- Project Detail Panel -----------------------------------------------------

function ProjectDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: project, isLoading } = useProject(id)
  const updateProject = useUpdateProject()
  const archiveProject = useArchiveProject()
  const { data: tasks } = useProjectTasks(id)
  const { data: members } = useProjectMembers(id)
  const { data: milestones } = useProjectMilestones(id)
  const { data: linkedAsset } = useAsset(project?.asset_id ?? '')
  const { toast } = useToast()

  const handleSave = useCallback((field: string, value: string) => {
    updateProject.mutate({ id, payload: { [field]: value } })
  }, [id, updateProject])

  const handleArchive = useCallback(async () => {
    await archiveProject.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Projet archive', variant: 'success' })
  }, [id, archiveProject, closeDynamicPanel, toast])

  if (isLoading || !project) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<FolderKanban size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={project.code}
      subtitle={project.name}
      icon={<FolderKanban size={14} className="text-primary" />}
      actions={
        <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleArchive} confirmLabel="Archiver ?">
          Archiver
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        <TagManager ownerType="project" ownerId={project.id} compact />

        {/* Quick stats — inspired by Gouti "Donnees quantitatives et acces rapide" */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1"><WeatherIcon weather={project.weather} size={14} /> {WEATHER_OPTIONS.find(w => w.value === project.weather)?.label}</div>
          <div className="flex items-center gap-1"><Target size={11} /> {project.progress}%</div>
          <div className="flex items-center gap-1"><ListTodo size={11} /> {tasks?.length ?? 0} taches</div>
          <div className="flex items-center gap-1"><Users size={11} /> {members?.length ?? 0} personnes</div>
          <div className="flex items-center gap-1"><Milestone size={11} /> {milestones?.length ?? 0} jalons</div>
        </div>

        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title="Fiche projet" collapsible defaultExpanded storageKey="project-detail-fiche">
              <DetailFieldGrid>
                <InlineEditableRow label="Nom" value={project.name} onSave={(v) => handleSave('name', v)} />
                <ReadOnlyRow label="Code" value={<span className="text-sm font-mono font-medium text-foreground">{project.code || '—'}</span>} />
                <InlineEditableTags label="Statut" value={project.status} options={STATUS_OPTIONS} onSave={(v) => handleSave('status', v)} />
                <InlineEditableTags label="Priorite" value={project.priority} options={PRIORITY_OPTIONS} onSave={(v) => handleSave('priority', v)} />
                <InlineEditableTags label="Meteo" value={project.weather} options={WEATHER_OPTIONS.map(w => ({ value: w.value, label: w.label }))} onSave={(v) => handleSave('weather', v)} />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <ReadOnlyRow label="Chef de projet" value={project.manager_name || '--'} />
                <ReadOnlyRow label="Entreprise" value={
                  project.tier_id ? (
                    <CrossModuleLink module="tiers" id={project.tier_id} label={project.tier_name || project.tier_id} mode="navigate" />
                  ) : (project.tier_name || '--')
                } />
                <ReadOnlyRow label="Budget" value={project.budget ? `${project.budget.toLocaleString('fr-FR')} XAF` : '--'} />
                <ReadOnlyRow label="Site / Asset" value={
                  project.asset_id ? (
                    <CrossModuleLink module="assets" id={project.asset_id} label={linkedAsset ? `${linkedAsset.code} — ${linkedAsset.name}` : project.asset_id.slice(0, 8) + '…'} mode="navigate" />
                  ) : '--'
                } />
              </DetailFieldGrid>
            </FormSection>

            <FormSection title="Planning" collapsible defaultExpanded storageKey="project-detail-planning">
              <DetailFieldGrid>
                <ReadOnlyRow label="Debut" value={project.start_date ? new Date(project.start_date).toLocaleDateString('fr-FR') : '--'} />
                <ReadOnlyRow label="Fin prevue" value={project.end_date ? new Date(project.end_date).toLocaleDateString('fr-FR') : '--'} />
                <ReadOnlyRow label="Fin reelle" value={project.actual_end_date ? new Date(project.actual_end_date).toLocaleDateString('fr-FR') : '--'} />
              </DetailFieldGrid>
            </FormSection>

            {/* Sub-projects — macro-projet hierarchy */}
            {(project.children_count ?? 0) > 0 && (
              <FormSection title={`Sous-projets (${project.children_count})`} collapsible defaultExpanded storageKey="project-detail-children">
                <SubProjectsSection projectId={id} />
              </FormSection>
            )}

            {/* Parent project link */}
            {project.parent_id && project.parent_name && (
              <FormSection title="Macro-projet" collapsible defaultExpanded storageKey="project-detail-parent">
                <div
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 px-2 py-1.5 rounded"
                  onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: project.parent_id! })}
                >
                  <Layers size={12} className="text-primary" />
                  <span className="font-medium">{project.parent_name}</span>
                  <ChevronRight size={12} className="text-muted-foreground ml-auto" />
                </div>
              </FormSection>
            )}

            {/* Equipe / Members — like Gouti "Gestion > Les collaborateurs" */}
            <FormSection title={`Equipe (${members?.length ?? 0})`} collapsible defaultExpanded storageKey="project-detail-equipe">
              {members && members.length > 0 ? (
                <div>
                  {members.map((m) => <MemberRow key={m.id} member={m} projectId={id} />)}
                </div>
              ) : (
                <EmptyState icon={Users} title="Aucun membre" variant="search" size="compact" />
              )}
              <MemberQuickAdd projectId={id} />
            </FormSection>
          </div>

          <div className="@container space-y-5">
            {/* Tasks — inspired by Gouti "Progression et controle > Liste des taches" */}
            <TaskSection projectId={id} tasks={tasks ?? []} />

            {/* Milestones — like Gouti "Cadrage > Jalons" */}
            <FormSection title={`Jalons (${milestones?.length ?? 0})`} collapsible defaultExpanded storageKey="project-detail-jalons">
              {milestones && milestones.length > 0 ? (
                <div>
                  {milestones.map((ms) => (
                    <MilestoneRow key={ms.id} ms={ms} projectId={id} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={Milestone} title="Aucun jalon" variant="search" size="compact" />
              )}
              <MilestoneQuickAdd projectId={id} />
            </FormSection>
          </div>
        </SectionColumns>

        {/* Notes & Documents */}
        <FormSection title="Notes & Documents" collapsible defaultExpanded={false} storageKey="project-detail-docs">
          <DetailFieldGrid>
            <div>
              <NoteManager ownerType="project" ownerId={project.id} compact />
            </div>
            <div>
              <AttachmentManager ownerType="project" ownerId={project.id} compact />
            </div>
          </DetailFieldGrid>
        </FormSection>

        <FormSection title="Description" collapsible defaultExpanded={false} storageKey="project-detail-desc">
          <InlineEditableRow label="Description" value={project.description || ''} onSave={(v) => handleSave('description', v)} />
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Spreadsheet View (MS Project-like) ----------------------------------------

function SpreadsheetView() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterProjectId, setFilterProjectId] = useState<string | undefined>(undefined)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const { toast } = useToast()

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const priorityFilter = typeof activeFilters.priority === 'string' ? activeFilters.priority : undefined

  const { data, isLoading } = useAllProjectTasks({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    project_id: filterProjectId,
    status: statusFilter,
    priority: priorityFilter,
  })

  // Projects list for filter dropdown
  const { data: projectsData } = useProjects({ page_size: 100 })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, filterProjectId])

  const handleInlineSave = useCallback(async (row: ProjectTaskEnriched, columnId: string, value: unknown) => {
    try {
      await projetsService.updateTask(row.project_id, row.id, { [columnId]: value })
      toast({ title: 'Modifie', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [toast])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'multi-select', operators: ['is', 'is_not'], options: TASK_STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'priority', label: 'Priorite', type: 'select', options: PRIORITY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const inlineEdit = useMemo<InlineEditConfig<ProjectTaskEnriched>>(() => ({
    editableColumns: ['title', 'status', 'priority', 'start_date', 'due_date', 'progress', 'estimated_hours', 'actual_hours'],
    onSave: handleInlineSave,
  }), [handleInlineSave])

  const columns = useMemo<ColumnDef<ProjectTaskEnriched, unknown>[]>(() => [
    {
      accessorKey: 'project_code', header: 'Projet', size: 90, enableResizing: true,
      cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.project_code}</span>,
    },
    {
      accessorKey: 'code', header: 'Ref', size: 70,
      cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.code || '--'}</span>,
    },
    {
      accessorKey: 'title', header: 'Tache', size: 280, enableResizing: true,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <TaskStatusIcon status={row.original.status} size={12} />
          <span className={cn('truncate', row.original.status === 'done' && 'line-through text-muted-foreground')}>
            {row.original.title}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'status', header: 'Statut', size: 100,
      cell: ({ row }) => {
        const opt = TASK_STATUS_OPTIONS.find(s => s.value === row.original.status)
        return <span className={cn('text-xs', opt?.color)}>{opt?.label ?? row.original.status}</span>
      },
    },
    {
      accessorKey: 'priority', header: 'Priorite', size: 80,
      cell: ({ row }) => {
        const p = row.original.priority
        const cls = p === 'critical' ? 'gl-badge-danger' : p === 'high' ? 'gl-badge-warning' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{PRIORITY_OPTIONS.find(o => o.value === p)?.label ?? p}</span>
      },
    },
    {
      accessorKey: 'start_date', header: 'Debut', size: 100,
      cell: ({ row }) => row.original.start_date
        ? <span className="text-xs tabular-nums">{new Date(row.original.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
    {
      accessorKey: 'due_date', header: 'Fin', size: 100,
      cell: ({ row }) => row.original.due_date
        ? <span className="text-xs tabular-nums">{new Date(row.original.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
    {
      accessorKey: 'progress', header: '%', size: 70,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${row.original.progress}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">{row.original.progress}%</span>
        </div>
      ),
    },
    {
      accessorKey: 'estimated_hours', header: 'H.Est', size: 60,
      cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{row.original.estimated_hours ?? '--'}</span>,
    },
    {
      accessorKey: 'actual_hours', header: 'H.Reel', size: 60,
      cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{row.original.actual_hours ?? '--'}</span>,
    },
    {
      accessorKey: 'assignee_name', header: 'Responsable', size: 130,
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.assignee_name || '--'}</span>,
    },
  ], [])

  const pagination: DataTablePagination | undefined = data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined

  return (
    <div className="flex flex-col h-full">
      {/* Project filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <Sheet size={14} className="text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Projet:</span>
        <select
          value={filterProjectId || ''}
          onChange={(e) => setFilterProjectId(e.target.value || undefined)}
          className="text-xs border border-border rounded px-2 py-1 bg-background min-w-[180px]"
        >
          <option value="">Tous les projets</option>
          {projectsData?.items?.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground ml-auto">Double-clic sur une cellule pour editer</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <DataTable<ProjectTaskEnriched>
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          pagination={pagination}
          onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher par tache ou code projet..."
          filters={filters}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          inlineEdit={inlineEdit}
          emptyIcon={Sheet}
          emptyTitle="Aucune tache"
          columnResizing
          columnPinning
          columnVisibility
          defaultPinnedColumns={{ left: ['project_code', 'title'] }}
          compact
          storageKey="projets-spreadsheet"
        />
      </div>
    </div>
  )
}

// -- Macro Planning View -------------------------------------------------------

interface PlanningConfig {
  showProjects: boolean
  showTasks: boolean
  showMilestones: boolean
  levelDepth: number  // 1 = projects only, 2 = +tasks, 3 = +sub-tasks
  colorBy: 'status' | 'priority' | 'weather'
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-300', planned: 'bg-blue-300', active: 'bg-green-400',
  on_hold: 'bg-yellow-400', completed: 'bg-emerald-500', cancelled: 'bg-red-400',
  todo: 'bg-gray-300', in_progress: 'bg-blue-400', review: 'bg-yellow-400', done: 'bg-green-500',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-300', medium: 'bg-blue-300', high: 'bg-orange-400', critical: 'bg-red-500',
}
const WEATHER_COLORS: Record<string, string> = {
  sunny: 'bg-yellow-400', cloudy: 'bg-gray-400', rainy: 'bg-blue-500', stormy: 'bg-red-500',
}

function getBarColor(item: { status?: string; priority?: string; weather?: string }, colorBy: string): string {
  if (colorBy === 'priority') return PRIORITY_COLORS[(item as Record<string, string>).priority] || 'bg-gray-300'
  if (colorBy === 'weather') return WEATHER_COLORS[(item as Record<string, string>).weather] || 'bg-gray-300'
  return STATUS_COLORS[(item as Record<string, string>).status] || 'bg-gray-300'
}

function MacroPlanningView() {
  const [config, setConfig] = useState<PlanningConfig>({
    showProjects: true,
    showTasks: true,
    showMilestones: true,
    levelDepth: 2,
    colorBy: 'status',
  })

  const { data: projectsData, isLoading } = useProjects({ page_size: 100 })
  const projects = projectsData?.items ?? []

  // Date range: min/max across all projects
  const allDates = useMemo(() => {
    const dates: number[] = []
    for (const p of projects) {
      if (p.start_date) dates.push(new Date(p.start_date).getTime())
      if (p.end_date) dates.push(new Date(p.end_date).getTime())
    }
    if (dates.length === 0) {
      const now = Date.now()
      return { min: now - 30 * 86400000, max: now + 180 * 86400000 }
    }
    const min = Math.min(...dates) - 7 * 86400000
    const max = Math.max(...dates) + 30 * 86400000
    return { min, max }
  }, [projects])

  const totalDays = Math.max(1, Math.ceil((allDates.max - allDates.min) / 86400000))

  // Generate month headers
  const months = useMemo(() => {
    const result: { label: string; startPct: number; widthPct: number }[] = []
    const startDate = new Date(allDates.min)
    startDate.setDate(1)
    const endDate = new Date(allDates.max)
    let current = new Date(startDate)
    while (current <= endDate) {
      const monthStart = Math.max(0, (current.getTime() - allDates.min) / 86400000)
      const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1)
      const monthEnd = Math.min(totalDays, (nextMonth.getTime() - allDates.min) / 86400000)
      result.push({
        label: current.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        startPct: (monthStart / totalDays) * 100,
        widthPct: ((monthEnd - monthStart) / totalDays) * 100,
      })
      current = nextMonth
    }
    return result
  }, [allDates, totalDays])

  const getBarStyle = (startDateStr: string | null, endDateStr: string | null) => {
    if (!startDateStr) return null
    const start = new Date(startDateStr).getTime()
    const end = endDateStr ? new Date(endDateStr).getTime() : start + 30 * 86400000
    const left = ((start - allDates.min) / 86400000 / totalDays) * 100
    const width = Math.max(1, ((end - start) / 86400000 / totalDays) * 100)
    return { left: `${left}%`, width: `${width}%` }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Config toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 flex-wrap">
        <CalendarRange size={14} className="text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Macro-Planning</span>

        <div className="flex items-center gap-1.5 ml-4">
          <span className="text-[10px] text-muted-foreground">Niveaux:</span>
          {[1, 2, 3].map(level => (
            <button
              key={level}
              onClick={() => setConfig(c => ({ ...c, levelDepth: level }))}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] border',
                config.levelDepth === level ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Couleur:</span>
          {(['status', 'priority', 'weather'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setConfig(c => ({ ...c, colorBy: opt }))}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] border',
                config.colorBy === opt ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              {opt === 'status' ? 'Statut' : opt === 'priority' ? 'Priorite' : 'Meteo'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={config.showTasks} onChange={(e) => setConfig(c => ({ ...c, showTasks: e.target.checked }))} className="w-3 h-3" />
            Taches
          </label>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={config.showMilestones} onChange={(e) => setConfig(c => ({ ...c, showMilestones: e.target.checked }))} className="w-3 h-3" />
            Jalons
          </label>
        </div>
      </div>

      {/* Planning grid */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
        ) : projects.length === 0 ? (
          <EmptyState icon={CalendarRange} title="Aucun projet" variant="search" />
        ) : (
          <div className="min-w-[900px]">
            {/* Month headers */}
            <div className="flex border-b border-border bg-muted/50 sticky top-0 z-10">
              <div className="w-[260px] shrink-0 px-3 py-1.5 text-[10px] font-medium text-muted-foreground border-r border-border">Nom</div>
              <div className="flex-1 relative h-7">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full text-[10px] text-muted-foreground flex items-center px-1 border-r border-border/40"
                    style={{ left: `${m.startPct}%`, width: `${m.widthPct}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Project rows */}
            {projects.map((project) => (
              <PlanningProjectRow
                key={project.id}
                project={project}
                config={config}
                getBarStyle={getBarStyle}
                allDates={allDates}
                totalDays={totalDays}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PlanningProjectRow({
  project, config, getBarStyle, allDates, totalDays,
}: {
  project: Project
  config: PlanningConfig
  getBarStyle: (s: string | null, e: string | null) => { left: string; width: string } | null
  allDates: { min: number; max: number }
  totalDays: number
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: tasks } = useProjectTasks(expanded && config.levelDepth >= 2 ? project.id : undefined)
  const { data: milestones } = useProjectMilestones(expanded && config.showMilestones ? project.id : undefined)

  const barStyle = getBarStyle(project.start_date, project.end_date)
  const isMacro = (project.children_count ?? 0) > 0

  return (
    <>
      {/* Project bar */}
      <div
        className={cn('flex border-b border-border/50 hover:bg-muted/30 cursor-pointer', isMacro && 'bg-muted/20')}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-[260px] shrink-0 px-3 py-1.5 flex items-center gap-1.5 border-r border-border">
          <ChevronRight size={12} className={cn('text-muted-foreground transition-transform shrink-0', expanded && 'rotate-90')} />
          {isMacro && <Layers size={11} className="text-primary shrink-0" />}
          <span className={cn('text-xs truncate', isMacro ? 'font-semibold' : 'font-medium')}>{project.code}</span>
          <span className="text-[10px] text-muted-foreground truncate">{project.name}</span>
        </div>
        <div className="flex-1 relative py-1.5 min-h-[28px]">
          {barStyle && (
            <div
              className={cn('absolute h-4 rounded-sm top-1/2 -translate-y-1/2', getBarColor(project, config.colorBy))}
              style={barStyle}
              title={`${project.name} — ${project.status} (${project.progress}%)`}
            >
              <span className="text-[9px] text-white px-1 truncate block leading-4">{project.progress}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: tasks + milestones */}
      {expanded && config.showTasks && config.levelDepth >= 2 && tasks?.map((task) => {
        const tBarStyle = getBarStyle(task.start_date, task.due_date)
        return (
          <div key={task.id} className="flex border-b border-border/30 bg-background">
            <div className="w-[260px] shrink-0 px-3 py-1 flex items-center gap-1.5 border-r border-border pl-8">
              <TaskStatusIcon status={task.status} size={10} />
              <span className={cn('text-[11px] truncate', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</span>
            </div>
            <div className="flex-1 relative py-1 min-h-[22px]">
              {tBarStyle && (
                <div
                  className={cn('absolute h-3 rounded-sm top-1/2 -translate-y-1/2', getBarColor(task, config.colorBy))}
                  style={tBarStyle}
                  title={`${task.title} — ${task.status}`}
                />
              )}
            </div>
          </div>
        )
      })}

      {expanded && config.showMilestones && milestones?.map((ms) => {
        if (!ms.due_date) return null
        const msDay = (new Date(ms.due_date).getTime() - allDates.min) / 86400000
        const leftPct = (msDay / totalDays) * 100
        return (
          <div key={ms.id} className="flex border-b border-border/30 bg-background">
            <div className="w-[260px] shrink-0 px-3 py-1 flex items-center gap-1.5 border-r border-border pl-8">
              <Milestone size={10} className={ms.status === 'completed' ? 'text-green-500' : 'text-yellow-500'} />
              <span className="text-[11px] truncate text-muted-foreground">{ms.name}</span>
            </div>
            <div className="flex-1 relative py-1 min-h-[22px]">
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-yellow-500 border border-yellow-600"
                style={{ left: `${leftPct}%` }}
                title={`${ms.name} — ${new Date(ms.due_date).toLocaleDateString('fr-FR')}`}
              />
            </div>
          </div>
        )
      })}
    </>
  )
}

// -- Sub-Projects Section (for detail panel) ----------------------------------

function SubProjectsSection({ projectId }: { projectId: string }) {
  const { data: children, isLoading } = useSubProjects(projectId)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  if (isLoading) return <div className="text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin inline mr-1" />Chargement...</div>
  if (!children || children.length === 0) return <EmptyState icon={Layers} title="Aucun sous-projet" variant="search" size="compact" />

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {children.map((child) => (
        <div
          key={child.id}
          className="flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-muted/40 transition-colors cursor-pointer border-b border-border/60 last:border-0"
          onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: child.id })}
        >
          <FolderKanban size={11} className="text-primary shrink-0" />
          <span className="font-medium">{child.code}</span>
          <span className="text-muted-foreground truncate flex-1">{child.name}</span>
          <span className={cn('gl-badge', child.status === 'active' ? 'gl-badge-success' : 'gl-badge-neutral')}>
            {STATUS_OPTIONS.find(s => s.value === child.status)?.label ?? child.status}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{child.progress}%</span>
          <ChevronRight size={12} className="text-muted-foreground" />
        </div>
      ))}
    </div>
  )
}

// -- View Tab Selector --------------------------------------------------------

type ViewTab = 'projets' | 'tableur' | 'planning'

function ViewTabSelector({ active, onChange }: { active: ViewTab; onChange: (tab: ViewTab) => void }) {
  const tabs: { id: ViewTab; label: string; icon: typeof FolderKanban }[] = [
    { id: 'projets', label: 'Projets', icon: FolderKanban },
    { id: 'tableur', label: 'Tableur', icon: Sheet },
    { id: 'planning', label: 'Planning', icon: CalendarRange },
  ]

  return (
    <div className="flex items-center gap-0.5 px-1 py-0.5 bg-muted/50 rounded-md">
      {tabs.map(tab => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
              active === tab.id
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Icon size={12} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// -- Main Page ----------------------------------------------------------------

function ProjectsListView() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  const { hasPermission } = usePermission()
  const canImport = hasPermission('project.import')
  const canExport = hasPermission('project.export') || hasPermission('project.read')

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const priorityFilter = typeof activeFilters.priority === 'string' ? activeFilters.priority : undefined

  const { data, isLoading } = useProjects({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter,
    priority: priorityFilter,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  useEffect(() => {
    if (data?.items) setNavItems(data.items.map(i => i.id))
    return () => setNavItems([])
  }, [data?.items, setNavItems])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'multi-select', operators: ['is', 'is_not'], options: STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'priority', label: 'Priorite', type: 'select', options: PRIORITY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  const columns = useMemo<ColumnDef<Project, unknown>[]>(() => [
    { accessorKey: 'code', header: 'Code', size: 100, cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {(row.original.children_count ?? 0) > 0 && <Layers size={10} className="text-primary" />}
        <span className="font-medium text-foreground">{row.original.code}</span>
      </div>
    )},
    { accessorKey: 'name', header: 'Nom', cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    {
      accessorKey: 'status', header: 'Statut', size: 100,
      cell: ({ row }) => {
        const s = row.original.status
        const cls = s === 'active' ? 'gl-badge-success' : s === 'completed' ? 'gl-badge-info' : s === 'on_hold' || s === 'cancelled' ? 'gl-badge-danger' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{STATUS_OPTIONS.find(o => o.value === s)?.label ?? s}</span>
      },
    },
    { accessorKey: 'weather', header: 'Meteo', size: 60, cell: ({ row }) => <WeatherIcon weather={row.original.weather} /> },
    {
      accessorKey: 'progress', header: '%', size: 60,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${row.original.progress}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{row.original.progress}%</span>
        </div>
      ),
    },
    {
      accessorKey: 'priority', header: 'Priorite', size: 80,
      cell: ({ row }) => {
        const p = row.original.priority
        const cls = p === 'critical' ? 'gl-badge-danger' : p === 'high' ? 'gl-badge-warning' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{PRIORITY_OPTIONS.find(o => o.value === p)?.label ?? p}</span>
      },
    },
    { accessorKey: 'manager_name', header: 'Chef de projet', size: 140, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.manager_name || '--'}</span> },
    { accessorKey: 'task_count', header: 'Taches', size: 70, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.task_count ?? 0}</span> },
    {
      accessorKey: 'parent_name', header: 'Macro-projet', size: 130,
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.parent_name || '--'}</span>,
    },
    { accessorKey: 'tier_name', header: 'Entreprise', size: 130, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.tier_name || '--'}</span> },
    {
      accessorKey: 'end_date', header: 'Echeance', size: 100,
      cell: ({ row }) => row.original.end_date
        ? <span className="text-muted-foreground text-xs">{new Date(row.original.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
  ], [])

  const pagination: DataTablePagination | undefined = data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined

  return (
    <DataTable<Project>
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Rechercher par code ou nom..."
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'projets', id: row.id })}
      importExport={(canExport || canImport) ? {
        exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
        advancedExport: true,
        importWizardTarget: canImport ? 'project' : undefined,
        filenamePrefix: 'projets',
      } : undefined}
      emptyIcon={FolderKanban}
      emptyTitle="Aucun projet"
      columnResizing
      columnPinning
      columnVisibility
      defaultPinnedColumns={{ left: ['code'] }}
      defaultHiddenColumns={['tier_name', 'end_date', 'parent_name']}
      storageKey="projets"
    />
  )
}

export function ProjetsPage() {
  useTranslation()
  const [viewTab, setViewTab] = useState<ViewTab>('projets')

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'projets'

  return (
    <div className="flex h-full">
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={FolderKanban} title="Projets" subtitle="Gestion de projets">
          <ViewTabSelector active={viewTab} onChange={setViewTab} />
          <ToolbarButton icon={Plus} label="Nouveau projet" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'projets' })} />
        </PanelHeader>

        <PanelContent>
          {viewTab === 'projets' && <ProjectsListView />}
          {viewTab === 'tableur' && <SpreadsheetView />}
          {viewTab === 'planning' && <MacroPlanningView />}
        </PanelContent>
      </div>}

      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'create' && <CreateProjectPanel />}
      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'detail' && <ProjectDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

registerPanelRenderer('projets', (view) => {
  if (view.type === 'create') return <CreateProjectPanel />
  if (view.type === 'detail' && 'id' in view) return <ProjectDetailPanel id={view.id} />
  return null
})
