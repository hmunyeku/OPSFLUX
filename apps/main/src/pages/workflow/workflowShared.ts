import i18n from '@/lib/i18n'
import type { WorkflowDefinition, WorkflowDefinitionSummary } from '@/services/workflowService'

export const STRUCTURE_LOCKED_WORKFLOW_SLUGS = new Set([
  'project',
  'ads-workflow',
  'planner-activity',
  'voyage-workflow',
  'packlog-cargo-workflow',
  'travelwiz-cargo-workflow',
  'avm-workflow',
])

const ENTITY_TYPE_LABELS: Record<string, string> = {
  avis_sejour: 'workflow.entity.avis_sejour',
  ads: 'workflow.entity.ads',
  avm: 'workflow.entity.avm',
  project: 'workflow.entity.project',
  planner_activity: 'workflow.entity.planner_activity',
  voyage: 'workflow.entity.voyage',
  cargo_item_workflow: 'workflow.entity.cargo_item_workflow',
  work_order: 'workflow.entity.work_order',
  purchase_order: 'workflow.entity.purchase_order',
  asset: 'workflow.entity.asset',
  workflow: 'workflow.entity.workflow',
}

export function entityTypeLabel(type: string): string {
  const key = ENTITY_TYPE_LABELS[type]
  return key ? i18n.t(key) : type
}

export function isStructureLockedDefinition(
  definition: Pick<WorkflowDefinition, 'slug' | 'structure_locked'>
  | Pick<WorkflowDefinitionSummary, 'slug' | 'structure_locked'>,
): boolean {
  return Boolean(definition.structure_locked) || STRUCTURE_LOCKED_WORKFLOW_SLUGS.has(definition.slug)
}
