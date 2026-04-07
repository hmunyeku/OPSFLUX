import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Code2,
  GitBranch,
  Settings2,
  Shield,
  Timer,
  Trash2,
  User,
  XCircle,
  Zap,
} from 'lucide-react'
import type { Edge, Node } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { DangerConfirmButton } from '@/components/layout/DynamicPanel'
import type { WorkflowNodeDef } from '@/services/workflowService'
import { NODE_TYPE_CONFIG, type ValidationIssue } from './workflowFlow'

const TOOLBOX_CATEGORIES = [
  { labelKey: 'workflow.toolbox.flow', types: ['start', 'condition', 'parallel', 'timer'] as const },
  { labelKey: 'workflow.toolbox.actions', types: ['human_validation', 'system_check', 'notification'] as const },
  { labelKey: 'workflow.toolbox.end', types: ['end_approved', 'end_rejected', 'end_cancelled'] as const },
]

export function EditorToolbox({ onAddNode }: { onAddNode: (type: WorkflowNodeDef['type']) => void }) {
  const { t } = useTranslation()
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
        {!collapsed && <span className="flex-1 text-left uppercase tracking-wider">{t('workflow.toolbox.blocks')}</span>}
        <ArrowLeft size={10} className={cn('transition-transform', collapsed && 'rotate-180')} />
      </button>
      {!collapsed && (
        <div className="px-1.5 pb-1.5 space-y-1">
          {TOOLBOX_CATEGORIES.map((category) => (
            <div key={category.labelKey}>
              <p className="text-[8px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-1 mb-0.5">{t(category.labelKey)}</p>
              {category.types.map((key) => {
                const config = NODE_TYPE_CONFIG[key]
                return (
                  <button
                    key={key}
                    type="button"
                    draggable
                    onClick={() => onAddNode(key)}
                    onDragStart={(event) => onDragStart(event, key)}
                    className={cn(
                      'w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left cursor-grab active:cursor-grabbing',
                      'hover:bg-accent/60 transition-colors',
                      config.color,
                    )}
                    title={t(config.descriptionKey)}
                  >
                    {config.icon}
                    <span className="text-[10px] font-medium text-foreground truncate">{t(config.labelKey)}</span>
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

export function NodeConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
  availableRoles,
  structureLocked = false,
}: {
  node: Node
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onDelete: (id: string) => void
  onClose: () => void
  availableRoles: string[]
  structureLocked?: boolean
}) {
  const { t } = useTranslation()
  const nodeType = (node.data.nodeType as WorkflowNodeDef['type']) || 'start'
  const config = NODE_TYPE_CONFIG[nodeType]

  return (
    <div className="w-[260px] shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <span className={config.color}>{config.icon}</span>
          <h3 className="text-xs font-semibold text-foreground">{t(config.labelKey)}</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <XCircle size={14} />
        </button>
      </div>

      <div className="px-3 pt-2 pb-1">
        <p className="text-[10px] text-muted-foreground italic">{t(config.descriptionKey)}</p>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{t('workflow.label')}</label>
          <input
            type="text"
            className="gl-form-input text-xs w-full"
            defaultValue={(node.data.label as string) || ''}
            disabled={structureLocked}
            onBlur={(event) => onUpdate(node.id, { ...node.data, label: event.target.value })}
          />
        </div>

        {nodeType === 'human_validation' && !structureLocked && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Shield size={10} className="inline mr-0.5" /> {t('workflow.required_roles')}
            </label>
            <select
              className="gl-form-input text-xs w-full mb-1"
              value=""
              onChange={(event) => {
                if (!event.target.value) return
                const existing = (node.data.role as string) || ''
                const roles = existing ? existing.split(',').map((role) => role.trim()) : []
                if (!roles.includes(event.target.value)) {
                  roles.push(event.target.value)
                  onUpdate(node.id, { ...node.data, role: roles.join(', ') })
                }
                event.target.value = ''
              }}
            >
              <option value="">{t('workflow.add_role')}</option>
              {availableRoles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <input
              type="text"
              className="gl-form-input text-xs w-full font-mono"
              placeholder={t('workflow.roles_placeholder')}
              defaultValue={(node.data.role as string) || ''}
              onBlur={(event) => onUpdate(node.id, { ...node.data, role: event.target.value })}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              {t('workflow.required_roles_help')}
            </p>
          </div>
        )}

        {nodeType === 'condition' && !structureLocked && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Code2 size={10} className="inline mr-0.5" /> {t('workflow.expression')}
            </label>
            <input
              type="text"
              className="gl-form-input text-xs w-full font-mono"
              placeholder={t('workflow.expression_placeholder')}
              defaultValue={(node.data.expression as string) || ''}
              onBlur={(event) => onUpdate(node.id, { ...node.data, expression: event.target.value })}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              {t('workflow.expression_help')}
            </p>
          </div>
        )}

        {nodeType === 'timer' && !structureLocked && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Timer size={10} className="inline mr-0.5" /> {t('workflow.duration_hours')}
            </label>
            <input
              type="number"
              className="gl-form-input text-xs w-full"
              placeholder={t('workflow.duration_placeholder')}
              min={1}
              step={1}
              defaultValue={(node.data.duration_hours as number) || ''}
              onBlur={(event) => onUpdate(node.id, { ...node.data, duration_hours: Number(event.target.value) })}
            />
          </div>
        )}

        {nodeType === 'notification' && !structureLocked && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Bell size={10} className="inline mr-0.5" /> {t('workflow.template')}
            </label>
            <input
              type="text"
              className="gl-form-input text-xs w-full"
              placeholder={t('workflow.template_placeholder')}
              defaultValue={(node.data.template as string) || ''}
              onBlur={(event) => onUpdate(node.id, { ...node.data, template: event.target.value })}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              {t('workflow.template_help')}
            </p>
          </div>
        )}

        {nodeType === 'system_check' && !structureLocked && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1">
              <Settings2 size={10} className="inline mr-0.5" /> {t('workflow.system_check')}
            </label>
            <input
              type="text"
              className="gl-form-input text-xs w-full font-mono"
              placeholder={t('workflow.system_check_placeholder')}
              defaultValue={(node.data.check_name as string) || ''}
              onBlur={(event) => onUpdate(node.id, { ...node.data, check_name: event.target.value })}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              {t('workflow.system_check_help')}
            </p>
          </div>
        )}

        {structureLocked ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            {t('workflow.node_locked_help')}
          </div>
        ) : (
          <div className="pt-2 border-t border-border/50">
            <DangerConfirmButton
              icon={<Trash2 size={12} />}
              onConfirm={() => { onDelete(node.id); onClose() }}
              confirmLabel={t('common.confirm_question')}
            >
              {t('workflow.delete_node')}
            </DangerConfirmButton>
          </div>
        )}
      </div>
    </div>
  )
}

export function EdgeConfigPanel({
  edge,
  onUpdate,
  onDelete,
  onClose,
  availableRoles,
  structureLocked = false,
}: {
  edge: Edge
  onUpdate: (id: string, changes: Partial<Edge>) => void
  onDelete: (id: string) => void
  onClose: () => void
  availableRoles: string[]
  structureLocked?: boolean
}) {
  const { t } = useTranslation()
  const assignee = edge.data?.assignee && typeof edge.data.assignee === 'object'
    ? edge.data.assignee as Record<string, unknown>
    : undefined
  const assigneeResolver = assignee?.resolver === 'field' || assignee?.resolver === 'role' ? String(assignee.resolver) : ''

  return (
    <div className="w-[260px] shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1">
          <ArrowRight size={12} /> {t('workflow.transition')}
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <XCircle size={14} />
        </button>
      </div>
      <div className="p-3 space-y-3">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{t('workflow.label')}</label>
          <input
            type="text"
            className="gl-form-input text-xs w-full"
            defaultValue={(edge.label as string) || ''}
            placeholder={t('workflow.transition_label_placeholder')}
            disabled={structureLocked && !edge.id}
            onBlur={(event) => onUpdate(edge.id, { label: event.target.value })}
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{t('workflow.trigger')}</label>
          <div className="flex gap-1">
            <button
              onClick={() => onUpdate(edge.id, { animated: false })}
              disabled={structureLocked && !edge.id}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                !edge.animated ? 'bg-primary/15 text-primary' : 'bg-accent/50 text-muted-foreground hover:bg-accent',
              )}
            >
              <User size={10} className="inline mr-1" />{t('workflow.manual')}
            </button>
            <button
              onClick={() => onUpdate(edge.id, { animated: true })}
              disabled={structureLocked && !edge.id}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                edge.animated ? 'bg-primary/15 text-primary' : 'bg-accent/50 text-muted-foreground hover:bg-accent',
              )}
            >
              <Zap size={10} className="inline mr-1" />{t('workflow.auto')}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">
            <Code2 size={10} className="inline mr-0.5" /> {t('workflow.optional_condition')}
          </label>
          <input
            type="text"
            className="gl-form-input text-xs w-full font-mono"
            placeholder={t('workflow.condition_placeholder')}
            defaultValue={(edge.data?.condition as string) || ''}
            onBlur={(event) => onUpdate(edge.id, { data: { ...edge.data, condition: event.target.value || undefined } })}
          />
          <p className="text-[9px] text-muted-foreground mt-1">
            {t('workflow.condition_help')}
          </p>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">
            <Shield size={10} className="inline mr-0.5" /> {t('workflow.required_role')}
          </label>
          <select
            className="gl-form-input text-xs w-full"
            value={(edge.data?.required_role as string) || ''}
            onChange={(event) => onUpdate(edge.id, { data: { ...edge.data, required_role: event.target.value || undefined } })}
          >
            <option value="">{t('workflow.no_role_restriction')}</option>
            {availableRoles.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <p className="text-[9px] text-muted-foreground mt-1">
            {t('workflow.required_role_help')}
          </p>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{t('workflow.required_permission')}</label>
          <input
            type="text"
            className="gl-form-input text-xs w-full font-mono"
            placeholder={t('workflow.permission_placeholder')}
            defaultValue={(edge.data?.required_permission as string) || ''}
            onBlur={(event) => onUpdate(edge.id, { data: { ...edge.data, required_permission: event.target.value || undefined } })}
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{t('workflow.assignee_rule')}</label>
          <select
            className="gl-form-input text-xs w-full mb-1"
            value={assigneeResolver}
            onChange={(event) => {
              const resolver = event.target.value
              if (!resolver) {
                onUpdate(edge.id, { data: { ...edge.data, assignee: undefined } })
                return
              }
              if (resolver === 'role') {
                onUpdate(edge.id, { data: { ...edge.data, assignee: { resolver: 'role', role_code: '' } } })
                return
              }
              onUpdate(edge.id, { data: { ...edge.data, assignee: { resolver: 'field', field: '' } } })
            }}
          >
            <option value="">{t('workflow.none')}</option>
            <option value="role">{t('workflow.assignee_by_role')}</option>
            <option value="field">{t('workflow.assignee_by_field')}</option>
          </select>
          {assigneeResolver === 'role' && (
            <select
              className="gl-form-input text-xs w-full"
              value={typeof assignee?.role_code === 'string' ? assignee.role_code : ''}
              onChange={(event) => onUpdate(edge.id, {
                data: {
                  ...edge.data,
                  assignee: { resolver: 'role', role_code: event.target.value },
                },
              })}
            >
              <option value="">{t('workflow.choose_role')}</option>
              {availableRoles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          )}
          {assigneeResolver === 'field' && (
            <input
              type="text"
              className="gl-form-input text-xs w-full font-mono"
              placeholder={t('workflow.assignee_field_placeholder')}
              defaultValue={typeof assignee?.field === 'string' ? assignee.field : ''}
              onBlur={(event) => onUpdate(edge.id, {
                data: {
                  ...edge.data,
                  assignee: { resolver: 'field', field: event.target.value },
                },
              })}
            />
          )}
        </div>

        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{t('workflow.sla_hours')}</label>
          <input
            type="number"
            min={1}
            step={1}
            className="gl-form-input text-xs w-full"
            defaultValue={typeof edge.data?.sla_hours === 'number' ? edge.data.sla_hours : ''}
            onBlur={(event) => onUpdate(edge.id, {
              data: {
                ...edge.data,
                sla_hours: event.target.value ? Number(event.target.value) : undefined,
              },
            })}
          />
        </div>

        <label className="flex items-center gap-2 text-[10px] text-foreground">
          <input
            type="checkbox"
            checked={Boolean(edge.data?.comment_required)}
            onChange={(event) => onUpdate(edge.id, {
              data: { ...edge.data, comment_required: event.target.checked || undefined },
            })}
          />
          {t('workflow.comment_required')}
        </label>

        {structureLocked ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            {t('workflow.transition_locked_help')}
          </div>
        ) : (
          <div className="pt-2 border-t border-border/50">
            <DangerConfirmButton
              icon={<Trash2 size={12} />}
              onConfirm={() => { onDelete(edge.id); onClose() }}
              confirmLabel={t('common.confirm_question')}
            >
              {t('workflow.delete_transition')}
            </DangerConfirmButton>
          </div>
        )}
      </div>
    </div>
  )
}

export function ValidationPanel({
  issues,
  onClose,
  onFocusNode,
}: {
  issues: ValidationIssue[]
  onClose: () => void
  onFocusNode?: (nodeId: string) => void
}) {
  const { t } = useTranslation()
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')

  return (
    <div className="border-t border-border bg-card/95 backdrop-blur-sm max-h-[180px] overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground">
          <Shield size={12} className="inline mr-1" />
          {t('workflow.validation_title')}
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <XCircle size={12} />
        </button>
      </div>
      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {errors.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-1">
              {t('workflow.validation_errors', { count: errors.length })}
            </p>
            <div className="space-y-0.5">
              {errors.map((issue, index) => (
                <button
                  key={`${issue.message}-${index}`}
                  type="button"
                  onClick={() => issue.nodeId && onFocusNode?.(issue.nodeId)}
                  className={cn(
                    'w-full text-left rounded px-1 py-0.5 text-[10px] text-red-700 dark:text-red-300',
                    issue.nodeId && 'hover:bg-red-50 dark:hover:bg-red-950/20',
                  )}
                >
                  • {issue.message}
                </button>
              ))}
            </div>
          </div>
        )}
        {warnings.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mb-1">
              {t('workflow.validation_warnings', { count: warnings.length })}
            </p>
            <div className="space-y-0.5">
              {warnings.map((issue, index) => (
                <button
                  key={`${issue.message}-${index}`}
                  type="button"
                  onClick={() => issue.nodeId && onFocusNode?.(issue.nodeId)}
                  className={cn(
                    'w-full text-left rounded px-1 py-0.5 text-[10px] text-amber-700 dark:text-amber-300',
                    issue.nodeId && 'hover:bg-amber-50 dark:hover:bg-amber-950/20',
                  )}
                >
                  • {issue.message}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
