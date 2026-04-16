import { useState } from 'react'
import { Boxes, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DynamicPanelField,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { useCreatePackLogArticle, usePackLogArticle } from '@/hooks/usePackLog'
import { useCargoWorkspace } from '@/pages/packlog/packlogWorkspace'
import type { TravelArticleCreate } from '@/types/api'

export function CreateArticlePanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { moduleLabel } = useCargoWorkspace()
  const packlogCreateArticle = useCreatePackLogArticle()
  const createArticle = packlogCreateArticle
  const { toast } = useToast()
  const { t } = useTranslation()
  const [form, setForm] = useState<TravelArticleCreate>({
    sap_code: '',
    description: '',
    management_type: null,
    packaging: null,
    is_hazmat: false,
    hazmat_class: null,
    unit: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createArticle.mutateAsync(form)
      toast({ title: t('packlog.toast.article_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('packlog.toast.article_create_error'), variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouvel article"
      subtitle={moduleLabel}
      icon={<Boxes size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createArticle.isPending}
            onClick={() => (document.getElementById('create-article-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createArticle.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-article-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Identification">
            <FormGrid>
              <DynamicPanelField label="Code SAP" required>
                <input
                  type="text"
                  required
                  value={form.sap_code}
                  onChange={(e) => setForm({ ...form, sap_code: e.target.value })}
                  className={panelInputClass}
                  placeholder="MAT-00001"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Description" required>
                <input
                  type="text"
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={panelInputClass}
                  placeholder="Description de l'article"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Type de gestion">
                <input
                  type="text"
                  value={form.management_type ?? ''}
                  onChange={(e) => setForm({ ...form, management_type: e.target.value || null })}
                  className={panelInputClass}
                  placeholder="Consommable, Stock..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Conditionnement">
                <input
                  type="text"
                  value={form.packaging ?? ''}
                  onChange={(e) => setForm({ ...form, packaging: e.target.value || null })}
                  className={panelInputClass}
                  placeholder="Carton, Palette..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Unite">
                <input
                  type="text"
                  value={form.unit ?? ''}
                  onChange={(e) => setForm({ ...form, unit: e.target.value || null })}
                  className={panelInputClass}
                  placeholder="kg, m, pce..."
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title="HAZMAT">
            <FormGrid>
              <DynamicPanelField label="Matiere dangereuse">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={form.is_hazmat ?? false}
                    onChange={(e) => setForm({ ...form, is_hazmat: e.target.checked })}
                  />
                  HAZMAT
                </label>
              </DynamicPanelField>
              {form.is_hazmat && (
                <DynamicPanelField label="Classe HAZMAT">
                  <input
                    type="text"
                    value={form.hazmat_class ?? ''}
                    onChange={(e) => setForm({ ...form, hazmat_class: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Classe 1, 2..."
                  />
                </DynamicPanelField>
              )}
            </FormGrid>
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

export function PackLogArticleDetailPanel({ id }: { id: string }) {
  const { data: article, isLoading } = usePackLogArticle(id)

  if (isLoading || !article) {
    return (
      <DynamicPanelShell title="Chargement..." subtitle="PackLog" icon={<Boxes size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell title={article.sap_code} subtitle="Catalogue SAP" icon={<Boxes size={14} className="text-primary" />}>
      <PanelContentLayout>
        <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="gl-badge gl-badge-info">Article SAP</span>
            {article.is_hazmat ? <span className="gl-badge gl-badge-warning">HAZMAT</span> : <span className="gl-badge gl-badge-neutral">Standard</span>}
            {article.active ? <span className="gl-badge gl-badge-success">Actif</span> : <span className="gl-badge gl-badge-danger">Inactif</span>}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Code article</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{article.sap_code}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{article.description}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Gestion</p>
              <p className="mt-1 text-sm text-foreground">{article.management_type ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Conditionnement</p>
              <p className="mt-1 text-sm text-foreground">{article.packaging ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unité</p>
              <p className="mt-1 text-sm text-foreground">{article.unit ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Classe HAZMAT</p>
              <p className="mt-1 text-sm text-foreground">{article.hazmat_class ?? '—'}</p>
            </div>
          </div>
        </div>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
