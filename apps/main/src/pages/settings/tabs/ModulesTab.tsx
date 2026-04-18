import { Boxes, Link2, Power, ShieldAlert, ShieldX, Sparkles } from 'lucide-react'
import { useModules, useUpdateModuleState } from '@/hooks/useModules'

export function ModulesTab() {
  const { data: modules = [], isLoading } = useModules()
  const update = useUpdateModuleState()

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Chargement des modules...</div>
  }

  return (
    <div className="space-y-4 p-1">
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Modules</h3>
              <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                Active ou désactive les modules pour l&apos;entité courante. Une désactivation retire le module de la navigation,
                des dashboards et de ses principaux points d&apos;entrée runtime.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <article
              key={module.slug}
              className={`rounded-2xl border p-4 shadow-sm transition-colors ${
                module.enabled
                  ? 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/10'
                  : 'border-border bg-background'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{module.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      v{module.version}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {module.enabled ? 'Actif' : 'Désactivé'}
                    </span>
                  </div>
                  <div className="mt-2 inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {module.slug}
                  </div>
                </div>
                {module.is_protected ? (
                  <span className="gl-badge gl-badge-warning">
                    <ShieldAlert className="h-3 w-3" />
                    Protégé
                  </span>
                ) : module.enabled ? (
                  <span className="gl-badge gl-badge-success">
                    <Sparkles className="h-3 w-3" />
                    Disponible
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <ShieldX className="h-3 w-3" />
                    Coupé
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                  {module.depends_on.length > 0 ? (
                    <div className="flex items-start gap-2">
                      <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Dépend de {module.depends_on.join(', ')}</span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Aucune dépendance déclarée.</span>
                    </div>
                  )}
                </div>

                {!module.enabled && module.missing_dependencies.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                    Active d&apos;abord: {module.missing_dependencies.join(', ')}
                  </div>
                )}

                {module.enabled && module.active_dependents.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                    Désactive d&apos;abord les modules dépendants: {module.active_dependents.join(', ')}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  disabled={
                    module.is_protected
                    || update.isPending
                    || (module.enabled ? !module.can_disable : !module.can_enable)
                  }
                  onClick={() => update.mutate({ slug: module.slug, enabled: !module.enabled })}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
                    module.enabled
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <Power className="h-3.5 w-3.5" />
                  {module.enabled ? 'Désactiver le module' : 'Activer le module'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
