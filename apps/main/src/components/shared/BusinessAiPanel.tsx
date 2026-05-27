import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

type BusinessAiModule = 'tiers' | 'projets'
type BusinessAiOwnerType = 'tier' | 'tier_contact' | 'project'
type BusinessAiIntent = 'summary' | 'risks' | 'next_actions' | 'data_quality'

interface BusinessAiStatus {
  module: BusinessAiModule
  enabled: boolean
  configured: boolean
  provider: string | null
  model: string | null
  connection_name: string | null
  missing_reason: string | null
  intents: BusinessAiIntent[]
}

interface BusinessAiResponse {
  response: string
  model: string
  provider: string
  intent: BusinessAiIntent
}

const INTENTS: BusinessAiIntent[] = ['summary', 'risks', 'next_actions', 'data_quality']

const INTENT_KEYS: Record<BusinessAiIntent, string> = {
  summary: 'ai.business.intent.summary',
  risks: 'ai.business.intent.risks',
  next_actions: 'ai.business.intent.next_actions',
  data_quality: 'ai.business.intent.data_quality',
}

const INTENT_FALLBACKS: Record<BusinessAiIntent, string> = {
  summary: 'Synthese',
  risks: 'Risques',
  next_actions: 'Actions',
  data_quality: 'Donnees',
}

export function BusinessAiPanel({
  module,
  ownerType,
  ownerId,
  compact = false,
}: {
  module: BusinessAiModule
  ownerType: BusinessAiOwnerType
  ownerId: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [activeIntent, setActiveIntent] = useState<BusinessAiIntent>('summary')
  const [result, setResult] = useState<BusinessAiResponse | null>(null)

  const statusQuery = useQuery({
    queryKey: ['business-ai-status', module],
    queryFn: async () => {
      const { data } = await api.get<BusinessAiStatus>('/api/v1/ai-chat/module-status', { params: { module } })
      return data
    },
    retry: false,
    staleTime: 60_000,
  })

  const insight = useMutation({
    mutationFn: async (intent: BusinessAiIntent) => {
      const { data } = await api.post<BusinessAiResponse>('/api/v1/ai-chat/module-insight', {
        module,
        owner_type: ownerType,
        owner_id: ownerId,
        intent,
      })
      return data
    },
    onSuccess: (data) => setResult(data),
  })

  const status = statusQuery.data
  if (statusQuery.isLoading) {
    return (
      <div className="rounded-md border border-border/60 bg-card/50 p-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-6 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }
  if (!status?.enabled) return null

  if (!status.configured) {
    return (
      <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
        {t('ai.business.missing_connector', 'IA activee, mais aucun connecteur IA metier actif n est configure.')}
      </div>
    )
  }

  const run = (intent: BusinessAiIntent) => {
    setActiveIntent(intent)
    insight.mutate(intent)
  }

  return (
    <div className={cn('rounded-md border border-primary/20 bg-primary/5 p-3', compact && 'p-2')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles size={13} className="text-primary" />
            {t('ai.business.title', 'Analyse IA')}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {status.connection_name} · {status.model}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {INTENTS.map((intent) => (
            <button
              key={intent}
              type="button"
              className={cn(
                'inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium',
                activeIntent === intent && result
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/70 bg-background/70 text-muted-foreground hover:text-foreground',
              )}
              disabled={insight.isPending}
              onClick={() => run(intent)}
            >
              {insight.isPending && activeIntent === intent ? <Loader2 size={11} className="mr-1 animate-spin" /> : null}
              {t(INTENT_KEYS[intent], INTENT_FALLBACKS[intent])}
            </button>
          ))}
        </div>
      </div>

      {insight.isError && (
        <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 p-2 text-xs text-destructive">
          {t('ai.business.error', 'Analyse IA indisponible. Verifiez le connecteur et les permissions.')}
        </div>
      )}

      {result && (
        <div className="mt-3 whitespace-pre-wrap rounded-md border border-border/50 bg-background/70 p-3 text-xs leading-relaxed text-foreground">
          {result.response}
        </div>
      )}
    </div>
  )
}
