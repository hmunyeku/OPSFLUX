/**
 * AccessTab — Unified access management tab.
 *
 * Groups: Password, Access Tokens, Applications, Active Sessions
 * into a single settings page with collapsible sections.
 */
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { SecurityTab } from './SecurityTab'
import { AccessTokensTab } from './AccessTokensTab'
import { ApplicationsTab } from './ApplicationsTab'
import { SessionsTab } from './SessionsTab'

export function AccessTab() {
  return (
    <>
      <CollapsibleSection
        id="password"
        title="Mot de passe"
        description="Modifier votre mot de passe et configurer l'authentification à deux facteurs."
        storageKey="settings.access.collapse"
        defaultExpanded
      >
        <SecurityTab />
      </CollapsibleSection>

      <CollapsibleSection
        id="tokens"
        title="Jetons d'accès"
        description="Gérez vos jetons d'API pour l'accès programmatique."
        storageKey="settings.access.collapse"
      >
        <AccessTokensTab />
      </CollapsibleSection>

      <CollapsibleSection
        id="applications"
        title="Applications"
        description="Applications tierces ayant accès à votre compte."
        storageKey="settings.access.collapse"
      >
        <ApplicationsTab />
      </CollapsibleSection>

      <CollapsibleSection
        id="sessions"
        title="Sessions actives"
        description="Gérez vos sessions de connexion actives."
        storageKey="settings.access.collapse"
      >
        <SessionsTab />
      </CollapsibleSection>
    </>
  )
}
