import { Button } from '@/components/ui/Button'
import type { Tiers } from './types'

interface Props {
  tiers: Tiers
  onEdit: () => void
  onArchive: () => void
}

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

export function TiersDetail({ tiers, onEdit, onArchive }: Props) {
  const tone =
    tiers.status === 'active'  ? 'success' :
    tiers.status === 'pending' ? 'warning' :
    tiers.status === 'draft'   ? undefined :
    undefined

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1080 }}>

      {/* Page header */}
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>
            <a href="/tiers" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Tiers</a> ·{' '}
            <span className="tbl-cell-mono" style={{ fontFamily: 'JetBrains Mono', fontSize: 11.5 }}>{tiers.id}</span>
          </div>
          <h1 style={{ fontFamily: 'Archivo', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            {tiers.name}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
            {labelFor(tiers.type)} · Créé le {fmtDate(tiers.createdAt)}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={onArchive}>Archiver</Button>
          <Button variant="primary" onClick={onEdit}>Modifier</Button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="kpi-pp-grid" data-cols="4">
        <div className="kpi-pp">
          <div className="kpi-pp__label">CA annuel</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">
              {tiers.caAnnual ? (tiers.caAnnual / 1_000_000).toFixed(2) : '—'}
            </span>
            {tiers.caAnnual != null && <span className="kpi-pp__unit">M€</span>}
            {tiers.caDelta != null && (
              <span
                className="kpi-pp__delta"
                data-trend={tiers.caDelta > 0 ? 'up' : tiers.caDelta < 0 ? 'down' : 'flat'}
              >
                {tiers.caDelta > 0 ? '+' : ''}{tiers.caDelta}%
              </span>
            )}
          </div>
          <div className="kpi-pp__caption">vs. année précédente</div>
        </div>
        <div className="kpi-pp">
          <div className="kpi-pp__label">Projets actifs</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{tiers.activeProjects ?? 0}</span>
          </div>
        </div>
        <div className="kpi-pp">
          <div className="kpi-pp__label">Encours facturation</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">
              {tiers.outstandingInvoices ? fmtEUR.format(tiers.outstandingInvoices) : '0 €'}
            </span>
          </div>
          <div className="kpi-pp__caption">Échus inclus</div>
        </div>
        <div className="kpi-pp" data-invert>
          <div className="kpi-pp__label">Retards de paiement</div>
          <div className="kpi-pp__value-row">
            <span className="kpi-pp__value">{tiers.lateInvoices ?? 0}</span>
            <span className="kpi-pp__unit">factures</span>
          </div>
          <div className="kpi-pp__caption">data-invert: down = green</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Identité */}
          <div className="card-pp">
            <header className="card-pp__header">
              <h3 className="card-pp__title">Identité</h3>
              <div className="card-pp__actions">
                <Button variant="tertiary" size="sm" onClick={onEdit}>Éditer</Button>
              </div>
            </header>
            <div className="card-pp__body">
              <DefinitionList items={[
                ['Raison sociale', tiers.name],
                ['SIRET',          <span className="tbl-cell-mono" key="siret">{tiers.siret ?? '—'}</span>],
                ['TVA intracom.',  tiers.vatNumber ?? '—'],
                ['Adresse',        tiers.address ?? '—'],
                ['Site web',       tiers.website ? <a href={tiers.website} key="w">{tiers.website}</a> : '—'],
              ]} />
            </div>
          </div>

          {/* Projets associés */}
          <div className="card-pp">
            <header className="card-pp__header">
              <h3 className="card-pp__title">Projets associés</h3>
              <span className="card-pp__subtitle">{tiers.projects?.length ?? 0} projets</span>
              <div className="card-pp__actions">
                <Button variant="secondary" size="sm">+ Nouveau projet</Button>
              </div>
            </header>
            <div className="card-pp__body card-pp__body--tight">
              {!tiers.projects?.length ? (
                <div className="tbl-empty" style={{ padding: 32 }}>
                  <strong>Aucun projet rattaché</strong>
                  Crée un projet et rattache-le à ce tiers pour le voir apparaître ici.
                </div>
              ) : (
                <table className="tbl-pp" data-density="compact">
                  <thead><tr>
                    <th>Réf.</th><th>Sujet</th><th className="tbl-cell-num">Heures</th><th>Statut</th>
                  </tr></thead>
                  <tbody>
                    {tiers.projects.map(p => (
                      <tr key={p.id} data-clickable>
                        <td className="tbl-cell-mono">{p.ref}</td>
                        <td>{p.subject}</td>
                        <td className="tbl-cell-num">{p.hours.toLocaleString('fr-FR')}</td>
                        <td><span className={`chip ${p.status === 'active' ? 'chip-success' : 'chip-warn'}`}>● {p.statusLabel}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tone && (
            <div className="card-pp" data-tone={tone}>
              <div className="card-pp__body card-pp__body--cozy" style={{ fontSize: 13 }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>
                  {tiers.status === 'active' ? 'Tiers actif' : 'En attente de validation'}
                </strong>
                <span style={{ color: 'var(--muted)' }}>
                  {tiers.status === 'active'
                    ? 'Toutes les opérations sont disponibles.'
                    : 'Validation comptable requise avant facturation.'}
                </span>
              </div>
            </div>
          )}

          <div className="card-pp">
            <header className="card-pp__header">
              <h3 className="card-pp__title">Contact principal</h3>
            </header>
            <div className="card-pp__body card-pp__body--cozy">
              {tiers.primaryContact ? (
                <DefinitionList items={[
                  ['Nom',     tiers.primaryContact.name],
                  ['Rôle',    tiers.primaryContact.role],
                  ['Email',   <a href={`mailto:${tiers.primaryContact.email}`} key="e">{tiers.primaryContact.email}</a>],
                  ['Tél.',    tiers.primaryContact.phone],
                ]} />
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Aucun contact défini.</p>
              )}
            </div>
            <footer className="card-pp__footer">
              <Button variant="tertiary" size="sm">+ Ajouter un contact</Button>
            </footer>
          </div>

          <div className="card-pp">
            <header className="card-pp__header">
              <h3 className="card-pp__title">Activité récente</h3>
            </header>
            <div className="card-pp__body card-pp__body--cozy">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                {(tiers.activity ?? []).slice(0, 5).map((a, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--muted)', flexShrink: 0, width: 64 }}>{fmtDate(a.at)}</span>
                    <span>{a.label}</span>
                  </li>
                ))}
                {!tiers.activity?.length && (
                  <li style={{ color: 'var(--muted)' }}>Aucune activité.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DefinitionList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: 13 }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--muted)', fontWeight: 500 }}>{k}</dt>
          <dd style={{ margin: 0 }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function labelFor(type: Tiers['type']) {
  return ({ client: 'Client final', subcontractor: 'Sous-traitant', partner: 'Partenaire', supplier: 'Fournisseur' })[type]
}
