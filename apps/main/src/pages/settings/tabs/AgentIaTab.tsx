/**
 * Settings tab — configure the autonomous maintenance agent.
 *
 * Everything the spec asks for in `/admin/support/agent/config`:
 *   - Activation + default connectors
 *   - Autonomy + auto-trigger + allow_direct_deployment
 *   - Night window + max runs per window + daily digest email
 *   - Budget + circuit breaker
 *   - Forbidden path patterns (textarea)
 *   - Preview digest button
 */
import { useEffect, useState } from 'react'
import { Bot, Loader2, Save, Send, AlertTriangle, Mail, Clock, Shield, ListX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAgentConfig, useUpdateAgentConfig } from '@/hooks/useAgentRuns'
import { useIntegrationConnections } from '@/hooks/useIntegrationConnections'
import { useToast } from '@/components/ui/Toast'
import api from '@/lib/api'

export function AgentIaTab() {
  const { t } = useTranslation()
  const { data: config, isLoading } = useAgentConfig()
  const { data: allConnectors } = useIntegrationConnections()
  const update = useUpdateAgentConfig()
  const { toast } = useToast()

  // Local form state mirrors config for dirty-check + save
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [forbiddenText, setForbiddenText] = useState('')
  const [sendingDigest, setSendingDigest] = useState(false)
  const [resettingBreaker, setResettingBreaker] = useState(false)

  useEffect(() => {
    if (config) {
      const c = config as unknown as Record<string, unknown>
      setForm({ ...c })
      const patterns = (c.forbidden_path_patterns as string[] | undefined) ?? []
      setForbiddenText(patterns.join('\n'))
    }
  }, [config])

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const githubConns = (allConnectors ?? []).filter((c) => c.connection_type === 'github' && c.status === 'active')
  const runnerConns = (allConnectors ?? []).filter((c) => c.connection_type === 'agent_runner' && c.status === 'active')
  const dokployConns = (allConnectors ?? []).filter((c) => c.connection_type === 'dokploy' && c.status === 'active')

  const handleSave = async () => {
    try {
      const body: Record<string, unknown> = { ...form }
      body.forbidden_path_patterns = forbiddenText.split('\n').map((s) => s.trim()).filter(Boolean)
      // Drop fields that are computed server-side
      for (const k of ['current_consecutive_failures', 'circuit_breaker_tripped_at', 'current_month_spent_usd', 'last_digest_sent_at', 'updated_at', 'entity_id']) {
        delete body[k]
      }
      // Coerce empty strings to null for connector selects
      for (const k of ['default_github_connection_id', 'default_runner_connection_id', 'default_dokploy_staging_id', 'default_dokploy_prod_id', 'auto_window_start_hour', 'auto_window_end_hour', 'auto_report_email']) {
        if (body[k] === '') body[k] = null
      }
      await update.mutateAsync(body as never)
      toast({ title: t('settings.agent_ia.toast.saved', 'Configuration agent sauvegardée'), variant: 'success' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('common.error', 'Erreur'), description: msg || String(err), variant: 'error' })
    }
  }

  const handleResetCircuitBreaker = async () => {
    if (!window.confirm(t('settings.agent_ia.confirm.reset_cb', 'Réinitialiser le circuit breaker ? Les runs pourront être relancés immédiatement.'))) return
    setResettingBreaker(true)
    try {
      await api.post('/api/v1/support/agent/config/reset-circuit-breaker')
      toast({ title: t('settings.agent_ia.toast.cb_reset', 'Circuit breaker réinitialisé'), variant: 'success' })
      // Update local state optimistically so the banner disappears.
      setForm((f) => ({ ...f, circuit_breaker_tripped_at: null, current_consecutive_failures: 0 }))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('settings.agent_ia.toast.cb_reset_failed', 'Échec réinitialisation'), description: msg || String(err), variant: 'error' })
    } finally {
      setResettingBreaker(false)
    }
  }

  const handleSendDigestNow = async () => {
    setSendingDigest(true)
    try {
      const { data } = await api.post<{ sent_to: string }>('/api/v1/support/agent/config/send-digest-now')
      toast({
        title: t('settings.agent_ia.toast.digest_sent', 'Digest envoyé'),
        description: t('settings.agent_ia.toast.digest_sent_desc', 'Expédié à {{to}}', { to: data.sent_to }),
        variant: 'success',
      })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('settings.agent_ia.toast.digest_failed', 'Envoi impossible'), description: msg || String(err), variant: 'error' })
    } finally {
      setSendingDigest(false)
    }
  }

  if (isLoading || !config) {
    return <div className="p-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> {t('common.loading', 'Chargement…')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Bot size={14} /> {t('settings.agent_ia.title', 'Agent de maintenance IA')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('settings.agent_ia.subtitle', 'Résolution autonome de tickets via Claude Code/Codex — avec human-in-the-loop.')}
          </p>
        </div>
        <button type="button" className="gl-button gl-button-sm gl-button-confirm" onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {t('common.save', 'Enregistrer')}
        </button>
      </div>

      {/* Activation */}
      <Section title={t('settings.agent_ia.section.activation', 'Activation')} icon={<Bot size={12} />}>
        <Row label={t('settings.agent_ia.row.enabled', 'Agent activé')} hint={t('settings.agent_ia.hint.enabled', "Désactive complètement l'agent. Les runs en cours ne sont pas interrompus.")}>
          <Toggle checked={Boolean(form.enabled)} onChange={(v) => set('enabled', v)} />
        </Row>
        <Row label={t('settings.agent_ia.row.default_autonomy', "Mode d'autonomie par défaut")}>
          <select className="gl-form-input" value={String(form.default_autonomy_mode ?? 'recommendation')} onChange={(e) => set('default_autonomy_mode', e.target.value)}>
            <option value="observation">{t('settings.agent_ia.autonomy.observation', 'Observation (analyse seulement, pas de PR)')}</option>
            <option value="recommendation">{t('settings.agent_ia.autonomy.recommendation', 'Recommendation (PR draft, merge manuel)')}</option>
            <option value="autonomous_with_approval">{t('settings.agent_ia.autonomy.autonomous', 'Autonomous (staging + verification, puis approbation)')}</option>
          </select>
        </Row>
      </Section>

      {/* Connecteurs */}
      <Section title={t('settings.agent_ia.section.connectors', 'Connecteurs par défaut')}>
        <Row label="GitHub">
          <select className="gl-form-input" value={String(form.default_github_connection_id ?? '')} onChange={(e) => set('default_github_connection_id', e.target.value)}>
            <option value="">—</option>
            {githubConns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Row>
        <Row label={t('settings.agent_ia.row.agent_runner', 'Agent Runner')}>
          <select className="gl-form-input" value={String(form.default_runner_connection_id ?? '')} onChange={(e) => set('default_runner_connection_id', e.target.value)}>
            <option value="">—</option>
            {runnerConns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Row>
        <Row label={t('settings.agent_ia.row.dokploy_staging', 'Dokploy staging')}>
          <select className="gl-form-input" value={String(form.default_dokploy_staging_id ?? '')} onChange={(e) => set('default_dokploy_staging_id', e.target.value)}>
            <option value="">—</option>
            {dokployConns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Row>
        <Row label={t('settings.agent_ia.row.dokploy_prod', 'Dokploy production')}>
          <select className="gl-form-input" value={String(form.default_dokploy_prod_id ?? '')} onChange={(e) => set('default_dokploy_prod_id', e.target.value)}>
            <option value="">—</option>
            {dokployConns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </Row>
      </Section>

      {/* Mode auto / fenêtre horaire */}
      <Section title={t('settings.agent_ia.section.auto_mode', 'Mode automatique')} icon={<Clock size={12} />}>
        <Row label={t('settings.agent_ia.row.auto_trigger', 'Lancement auto sur nouveaux tickets')} hint={t('settings.agent_ia.hint.auto_trigger', "Si activé, le scheduler scanne les tickets toutes les 5 min et lance l'agent sur les éligibles (dans la fenêtre).")}>
          <Toggle checked={Boolean(form.automatic_trigger_enabled)} onChange={(v) => set('automatic_trigger_enabled', v)} />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="gl-label-sm">{t('settings.agent_ia.row.window_start', 'Fenêtre — heure début (UTC)')}</label>
            <input type="number" min={0} max={23} className="gl-form-input" placeholder="23" value={String(form.auto_window_start_hour ?? '')} onChange={(e) => set('auto_window_start_hour', e.target.value === '' ? null : parseInt(e.target.value))} />
          </div>
          <div>
            <label className="gl-label-sm">{t('settings.agent_ia.row.window_end', 'Fenêtre — heure fin (UTC)')}</label>
            <input type="number" min={0} max={23} className="gl-form-input" placeholder="6" value={String(form.auto_window_end_hour ?? '')} onChange={(e) => set('auto_window_end_hour', e.target.value === '' ? null : parseInt(e.target.value))} />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t('settings.agent_ia.hint.window', 'Laisse vide pour tourner 24/7. Wrap-around supporté : 23 → 6 = la nuit.')}
        </p>
        <Row label={t('settings.agent_ia.row.max_runs', 'Max runs par fenêtre (cap dur)')}>
          <input type="number" min={1} max={50} className="gl-form-input" value={Number(form.auto_max_runs_per_window ?? 3)} onChange={(e) => set('auto_max_runs_per_window', parseInt(e.target.value) || 1)} />
        </Row>
        <Row label={t('settings.agent_ia.row.allow_direct', 'Autoriser le déploiement direct (B/C)')} hint={t('settings.agent_ia.hint.allow_direct', '⚠ Attention : modes B/C déploient sans staging préalable.')}>
          <Toggle checked={Boolean(form.allow_direct_deployment)} onChange={(v) => set('allow_direct_deployment', v)} />
        </Row>
      </Section>

      {/* Rapport mail matinal */}
      <Section title={t('settings.agent_ia.section.daily_report', 'Rapport quotidien')} icon={<Mail size={12} />}>
        <Row label={t('settings.agent_ia.row.email_to', 'Email destinataire')}>
          <input type="email" className="gl-form-input" placeholder="toi@exemple.com" value={String(form.auto_report_email ?? '')} onChange={(e) => set('auto_report_email', e.target.value)} />
        </Row>
        <Row label={t('settings.agent_ia.row.send_hour', "Heure d'envoi (UTC)")}>
          <input type="number" min={0} max={23} className="gl-form-input" value={Number(form.auto_report_hour_utc ?? 7)} onChange={(e) => set('auto_report_hour_utc', parseInt(e.target.value) || 7)} />
        </Row>
        <div className="flex items-center gap-2 flex-wrap">
          {/* The send-now endpoint reads config.auto_report_email from
              the DB, not the unsaved form — disable the button until
              the saved value matches what the user typed, otherwise
              click would 400. */}
          {(() => {
            const savedEmail = String(config.auto_report_email ?? '')
            const typedEmail = String(form.auto_report_email ?? '')
            const needsSave = typedEmail !== savedEmail
            const cantSend = sendingDigest || !savedEmail
            return (
              <>
                <button
                  type="button"
                  className="gl-button gl-button-sm gl-button-default"
                  onClick={handleSendDigestNow}
                  disabled={cantSend}
                  title={
                    !savedEmail
                      ? t('settings.agent_ia.tip.no_email', "Renseigne puis enregistre l'email destinataire d'abord")
                      : needsSave
                        ? t('settings.agent_ia.tip.unsaved_email', "Tu as modifié l'email — enregistre d'abord, puis reclique")
                        : undefined
                  }
                >
                  {sendingDigest ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {t('settings.agent_ia.btn.send_now', 'Envoyer maintenant (test)')}
                </button>
                {needsSave && savedEmail && (
                  <span className="text-[10px] text-amber-600">
                    {t('settings.agent_ia.warn.unsaved', 'Modifications non enregistrées — clique "Enregistrer" avant d\'envoyer')}
                  </span>
                )}
              </>
            )
          })()}
          {config.last_digest_sent_at && (
            <span className="text-[10px] text-muted-foreground">
              {t('settings.agent_ia.last_send', 'Dernier envoi')} : {new Date(config.last_digest_sent_at as unknown as string).toLocaleString()}
            </span>
          )}
        </div>
      </Section>

      {/* Budgets / circuit breaker */}
      <Section title={t('settings.agent_ia.section.budgets', 'Budgets & sécurité')} icon={<Shield size={12} />}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="gl-label-sm">{t('settings.agent_ia.row.monthly_budget', 'Budget mensuel (USD)')}</label>
            <input type="number" className="gl-form-input" value={Number(form.monthly_budget_usd ?? 500)} onChange={(e) => set('monthly_budget_usd', parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="gl-label-sm">{t('settings.agent_ia.row.max_concurrent', 'Runs simultanés max')}</label>
            <input type="number" min={1} max={20} className="gl-form-input" value={Number(form.max_concurrent_runs ?? 2)} onChange={(e) => set('max_concurrent_runs', parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label className="gl-label-sm">{t('settings.agent_ia.row.max_lines', 'Lignes max/run')}</label>
            <input type="number" className="gl-form-input" value={Number(form.max_lines_modified_per_run ?? 500)} onChange={(e) => set('max_lines_modified_per_run', parseInt(e.target.value) || 100)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="gl-label-sm">{t('settings.agent_ia.row.cb_threshold', 'Circuit breaker — seuil')}</label>
            <input type="number" className="gl-form-input" value={Number(form.circuit_breaker_threshold ?? 5)} onChange={(e) => set('circuit_breaker_threshold', parseInt(e.target.value) || 3)} />
          </div>
          <div>
            <label className="gl-label-sm">{t('settings.agent_ia.row.cb_cooldown', 'Cooldown (heures)')}</label>
            <input type="number" className="gl-form-input" value={Number(form.circuit_breaker_cooldown_hours ?? 24)} onChange={(e) => set('circuit_breaker_cooldown_hours', parseInt(e.target.value) || 1)} />
          </div>
        </div>
        <div className="bg-muted/40 border border-border/60 rounded p-2.5 text-[11px]">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-muted-foreground">{t('settings.agent_ia.stat.spent_month', 'Dépensé ce mois')} :</span>{' '}
              <strong>${Number(config.current_month_spent_usd ?? 0).toFixed(2)} / ${Number(config.monthly_budget_usd ?? 500).toFixed(0)}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">{t('settings.agent_ia.stat.consec_failures', 'Échecs consécutifs')} :</span>{' '}
              <strong>{Number((config as unknown as Record<string, unknown>).current_consecutive_failures ?? 0)}</strong>
            </div>
            <div className="flex items-center gap-2">
              {(config as unknown as Record<string, unknown>).circuit_breaker_tripped_at ? (
                <>
                  <span className="text-destructive"><AlertTriangle size={10} className="inline" /> {t('settings.agent_ia.stat.cb_active', 'Circuit breaker actif')}</span>
                  <button
                    type="button"
                    className="gl-button gl-button-xs gl-button-default ml-auto"
                    onClick={handleResetCircuitBreaker}
                    disabled={resettingBreaker}
                    title={t('settings.agent_ia.tip.reset_cb', 'Ré-autorise les runs immédiatement. Action auditée.')}
                  >
                    {resettingBreaker ? <Loader2 size={10} className="animate-spin" /> : '↺'}
                    {t('settings.agent_ia.btn.reset', 'Réinitialiser')}
                  </button>
                </>
              ) : (
                <span className="text-green-700 dark:text-green-400">✓ {t('settings.agent_ia.stat.ready', 'Prêt')}</span>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Forbidden paths */}
      <Section title={t('settings.agent_ia.section.forbidden', 'Chemins interdits en modification')} icon={<ListX size={12} />}>
        <textarea
          className="gl-form-input font-mono text-[11px] h-40"
          value={forbiddenText}
          onChange={(e) => setForbiddenText(e.target.value)}
        />
        <p className="text-[10px] text-muted-foreground">
          {t('settings.agent_ia.hint.forbidden', "Un pattern glob par ligne. Tout chemin qui matche sera refusé au post-exec gate. L'agent ne pourra jamais modifier ces fichiers.")}
        </p>
      </Section>

      <div className="flex justify-end pt-4">
        <button type="button" className="gl-button gl-button-sm gl-button-confirm" onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {t('common.save', 'Enregistrer')}
        </button>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-border/60 rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {children}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr,auto] gap-3 items-center">
      <div>
        <div className="text-xs font-medium text-foreground">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}
