/**
 * useStagingRef — shared staging-session helper for Create panels.
 *
 * Generates a client-side UUID that lives for the lifetime of the Create
 * panel. Polymorphic children (attachments, notes, tags, …) uploaded
 * before the parent row exists are POSTed against
 *   `owner_type='{module}_staging'` + `owner_id=<stagingRef>`
 * On successful create, the frontend passes `staging_ref: stagingRef`
 * in the payload; the backend re-targets those rows to the new parent
 * via `commit_staging_children` in one SQL UPDATE per table.
 *
 * Usage:
 *   const { stagingRef, stagingOwnerType } = useStagingRef('project')
 *   // ...
 *   <AttachmentManager ownerType={stagingOwnerType} ownerId={stagingRef} />
 *   <RichTextField imageOwnerType={stagingOwnerType} imageOwnerId={stagingRef} />
 *   // on submit:
 *   await create({ ...payload, staging_ref: stagingRef })
 *
 * The UUID is memoised per mount — re-renders never re-generate it.
 * Abandoned staging rows are swept by the hourly
 * `polymorphic_staging_cleanup` cron on the backend.
 */
import { useMemo } from 'react'

export interface StagingRef {
  /** The client-generated UUID representing this Create session. */
  stagingRef: string
  /** The full `{module}_staging` owner_type to pass to child managers. */
  stagingOwnerType: string
}

/**
 * @param module  Short module slug (e.g. `'moc'`, `'project'`, `'ads'`).
 *                The backend expects `{module}_staging` to fallback to
 *                the same permissions as the base module's write action.
 */
export function useStagingRef(module: string): StagingRef {
  const stagingRef = useMemo(
    () => globalThis.crypto?.randomUUID?.() ?? '',
    [],
  )
  const stagingOwnerType = `${module}_staging`
  return { stagingRef, stagingOwnerType }
}
