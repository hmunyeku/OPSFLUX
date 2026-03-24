/**
 * SystemTab — Unified system admin tab.
 *
 * Groups: System Health + Scheduled Tasks
 */
import { SystemHealthTab } from './SystemHealthTab'
import { SchedulerTab } from './SchedulerTab'

export function SystemTab() {
  return (
    <>
      <SystemHealthTab />
      <SchedulerTab />
    </>
  )
}
