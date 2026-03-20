/**
 * PdfTemplatesTab — Admin page for managing PDF templates.
 *
 * Mirrors the EmailTemplatesTab pattern with card-grid layout:
 *  - Slug, name, status (enabled/disabled), published languages, version count
 *  - Page settings (A4/Letter, portrait/landscape)
 *  - Seed defaults button
 *  - Click card → opens edit panel (DynamicPanel)
 *  - Toggle enable/disable inline
 *
 * API: GET/POST/PATCH/DELETE /api/v1/pdf-templates
 */
import { useCallback } from 'react'
import {
  FileOutput,
  Plus,
  Loader2,
  Sparkles,
  FileText,
  ChevronRight,
  Power,
  PowerOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import {
  usePdfTemplates,
  useSeedPdfTemplates,
  useUpdatePdfTemplate,
  type PdfTemplateSummary,
} from '@/hooks/usePdfTemplates'

const OBJECT_TYPE_LABELS: Record<string, string> = {
  system: 'Système',
  paxlog: 'PaxLog',
  travelwiz: 'TravelWiz',
  document: 'Document',
  asset: 'Actif',
}

const LANG_LABELS: Record<string, string> = {
  fr: 'FR',
  en: 'EN',
}

const PAGE_SIZE_LABELS: Record<string, string> = {
  A4: 'A4',
  letter: 'Letter',
  A3: 'A3',
  legal: 'Legal',
}

export function PdfTemplatesTab() {
  const { toast } = useToast()
  const { data: templates, isLoading } = usePdfTemplates()
  const seedMutation = useSeedPdfTemplates()
  const updateMutation = useUpdatePdfTemplate()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const handleSeed = useCallback(async () => {
    try {
      const result = await seedMutation.mutateAsync()
      if (result.count > 0) {
        toast({
          title: 'Modèles PDF créés',
          description: `${result.count} modèle(s) par défaut créé(s) : ${result.seeded.join(', ')}`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Aucun modèle créé',
          description: 'Tous les modèles PDF par défaut existent déjà.',
          variant: 'default',
        })
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de créer les modèles par défaut.', variant: 'error' })
    }
  }, [seedMutation, toast])

  const handleToggleEnabled = useCallback(
    async (template: PdfTemplateSummary) => {
      try {
        await updateMutation.mutateAsync({ id: template.id, enabled: !template.enabled })
        toast({
          title: template.enabled ? 'Modèle désactivé' : 'Modèle activé',
          variant: 'success',
        })
      } catch {
        toast({ title: 'Erreur', variant: 'error' })
      }
    },
    [updateMutation, toast],
  )

  const handleEdit = useCallback(
    (template: PdfTemplateSummary) => {
      openDynamicPanel({
        module: 'settings-pdf-template',
        type: 'edit',
        id: template.id,
        data: { templateId: template.id },
      })
    },
    [openDynamicPanel],
  )

  const handleCreate = useCallback(() => {
    openDynamicPanel({
      module: 'settings-pdf-template',
      type: 'create',
    })
  }, [openDynamicPanel])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const systemTemplates = (templates ?? []).filter((t) => ['system', 'document'].includes(t.object_type))
  const moduleTemplates = (templates ?? []).filter((t) => !['system', 'document'].includes(t.object_type))

  // Stats
  const totalCount = templates?.length ?? 0
  const enabledCount = templates?.filter((t) => t.enabled).length ?? 0
  const withVersionsCount = templates?.filter((t) => t.version_count > 0).length ?? 0

  return (
    <>
      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <StatsCard label="Total modèles" count={totalCount} />
        <StatsCard label="Actifs" count={enabledCount} />
        <StatsCard label="Avec versions" count={withVersionsCount} />
      </div>

      {/* ── Actions bar ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {totalCount} modèle(s) PDF configuré(s)
        </p>
        <div className="flex items-center gap-2">
          <button onClick={handleSeed} disabled={seedMutation.isPending} className="gl-button-sm gl-button-default">
            {seedMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Initialiser les modèles par défaut
          </button>
          <button onClick={handleCreate} className="gl-button-sm gl-button-confirm">
            <Plus size={12} />
            Nouveau modèle PDF
          </button>
        </div>
      </div>

      {/* ── System/document templates ── */}
      <CollapsibleSection
        id="pdf-templates-system"
        title="Modèles système"
        description="Modèles PDF système : exports de documents, rapports généraux, manifestes."
        storageKey="settings.pdf-templates.collapse"
      >
        {systemTemplates.length === 0 ? (
          <PdfEmptyState message="Aucun modèle système. Cliquez sur « Initialiser les modèles par défaut » pour créer les modèles de base." />
        ) : (
          <PdfTemplateGrid templates={systemTemplates} onEdit={handleEdit} onToggle={handleToggleEnabled} />
        )}
      </CollapsibleSection>

      {/* ── Module-specific templates ── */}
      <CollapsibleSection
        id="pdf-templates-modules"
        title="Modèles par module"
        description="Modèles PDF spécifiques aux modules : ADS tickets, manifestes PaxLog, manifestes voyage, etc."
        storageKey="settings.pdf-templates.collapse"
        showSeparator={false}
      >
        {moduleTemplates.length === 0 ? (
          <PdfEmptyState message="Aucun modèle par module. Créez un modèle PDF pour vos besoins spécifiques ou initialisez les modèles par défaut." />
        ) : (
          <PdfTemplateGrid templates={moduleTemplates} onEdit={handleEdit} onToggle={handleToggleEnabled} />
        )}
      </CollapsibleSection>
    </>
  )
}

// ── Stats card ───────────────────────────────────────────

function StatsCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="border border-border/60 rounded-lg bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">{count}</p>
    </div>
  )
}

// ── Template grid ───────────────────────────────────────────

function PdfTemplateGrid({
  templates,
  onEdit,
  onToggle,
}: {
  templates: PdfTemplateSummary[]
  onEdit: (t: PdfTemplateSummary) => void
  onToggle: (t: PdfTemplateSummary) => void
}) {
  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {templates.map((t) => (
        <div
          key={t.id}
          className={cn(
            'border rounded-lg p-4 transition-colors cursor-pointer hover:border-primary/40 group',
            t.enabled ? 'border-border/60 bg-card' : 'border-border/40 bg-muted/20 opacity-75',
          )}
          onClick={() => onEdit(t)}
        >
          {/* Header: icon + name + toggle */}
          <div className="flex items-start gap-2.5 mb-2">
            <div
              className={cn(
                'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                t.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              <FileOutput size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
              <code className="text-[10px] font-mono text-muted-foreground">
                {t.slug}
              </code>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(t) }}
              className={cn(
                'p-1.5 rounded-md transition-colors shrink-0',
                t.enabled
                  ? 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30'
                  : 'text-muted-foreground hover:bg-accent',
              )}
              title={t.enabled ? 'Désactiver' : 'Activer'}
            >
              {t.enabled ? <Power size={14} /> : <PowerOff size={14} />}
            </button>
          </div>

          {/* Description */}
          {t.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{t.description}</p>
          )}

          {/* Footer: badges */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/30">
            {/* Object type */}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
              {OBJECT_TYPE_LABELS[t.object_type] ?? t.object_type}
            </span>

            {/* Page format */}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {PAGE_SIZE_LABELS[t.page_size] ?? t.page_size} {t.orientation === 'landscape' ? '↔' : '↕'}
            </span>

            {/* Languages */}
            {t.published_languages.length > 0 ? (
              t.published_languages.map((lang) => (
                <span
                  key={lang}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >
                  {LANG_LABELS[lang] ?? lang}
                </span>
              ))
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Aucune version
              </span>
            )}

            <span className="text-xs text-muted-foreground ml-auto">
              {t.version_count}v
            </span>

            <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────

function PdfEmptyState({ message }: { message: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-dashed border-border p-6">
      <FileText size={20} className="text-muted-foreground/50 shrink-0" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
