import { Power, ShieldAlert } from 'lucide-react'
import { useModules, useUpdateModuleState } from '@/hooks/useModules'

export function ModulesTab() {
  const { data: modules = [], isLoading } = useModules()
  const update = useUpdateModuleState()

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Chargement des modules...</div>
  }

  return (
    <div className="space-y-4 p-1">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Modules</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Désactiver un module le retire de la navigation et de ses dashboards au niveau de l&apos;entité courante.
          </p>
        </div>
        <div className="divide-y divide-border">
          {modules.map((module) => (
            <div key={module.slug} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{module.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {module.slug}
                  </span>
                  {module.is_protected && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      <ShieldAlert className="h-3 w-3" />
                      Protégé
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  v{module.version}
                  {module.depends_on.length > 0 ? ` • Dépend de ${module.depends_on.join(', ')}` : ''}
                </div>
                {!module.enabled && module.missing_dependencies.length > 0 && (
                  <div className="mt-1 text-[11px] text-amber-700">
                    Active d&apos;abord: {module.missing_dependencies.join(', ')}
                  </div>
                )}
                {module.enabled && module.active_dependents.length > 0 && (
                  <div className="mt-1 text-[11px] text-amber-700">
                    Désactive d&apos;abord les modules dépendants: {module.active_dependents.join(', ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={
                  module.is_protected
                  || update.isPending
                  || (module.enabled ? !module.can_disable : !module.can_enable)
                }
                onClick={() => update.mutate({ slug: module.slug, enabled: !module.enabled })}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  module.enabled
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <Power className="h-3.5 w-3.5" />
                {module.enabled ? 'Activé' : 'Désactivé'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
