/**
 * EmailTemplatesTab — Admin page for managing email templates.
 *
 * Lists all configured templates for the entity with:
 *  - Slug, name, status (enabled/disabled), active languages, version count
 *  - Seed defaults button
 *  - Click row → opens edit panel (DynamicPanel)
 *  - Toggle enable/disable inline
 *
 * Sections are collapsible with deep-link support.
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Mail,
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
  useEmailTemplates,
  useSeedEmailTemplates,
  useUpdateEmailTemplate,
  type EmailTemplateSummary,
} from '@/hooks/useEmailTemplates'

const OBJECT_TYPE_LABELS: Record<string, string> = {
  system: 'Système',
  user: 'Utilisateur',
  tier: 'Tiers',
  asset: 'Actif',
}

const LANG_LABELS: Record<string, string> = {
  fr: 'FR',
  en: 'EN',
}

export function EmailTemplatesTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: templates, isLoading } = useEmailTemplates()
  const seedMutation = useSeedEmailTemplates()
  const updateMutation = useUpdateEmailTemplate()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const handleSeed = useCallback(async () => {
    try {
      const result = await seedMutation.mutateAsync()
      if (result.count > 0) {
        toast({
          title: t('settings.toast.email_templates.templates_seeded'),
          description: t('settings.toast.email_templates.templates_seeded_desc', { count: result.count, list: result.seeded.join(', ') }),
          variant: 'success',
        })
      } else {
        toast({
          title: t('settings.toast.email_templates.no_templates_seeded'),
          description: t('settings.toast.email_templates.no_templates_seeded_desc'),
          variant: 'default',
        })
      }
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.email_templates.seed_error'), variant: 'error' })
    }
  }, [seedMutation, toast])

  const handleToggleEnabled = useCallback(
    async (template: EmailTemplateSummary) => {
      try {
        await updateMutation.mutateAsync({ id: template.id, enabled: !template.enabled })
        toast({
          title: template.enabled ? t('settings.toast.email_templates.toggled_disabled') : t('settings.toast.email_templates.toggled_enabled'),
          variant: 'success',
        })
      } catch {
        toast({ title: t('settings.toast.error'), variant: 'error' })
      }
    },
    [updateMutation, toast],
  )

  const handleEdit = useCallback(
    (template: EmailTemplateSummary) => {
      openDynamicPanel({
        module: 'settings-email-template',
        type: 'edit',
        id: template.id,
        data: { templateId: template.id },
      })
    },
    [openDynamicPanel],
  )

  const handleCreate = useCallback(() => {
    openDynamicPanel({
      module: 'settings-email-template',
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

  const systemTemplates = (templates ?? []).filter((t) => ['system', 'user'].includes(t.object_type))
  const customTemplates = (templates ?? []).filter((t) => !['system', 'user'].includes(t.object_type))

  return (
    <>
      {/* ── Actions bar ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {templates?.length ?? 0} modèle(s) configuré(s)
        </p>
        <div className="flex items-center gap-2">
          <button onClick={handleSeed} disabled={seedMutation.isPending} className="gl-button-sm gl-button-default">
            {seedMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Initialiser les modèles par défaut
          </button>
          <button onClick={handleCreate} className="gl-button-sm gl-button-confirm">
            <Plus size={12} />
            Nouveau modèle
          </button>
        </div>
      </div>

      {/* ── System templates ── */}
      <CollapsibleSection
        id="email-templates-system"
        title="Modèles système"
        description="Emails système : vérification, invitation, réinitialisation de mot de passe, bienvenue."
        storageKey="settings.email-templates.collapse"
      >
        {systemTemplates.length === 0 ? (
          <EmptyState message="Aucun modèle système. Cliquez sur « Initialiser les modèles par défaut » pour créer les modèles de base." />
        ) : (
          <TemplateList templates={systemTemplates} onEdit={handleEdit} onToggle={handleToggleEnabled} />
        )}
      </CollapsibleSection>

      {/* ── Custom templates ── */}
      <CollapsibleSection
        id="email-templates-custom"
        title="Modèles personnalisés"
        description="Modèles d'emails spécifiques à votre activité : tiers, actifs, workflows, etc."
        storageKey="settings.email-templates.collapse"
        showSeparator={false}
      >
        {customTemplates.length === 0 ? (
          <EmptyState message="Aucun modèle personnalisé. Créez un nouveau modèle pour vos besoins spécifiques." />
        ) : (
          <TemplateList templates={customTemplates} onEdit={handleEdit} onToggle={handleToggleEnabled} />
        )}
      </CollapsibleSection>
    </>
  )
}

// ── Template list ───────────────────────────────────────────

function TemplateList({
  templates,
  onEdit,
  onToggle,
}: {
  templates: EmailTemplateSummary[]
  onEdit: (t: EmailTemplateSummary) => void
  onToggle: (t: EmailTemplateSummary) => void
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
              <Mail size={16} />
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
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
              {OBJECT_TYPE_LABELS[t.object_type] ?? t.object_type}
            </span>

            {t.active_languages.length > 0 ? (
              t.active_languages.map((lang) => (
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-dashed border-border p-6">
      <FileText size={20} className="text-muted-foreground/50 shrink-0" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
