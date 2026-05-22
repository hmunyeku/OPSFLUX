import type {
  ComplianceAudit,
  ComplianceAuditAnswer,
  ComplianceAuditAnswerUpsert,
  ComplianceAuditQuestion,
} from '@/types/api'

export interface ComplianceAuditAnswerDraft {
  question: ComplianceAuditQuestion
  answerId: string | null
  responseValue: Record<string, unknown> | null
  score: number | null
  notes: string
  attachmentCount: number
}

export interface ComplianceAuditProgress {
  totalQuestions: number
  requiredQuestions: number
  answeredRequired: number
  answeredQuestions: number
  missingRequired: number
  missingEvidence: number
  completionPercent: number
  canSubmit: boolean
}

function isAnswered(answer?: ComplianceAuditAnswer | null): boolean {
  if (!answer) return false
  if (answer.score !== null && answer.score !== undefined) return true
  if (!answer.response_value) return false
  return Object.values(answer.response_value).some((value) => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
  })
}

export function getAuditQuestions(audit: ComplianceAudit): ComplianceAuditQuestion[] {
  return (audit.template?.themes ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title))
    .flatMap((theme) =>
      theme.questions
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.code ?? '').localeCompare(b.code ?? '')),
    )
}

export function buildAuditAnswerDrafts(audit: ComplianceAudit): ComplianceAuditAnswerDraft[] {
  const answersByQuestion = new Map<string, ComplianceAuditAnswer>(
    (audit.answers ?? []).map((answer) => [answer.question_id, answer]),
  )
  return getAuditQuestions(audit).map((question) => {
    const answer = answersByQuestion.get(question.id)
    return {
      question,
      answerId: answer?.id ?? null,
      responseValue: answer?.response_value ?? null,
      score: answer?.score ?? null,
      notes: answer?.notes ?? '',
      attachmentCount: answer?.attachment_count ?? 0,
    }
  })
}

export function getAuditProgress(audit: ComplianceAudit): ComplianceAuditProgress {
  return getDraftProgress(buildAuditAnswerDrafts(audit))
}

export function getDraftProgress(drafts: ComplianceAuditAnswerDraft[]): ComplianceAuditProgress {
  let requiredQuestions = 0
  let answeredRequired = 0
  let answeredQuestions = 0
  let missingEvidence = 0

  for (const draft of drafts) {
    const question = draft.question
    const answered = isAnswered({
      id: draft.answerId ?? '',
      audit_id: '',
      question_id: question.id,
      response_value: draft.responseValue,
      score: draft.score,
      notes: draft.notes,
      answered_by: null,
      answered_at: null,
      attachment_count: draft.attachmentCount,
    })
    if (answered) answeredQuestions += 1
    if (question.required) {
      requiredQuestions += 1
      if (answered) answeredRequired += 1
    }
    if (question.attachment_required && draft.attachmentCount <= 0) {
      missingEvidence += 1
    }
  }

  const missingRequired = Math.max(requiredQuestions - answeredRequired, 0)
  const completionPercent = drafts.length > 0
    ? Math.round((answeredQuestions / drafts.length) * 100)
    : 0

  return {
    totalQuestions: drafts.length,
    requiredQuestions,
    answeredRequired,
    answeredQuestions,
    missingRequired,
    missingEvidence,
    completionPercent,
    canSubmit: drafts.length > 0 && missingRequired === 0 && missingEvidence === 0,
  }
}

export function draftsToUpsertPayload(drafts: ComplianceAuditAnswerDraft[]): ComplianceAuditAnswerUpsert[] {
  return drafts.map((draft) => ({
    question_id: draft.question.id,
    response_value: draft.responseValue,
    score: draft.score,
    notes: draft.notes.trim() ? draft.notes : null,
  }))
}
