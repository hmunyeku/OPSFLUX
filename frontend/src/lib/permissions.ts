/**
 * Permission utilities for filtering navigation items
 */

import type { NavItem } from '@/components/layout/types'

interface PermissionChecker {
  hasPermission: (code: string) => boolean
  hasAnyPermission: (codes: string[]) => boolean
  hasAllPermissions: (codes: string[]) => boolean
}

/**
 * Check if a navigation item should be visible based on user permissions
 * @param item - Navigation item to check
 * @param checker - Permission checker object
 * @returns true if item should be visible
 */
function shouldShowNavItem(item: NavItem, checker: PermissionChecker): boolean {
  // If requireAllPermissions is defined, user must have ALL listed permissions
  if (item.requireAllPermissions && item.requireAllPermissions.length > 0) {
    return checker.hasAllPermissions(item.requireAllPermissions)
  }

  // If requireAnyPermission is defined, user must have AT LEAST ONE permission
  if (item.requireAnyPermission && item.requireAnyPermission.length > 0) {
    return checker.hasAnyPermission(item.requireAnyPermission)
  }

  // If permission is defined, user must have this specific permission
  if (item.permission) {
    return checker.hasPermission(item.permission)
  }

  // No permission requirements - item is visible to everyone
  return true
}

/**
 * Filter navigation items based on user permissions
 * Recursively filters nested items and removes parent items with no visible children
 *
 * @param items - Array of navigation items to filter
 * @param checker - Permission checker object with hasPermission, hasAnyPermission, hasAllPermissions methods
 * @returns Filtered array of navigation items
 */
export function filterNavItems(
  items: NavItem[],
  checker: PermissionChecker
): NavItem[] {
  return items
    .map((item) => {
      // If item has sub-items, recursively filter them
      if (item.items && item.items.length > 0) {
        const filteredSubItems = filterNavItems(item.items, checker)

        // Only include parent item if it has visible children
        if (filteredSubItems.length === 0) {
          return null
        }

        return {
          ...item,
          items: filteredSubItems,
        }
      }

      // Check if this individual item should be visible
      if (!shouldShowNavItem(item, checker)) {
        return null
      }

      return item
    })
    .filter((item): item is NavItem => item !== null)
}
