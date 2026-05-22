import { describe, expect, it } from 'vitest'
import { buildAuditAnswerDrafts, getAuditProgress } from '@/lib/complianceAudit'
import type { ComplianceAudit } from '@/types/api'

const audit: ComplianceAudit = {
  id: 'audit-1',
  entity_id: 'entity-1',
  template_id: 'template-1',
  target_type: 'tier',
  target_id: 'tier-1',
  reference: 'AUD-001',
  title: 'Audit HSE fournisseur',
  status: 'draft',
  planned_at: null,
  started_at: null,
  submitted_at: null,
  validated_at: null,
  valid_until: null,
  score_percent: null,
  summary: null,
  validation_moc_id: null,
  created_by: 'user-1',
  created_at: '2026-05-22T00:00:00Z',
  updated_at: '2026-05-22T00:00:00Z',
  template: {
    id: 'template-1',
    entity_id: 'entity-1',
    code: 'HSE',
    name: 'Audit HSE',
    audit_type: 'HSE',
    target_scope: 'company',
    description: null,
    passing_score: 70,
    validity_days: 365,
    active: true,
    created_at: '2026-05-22T00:00:00Z',
    updated_at: '2026-05-22T00:00:00Z',
    themes: [
      {
        id: 'theme-1',
        template_id: 'template-1',
        title: 'Documents',
        description: null,
        weight: 1,
        position: 1,
        questions: [
          {
            id: 'q-1',
            theme_id: 'theme-1',
            code: 'DOC-1',
            text: 'Le plan HSE est-il disponible ?',
            response_type: 'yes_no',
            weight: 1,
            required: true,
            attachment_required: true,
            options_json: null,
            position: 1,
          },
          {
            id: 'q-2',
            theme_id: 'theme-1',
            code: 'DOC-2',
            text: 'Commentaire général',
            response_type: 'text',
            weight: 1,
            required: false,
            attachment_required: false,
            options_json: null,
            position: 2,
          },
        ],
      },
    ],
  },
  answers: [
    {
      id: 'a-1',
      audit_id: 'audit-1',
      question_id: 'q-1',
      response_value: { value: 'yes' },
      score: 100,
      notes: '<p>OK</p>',
      answered_by: 'user-1',
      answered_at: '2026-05-22T00:00:00Z',
      attachment_count: 0,
    },
  ],
}

describe('compliance audit helpers', () => {
  it('builds answer drafts in template order with existing answers merged', () => {
    const drafts = buildAuditAnswerDrafts(audit)

    expect(drafts.map((draft) => draft.question.id)).toEqual(['q-1', 'q-2'])
    expect(drafts[0].answerId).toBe('a-1')
    expect(drafts[0].score).toBe(100)
    expect(drafts[1].score).toBeNull()
  })

  it('tracks unanswered required questions and missing evidence', () => {
    const progress = getAuditProgress(audit)

    expect(progress.totalQuestions).toBe(2)
    expect(progress.answeredRequired).toBe(1)
    expect(progress.requiredQuestions).toBe(1)
    expect(progress.missingEvidence).toBe(1)
    expect(progress.canSubmit).toBe(false)
  })
})
