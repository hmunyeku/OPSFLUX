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
  /** Libellé de la catégorie dans l'UI (peut différer du label statut brut). */
  title: string
  /** Pastille tokenisée. */
  dot: string
}

const MAIL_CATEGORIES: MailCategory[] = [
  { statut: 'à commander', title: 'À commander', dot: 'bg-destructive' },
  { statut: 'en stock', title: 'En stock (à sortir)', dot: 'bg-success' },
  { statut: 'partiel', title: 'Partiel', dot: 'bg-warning' },
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
): { subject: string; body: string } {
  const subjectVerb =
    category.statut === 'à commander'
      ? 'À commander'
      : category.statut === 'en stock'
        ? 'À sortir du stock'
        : 'Partiel — à compléter'
  const subject = `[MTO ${batchLabel}] ${subjectVerb} — ${groups.length} article${groups.length > 1 ? 's' : ''}`

  const lines: string[] = []
  lines.push('Bonjour,')
  lines.push('')
  if (category.statut === 'à commander') {
    lines.push(
      `Pour le MTO « ${batchLabel} », merci de lancer une consultation / commande pour les ${groups.length} article(s) suivant(s) (non couverts par le stock) :`,
    )
  } else if (category.statut === 'en stock') {
    lines.push(
      `Pour le MTO « ${batchLabel} », les ${groups.length} article(s) suivant(s) sont disponibles en stock et peuvent être sortis :`,
    )
  } else {
    lines.push(
      `Pour le MTO « ${batchLabel} », les ${groups.length} article(s) suivant(s) sont partiellement couverts (à compléter par commande) :`,
    )
  }
  lines.push('')

  for (const g of groups) {
    const code = g.article_code ?? '(code SAP à attribuer)'
    const designation = g.designation_sap || g.mto_key || '(désignation inconnue)'
    const besoin = fmtQty(g.besoin, g.unite)
    const dispo = fmtQty(g.dispo, g.unite)
    lines.push(`- ${code} — ${designation}`)
    lines.push(`    Besoin : ${besoin} · Dispo stock : ${dispo}`)
  }

  lines.push('')
  lines.push('Merci d’avance.')
  lines.push('Cordialement,')

  return { subject, body: lines.join('\n') }
}

export function MtoExportAssistant({ open, onClose, batchId, batchLabel }: MtoExportAssistantProps) {
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
      toast({ title: 'Classeur Excel téléchargé', variant: 'success' })
    } catch {
      toast({ title: "Échec du téléchargement Excel", variant: 'error' })
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
                <Dialog.Title className="text-sm font-semibold">Exporter le MTO</Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  {label}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="btn btn-secondary" aria-label="Fermer">
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
                  <h3 className="text-sm font-semibold text-foreground">Classeur Excel métier</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Trois feuilles : Synthèse · À sortir du stock · À commander.
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
                  <span>Télécharger</span>
                </button>
              </div>
            </section>

            {/* ── 2. Mails prêts pour consultation ── */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Mails prêts pour consultation
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Un brouillon par catégorie, généré à partir des groupes consolidés. Copiez-le
                ou ouvrez votre client mail.
              </p>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : (groups?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Aucun groupe à exporter"
                  description="Consolidez ce MTO pour générer les brouillons de mail."
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
              Fermer
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
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const { subject, body } = useMemo(
    () => buildDraft(category, groups, batchLabel),
    [category, groups, batchLabel],
  )

  const isEmpty = groups.length === 0

  const handleCopy = async () => {
    const text = `Objet : ${subject}\n\n${body}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({ title: 'Brouillon copié', variant: 'success' })
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast({ title: 'Copie impossible', variant: 'error' })
    }
  }

  const mailtoHref = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div className={cn('rounded-lg border border-border/60 bg-background', isEmpty && 'opacity-60')}>
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', category.dot)} />
        <span className="text-sm font-medium text-foreground">{category.title}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {groups.length}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            disabled={isEmpty}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Copier le brouillon"
          >
            {copied ? <Check size={13} className="text-success" /> : <ClipboardCopy size={13} />}
            <span className="hidden sm:inline">{copied ? 'Copié' : 'Copier'}</span>
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
            title="Ouvrir le client mail"
          >
            <Mail size={13} />
            <span className="hidden sm:inline">Ouvrir le mail</span>
          </a>
        </div>
      </div>

      {isEmpty ? (
        <p className="px-3 py-2 text-xs italic text-muted-foreground">
          Aucun article {mtoStatusLabel(category.statut).toLowerCase()}.
        </p>
      ) : (
        <div className="px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Objet
          </p>
          <p className="mb-2 truncate text-xs text-foreground" title={subject}>
            {subject}
          </p>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Corps
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
