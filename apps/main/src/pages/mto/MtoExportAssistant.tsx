/**
 * MtoExportAssistant — assistant d'export métier d'un batch MTO (le livrable).
 *
 * Dialog (Radix — patron modale OpsFlux, cf. ProjectSelectorModal) en deux
 * temps :
 *
 *   1. Classeur Excel métier (Synthèse / À sortir du stock / À commander) :
 *      téléchargement AUTHENTIFIÉ de
 *      GET /api/v1/mto/batches/{batchId}/export.xlsx via `useMtoExport`
 *      (axios blob + Bearer ; une navigation navigateur perdrait le token).
 *
 *   2. Mails prêts pour consultation : 3 brouillons générés côté front à
 *      partir des groupes consolidés (useMtoGroups), regroupés par statut :
 *        - « À commander »      (statut = 'à commander')
 *        - « En stock (à sortir)» (statut = 'en stock')
 *        - « Partiel »          (statut = 'partiel')
 *      Chaque brouillon = un objet + un corps texte (code article SAP,
 *      désignation, besoin+unité, dispo). Boutons Copier (presse-papiers) +
 *      Ouvrir le client mail (mailto: encodé). Compteurs par catégorie.
 *
 * Design system : Radix Dialog, tokens DS (pas de hex en dur), lucide icons.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Check,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  Loader2,
  Mail,
  Package,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { useMtoExport, useMtoGroups, type MtoGroup } from '@/hooks/useMto'
import { mtoStatusLabel } from '@/services/mtoService'

interface MtoExportAssistantProps {
  open: boolean
  onClose: () => void
  batchId: string
  /** Libellé du MTO (titre du dialog). */
  batchLabel?: string
}

/** Une catégorie de mail = un statut métier + sa présentation. */
interface MailCategory {
  statut: string
  /** Clé i18n du libellé de la catégorie dans l'UI (peut différer du label statut brut). */
  titleKey: string
  /** Pastille tokenisée. */
  dot: string
}

const MAIL_CATEGORIES: MailCategory[] = [
  { statut: 'à commander', titleKey: 'mto.export.cat_a_commander', dot: 'bg-destructive' },
  { statut: 'en stock', titleKey: 'mto.export.cat_en_stock', dot: 'bg-success' },
  { statut: 'partiel', titleKey: 'mto.export.cat_partiel', dot: 'bg-warning' },
]

/** Formate une quantité + unité de façon lisible (« 12 m », « 3 »). */
function fmtQty(value: number | null | undefined, unit?: string | null): string {
  const n = value ?? 0
  const u = (unit ?? '').trim()
  return u ? `${n} ${u}` : String(n)
}

/**
 * Construit l'objet + le corps texte d'un brouillon pour une catégorie.
 * Le corps liste chaque article : code SAP · désignation · besoin · dispo.
 */
function buildDraft(
  category: MailCategory,
  groups: MtoGroup[],
  batchLabel: string,
  t: TFunction,
): { subject: string; body: string } {
  const verbKey =
    category.statut === 'à commander'
      ? 'mto.export.subject_a_commander'
      : category.statut === 'en stock'
        ? 'mto.export.subject_en_stock'
        : 'mto.export.subject_partiel'
  const subject = t('mto.export.subject_line', {
    count: groups.length,
    label: batchLabel,
    verb: t(verbKey),
  })

  const introKey =
    category.statut === 'à commander'
      ? 'mto.export.draft_intro_a_commander'
      : category.statut === 'en stock'
        ? 'mto.export.draft_intro_en_stock'
        : 'mto.export.draft_intro_partiel'

  const lines: string[] = []
  lines.push(t('mto.export.draft_greeting'))
  lines.push('')
  lines.push(t(introKey, { count: groups.length, label: batchLabel }))
  lines.push('')

  for (const g of groups) {
    const code = g.article_code ?? t('mto.export.draft_code_fallback')
    const designation = g.designation_sap || g.mto_key || t('mto.export.draft_designation_fallback')
    const besoin = fmtQty(g.besoin, g.unite)
    const dispo = fmtQty(g.dispo, g.unite)
    lines.push(`- ${code} — ${designation}`)
    lines.push(`    ${t('mto.export.draft_line_besoin', { besoin, dispo })}`)
  }

  lines.push('')
  lines.push(t('mto.export.draft_closing_thanks'))
  lines.push(t('mto.export.draft_closing_regards'))

  return { subject, body: lines.join('\n') }
}

export function MtoExportAssistant({ open, onClose, batchId, batchLabel }: MtoExportAssistantProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const exportXlsx = useMtoExport(batchId)
  // On charge tous les groupes (pas de filtre serveur) : mêmes données que la
  // vue rapprochement, déjà en cache si le batch est ouvert.
  const { data: groups, isLoading } = useMtoGroups(open ? batchId : null, null)

  const label = batchLabel || batchId.slice(0, 8)

  // Groupes répartis par statut, dans l'ordre des catégories de mail.
  const grouped = useMemo(() => {
    const map: Record<string, MtoGroup[]> = {}
    for (const cat of MAIL_CATEGORIES) map[cat.statut] = []
    for (const g of groups ?? []) {
      if (g.statut && map[g.statut]) map[g.statut].push(g)
    }
    return map
  }, [groups])

  const handleDownload = async () => {
    try {
      await exportXlsx.mutateAsync()
      toast({ title: t('mto.export.xlsx_success'), variant: 'success' })
    } catch {
      toast({ title: t('mto.export.xlsx_error'), variant: 'error' })
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-modal)] flex max-h-[88vh] w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Download size={16} className="text-primary" />
              <div>
                <Dialog.Title className="text-sm font-semibold">{t('mto.export.title')}</Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  {label}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="btn btn-secondary" aria-label={t('mto.export.close')}>
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* ── 1. Classeur Excel métier ── */}
            <section className="rounded-lg border border-border/60 bg-background p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                  <FileSpreadsheet size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">{t('mto.export.section_xlsx')}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('mto.export.xlsx_desc')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={exportXlsx.isPending}
                  className="btn-sm btn-primary shrink-0"
                >
                  {exportXlsx.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span>{t('mto.export.download')}</span>
                </button>
              </div>
            </section>

            {/* ── 2. Mails prêts pour consultation ── */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  {t('mto.export.section_mails')}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('mto.export.mails_desc')}
              </p>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : (groups?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={Package}
                  title={t('mto.export.empty_title')}
                  description={t('mto.export.empty_desc')}
                  size="compact"
                />
              ) : (
                <div className="space-y-2">
                  {MAIL_CATEGORIES.map((cat) => (
                    <MailDraftCard
                      key={cat.statut}
                      category={cat}
                      groups={grouped[cat.statut] ?? []}
                      batchLabel={label}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end border-t border-border bg-muted/20 px-4 py-3">
            <button onClick={onClose} className="btn-sm btn-secondary">
              {t('mto.export.close')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Une carte brouillon de mail pour une catégorie de statut. */
function MailDraftCard({
  category,
  groups,
  batchLabel,
}: {
  category: MailCategory
  groups: MtoGroup[]
  batchLabel: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const { subject, body } = useMemo(
    () => buildDraft(category, groups, batchLabel, t),
    [category, groups, batchLabel, t],
  )

  const isEmpty = groups.length === 0

  const handleCopy = async () => {
    const text = `${t('mto.export.mail_subject_prefix', { subject })}\n\n${body}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({ title: t('mto.export.copy_success'), variant: 'success' })
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast({ title: t('mto.export.copy_error'), variant: 'error' })
    }
  }

  const mailtoHref = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div className={cn('rounded-lg border border-border/60 bg-background', isEmpty && 'opacity-60')}>
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', category.dot)} />
        <span className="text-sm font-medium text-foreground">{t(category.titleKey)}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {groups.length}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            disabled={isEmpty}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title={t('mto.export.copy_title')}
          >
            {copied ? <Check size={13} className="text-success" /> : <ClipboardCopy size={13} />}
            <span className="hidden sm:inline">{copied ? t('mto.export.copied') : t('mto.export.copy')}</span>
          </button>
          <a
            href={isEmpty ? undefined : mailtoHref}
            aria-disabled={isEmpty}
            onClick={(e) => {
              if (isEmpty) e.preventDefault()
            }}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
              isEmpty
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
            title={t('mto.export.open_mail_title')}
          >
            <Mail size={13} />
            <span className="hidden sm:inline">{t('mto.export.open_mail')}</span>
          </a>
        </div>
      </div>

      {isEmpty ? (
        <p className="px-3 py-2 text-xs italic text-muted-foreground">
          {t('mto.export.empty_category', { status: mtoStatusLabel(category.statut).toLowerCase() })}
        </p>
      ) : (
        <div className="px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('mto.export.label_objet')}
          </p>
          <p className="mb-2 truncate text-xs text-foreground" title={subject}>
            {subject}
          </p>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('mto.export.label_corps')}
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border/40 bg-muted/20 p-2 text-[11px] leading-relaxed text-foreground">
            {body}
          </pre>
        </div>
      )}
    </div>
  )
}

export default MtoExportAssistant
