import { Loader2, Plane, QrCode, CheckCircle2, CircleDashed, AlertTriangle, Users } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAdsBoardingContext, useUpdateAdsBoardingPassenger } from '@/hooks/usePaxlog'

function formatDateTime(value: string | null | undefined) {
  if (!value) return '--'
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value: string | null | undefined) {
  if (!value) return '--'
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_TONE: Record<string, string> = {
  boarded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  checked_in: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  no_show: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  offloaded: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function AdsBoardingScanPage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, isError } = useAdsBoardingContext(token)
  const updatePassenger = useUpdateAdsBoardingPassenger(token)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          <div className="flex items-center gap-3 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5" />
            QR d'avis de séjour invalide ou non accessible
          </div>
          <p className="mt-3 text-sm">
            Vérifie que tu es connecté dans la bonne entité et que le QR scanné correspond bien à un ticket AdS encore valide.
          </p>
        </div>
      </div>
    )
  }

  const boardedTotal = data.manifests.reduce((sum, manifest) => sum + manifest.boarded_count, 0)
  const declaredTotal = data.manifests.reduce((sum, manifest) => sum + manifest.passenger_count, 0)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe,transparent_35%),linear-gradient(180deg,#f8fafc_0%,#ffffff_55%)] dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_100%)]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-border/60 bg-background/95 shadow-xl backdrop-blur">
          <div className="border-b border-border/60 px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  <QrCode className="h-3.5 w-3.5" />
                  Pointage avis de séjour
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {data.reference}
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  Pointe ici les personnes réellement montées. Le scan QR ouvre directement le ticket opérationnel lié à l’avis de séjour et à ses manifestes.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Statut</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{data.status}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Site</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{data.site_name || '--'}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Séjour</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{formatDate(data.start_date)} → {formatDate(data.end_date)}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Boarded</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{boardedTotal} / {declaredTotal || data.pax_count}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1.45fr)_360px] sm:px-7">
            <div className="space-y-5">
              {data.manifests.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-sm text-muted-foreground">
                  Aucun manifeste TravelWiz lié à cet avis de séjour pour le moment. Le QR est prêt, mais le pointage embarquement ne pourra démarrer qu’une fois le manifeste généré.
                </div>
              ) : (
                data.manifests.map((manifest) => (
                  <section key={manifest.manifest_id} className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
                    <div className="flex flex-col gap-3 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <Plane className="h-3.5 w-3.5" />
                          Voyage {manifest.voyage_code}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          Manifeste {manifest.manifest_status}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          Départ prévu {formatDateTime(manifest.scheduled_departure)} • {manifest.voyage_status}
                        </div>
                      </div>
                      <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {manifest.boarded_count} / {manifest.passenger_count} embarqués
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {manifest.passengers.map((passenger) => (
                        <div key={passenger.id} className="rounded-2xl border border-border/60 bg-background/80 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-semibold text-foreground">{passenger.name}</div>
                                <span className={cn(
                                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                  STATUS_TONE[passenger.boarding_status] ?? 'bg-muted text-muted-foreground',
                                )}>
                                  {passenger.boarding_status}
                                </span>
                                {passenger.standby && (
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                    Standby
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {passenger.company || 'Société non renseignée'} • Badge {passenger.badge_number || '--'} • Statut dossier {passenger.pax_status || '--'}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Pointé le {formatDateTime(passenger.boarded_at)}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => updatePassenger.mutate({ passengerId: passenger.id, payload: { boarding_status: 'pending' } })}
                                disabled={updatePassenger.isPending}
                                className="rounded-xl border border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-50"
                              >
                                Attente
                              </button>
                              <button
                                type="button"
                                onClick={() => updatePassenger.mutate({ passengerId: passenger.id, payload: { boarding_status: 'no_show' } })}
                                disabled={updatePassenger.isPending}
                                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
                              >
                                No-show
                              </button>
                              <button
                                type="button"
                                onClick={() => updatePassenger.mutate({ passengerId: passenger.id, payload: { boarding_status: 'boarded' } })}
                                disabled={updatePassenger.isPending}
                                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                              >
                                Embarqué
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>

            <aside className="space-y-5">
              <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  Dossier avis de séjour
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Motif</dt>
                    <dd className="mt-1 font-medium text-foreground">{data.visit_purpose || '--'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Catégorie</dt>
                    <dd className="mt-1 font-medium text-foreground">{data.visit_category || '--'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">QR opérationnel</dt>
                    <dd className="mt-1 break-all text-xs text-muted-foreground">{data.qr_url || '--'}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  PAX hors manifeste
                </div>
                {data.unassigned_pax.length === 0 ? (
                  <div className="mt-4 rounded-2xl bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                    Tous les PAX de l’avis de séjour sont déjà rattachés à un manifeste.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {data.unassigned_pax.map((pax) => (
                      <div key={pax.ads_pax_id} className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                        <div className="text-sm font-semibold text-foreground">{pax.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {pax.company || 'Société non renseignée'} • Badge {pax.badge_number || '--'} • Statut dossier {pax.pax_status || '--'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CircleDashed className="h-4 w-4 text-primary" />
                  Règle d’usage
                </div>
                <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Utilise ce QR comme ticket opérationnel de terrain. Le pointage ici met à jour le manifeste réel TravelWiz, pas une copie parallèle.
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdsBoardingScanPage
