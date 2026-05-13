/**
 * MFAEnforceOverlay — #6 MFA admin config obligatoire.
 *
 * Overlay plein écran bloquant rendu quand :
 *   - l'admin a activé le setting auth.mfa_required_for_all
 *   - l'utilisateur courant n'a PAS encore activé MFA
 *
 * Backed by GET /api/v1/auth/mfa-policy via useMfaPolicy().
 *
 * UX :
 *   - Backdrop dark non-cliquable (z-50 au-dessus de toute UI)
 *   - Card avec icone Shield, message d'explication
 *   - CTA "Configurer maintenant" -> navigate /settings/security#mfa
 *   - Pas de bouton "Plus tard" (c'est le sens : obligatoire)
 *   - Si l'user est deja sur /settings/security, l'overlay se masque
 *     automatiquement pour permettre l'interaction avec la page MFA
 *
 * Pourquoi un overlay client-side et non un middleware backend ?
 *   - Le backend ne peut pas distinguer "user en plein setup MFA" de
 *     "user qui contourne". Une enforcement strict cote backend
 *     casserait /mfa/setup lui-meme (boucle).
 *   - L'overlay est purement UX : il bloque l'utilisation normale mais
 *     laisse passer la navigation vers /settings/security ou un user
 *     legitime fait son setup.
 */
import { useNavigate, useLocation } from 'react-router-dom'
import { Shield, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMfaPolicy } from '@/hooks/useSettings'

export function MFAEnforceOverlay() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: policy } = useMfaPolicy()

  // Pas de policy / pas d'obligation → rien à afficher
  if (!policy?.current_user_must_setup) return null

  // Si l'user est deja sur la page security, on masque l'overlay
  // pour ne pas bloquer le setup MFA lui-meme.
  if (location.pathname.startsWith('/settings/security')) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mfa-enforce-title"
      aria-describedby="mfa-enforce-desc"
    >
      <div className="mx-4 max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <div className="mb-4 rounded-full bg-amber-100 p-3 dark:bg-amber-950/40">
            <ShieldAlert size={28} className="text-amber-600 dark:text-amber-400" />
          </div>

          <h2 id="mfa-enforce-title" className="text-lg font-semibold text-foreground">
            {t('mfa.enforce.title', 'Authentification à deux facteurs requise')}
          </h2>

          <p id="mfa-enforce-desc" className="mt-2 text-sm text-muted-foreground">
            {t(
              'mfa.enforce.description',
              "Votre administrateur a rendu l'authentification à deux facteurs obligatoire. Vous devez configurer le MFA avant d'utiliser l'application.",
            )}
          </p>

          <div className="mt-4 flex w-full items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <Shield size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">
                {t('mfa.enforce.why_title', 'Pourquoi ?')}
              </p>
              <p className="mt-0.5">
                {t(
                  'mfa.enforce.why_description',
                  "Le MFA protège votre compte si votre mot de passe est compromis. Il prend 2 minutes à configurer avec une application comme Google Authenticator ou Microsoft Authenticator.",
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => navigate('/settings/security#mfa')}
          >
            {t('mfa.enforce.cta', 'Configurer maintenant')}
          </button>

          <p className="mt-3 text-[11px] text-muted-foreground">
            {t(
              'mfa.enforce.contact_admin',
              'En cas de problème, contactez votre administrateur.',
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
