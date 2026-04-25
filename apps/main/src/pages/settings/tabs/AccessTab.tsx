/**
 * AccessTab — Unified access management tab.
 *
 * Renders SecurityTab, AccessTokensTab, ApplicationsTab, SessionsTab
 * sequentially. Each sub-tab already has its own CollapsibleSections.
 */
import { SecurityTab } from './SecurityTab'
import { AccessTokensTab } from './AccessTokensTab'
import { ApplicationsTab } from './ApplicationsTab'
import { SessionsTab } from './SessionsTab'

export function AccessTab() {
  return (
    <>
      <SecurityTab />
      <AccessTokensTab />
      <ApplicationsTab />
      <SessionsTab />
    </>
  )
}
