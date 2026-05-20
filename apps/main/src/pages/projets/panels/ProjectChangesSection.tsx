import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FormSection } from '@/components/layout/DynamicPanel'
import { ChangeRegister } from '@/components/shared/ChangeRegister'
import type { ProjectTask } from '@/types/api'

export function ProjectChangesSection({
  projectId,
  currency = 'XAF',
  tasks = [],
}: {
  projectId: string
  currency?: string
  tasks?: ProjectTask[]
}) {
  const { t } = useTranslation()
  return (
    <FormSection
      title={<span className="inline-flex items-center gap-2"><AlertTriangle size={14} /> {t('projets.detail.tabs.changes')}</span>}
      collapsible
      defaultExpanded
      storageKey="project-changes"
    >
      <ChangeRegister
        contextType="project"
        contextId={projectId}
        contextModule="projets"
        projectId={projectId}
        tasks={tasks}
        currency={currency}
        compact
        attachmentCategoryDictionary="moc_attachment_type"
      />
    </FormSection>
  )
}
