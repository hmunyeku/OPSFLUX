/**
 * SystemTab — Unified system admin tab.
 *
 * Groups: System Health + Scheduled Tasks + Audit Log
 */
import { SystemHealthTab } from './SystemHealthTab'
import { SchedulerTab } from './SchedulerTab'
import { AuditTab } from './AuditTab'

export function SystemTab() {
  return (
    <>
      <SystemHealthTab />
      <SchedulerTab />
      <AuditTab />
    </>
  )
}
