/**
 * Settings Registry — Extensible settings tab system.
 *
 * Supports GitLab Pajamas sidebar patterns:
 * - Flat items (Profile, Emails, Notifications...)
 * - Collapsible groups (Access > Password, Tokens, Sessions...)
 * - Module-injected sections for both 'user' and 'general' categories
 *
 * Usage from a module:
 *   import { registerSettingsSection } from '@/lib/settingsRegistry'
 *   registerSettingsSection({
 *     id: 'mymodule-config',
 *     label: 'Mon Module',
 *     icon: Wrench,
 *     component: MyModuleSettings,
 *     category: 'general',
 *     order: 60,
 *   })
 *
 * For nested groups:
 *   registerSettingsGroup({ id: 'access', label: 'Accès', icon: KeyRound, category: 'user', order: 25 })
 *   registerSettingsSection({ id: 'password', ..., parentId: 'access', order: 10 })
 */
import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { useSyncExternalStore } from 'react'

export interface SettingsSection {
  /** Unique ID (e.g. 'profile', 'security', 'mymodule-config') */
  id: string
  /** Display label */
  label: string
  /** i18n translation key for the label */
  labelKey?: string
  /** Lucide icon for the sidebar */
  icon: LucideIcon
  /** React component to render as the settings content */
  component: ComponentType
  /** 'user' = User Settings, 'general' = Admin / System Settings */
  category: 'user' | 'general'
  /** Sort order (lower = higher in sidebar). Default 50. */
  order?: number
  /** Parent group ID — if set, this section is nested under a collapsible group */
  parentId?: string
  /** Permission code required to see this section. If omitted, visible to all authenticated users. */
  requiredPermission?: string
}

export interface SettingsGroup {
  /** Unique ID for the group */
  id: string
  /** Display label (e.g. "Accès") */
  label: string
  /** Lucide icon */
  icon: LucideIcon
  /** Category */
  category: 'user' | 'general'
  /** Sort order among top-level items */
  order?: number
}

const registry: SettingsSection[] = []
const groupRegistry: SettingsGroup[] = []
const listeners: Set<() => void> = new Set()

/**
 * Snapshot cache — useSyncExternalStore requires getSnapshot to return
 * referentially stable values when nothing has changed.
 */
let version = 0
const snapshotCache = new Map<string, { version: number; sections: SettingsSection[] }>()
const groupSnapshotCache = new Map<string, { version: number; groups: SettingsGroup[] }>()

/** Register a new settings section. Can be called from any module at init time. */
export function registerSettingsSection(section: SettingsSection) {
  const idx = registry.findIndex((s) => s.id === section.id)
  if (idx >= 0) {
    registry[idx] = section
  } else {
    registry.push(section)
  }
  registry.sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
  version++
  listeners.forEach((fn) => fn())
}

/** Register a collapsible group (like GitLab "Access" section). */
export function registerSettingsGroup(group: SettingsGroup) {
  const idx = groupRegistry.findIndex((g) => g.id === group.id)
  if (idx >= 0) {
    groupRegistry[idx] = group
  } else {
    groupRegistry.push(group)
  }
  groupRegistry.sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
  version++
  listeners.forEach((fn) => fn())
}

/** Unregister a settings section by ID. */
export function unregisterSettingsSection(id: string) {
  const idx = registry.findIndex((s) => s.id === id)
  if (idx >= 0) {
    registry.splice(idx, 1)
    version++
    listeners.forEach((fn) => fn())
  }
}

/** Get top-level sections for a category (those without parentId). Cached. */
export function getSettingsSections(category: 'user' | 'general'): SettingsSection[] {
  const cacheKey = `sections:${category}`
  const cached = snapshotCache.get(cacheKey)
  if (cached && cached.version === version) {
    return cached.sections
  }
  const sections = registry.filter((s) => s.category === category && !s.parentId)
  snapshotCache.set(cacheKey, { version, sections })
  return sections
}

/** Get child sections for a specific group. Cached. */
export function getGroupChildren(groupId: string): SettingsSection[] {
  const cacheKey = `children:${groupId}`
  const cached = snapshotCache.get(cacheKey)
  if (cached && cached.version === version) {
    return cached.sections
  }
  const sections = registry.filter((s) => s.parentId === groupId)
  sections.sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
  snapshotCache.set(cacheKey, { version, sections })
  return sections
}

/** Get groups for a category. Cached. */
export function getSettingsGroups(category: 'user' | 'general'): SettingsGroup[] {
  const cacheKey = `groups:${category}`
  const cached = groupSnapshotCache.get(cacheKey)
  if (cached && cached.version === version) {
    return cached.groups
  }
  const groups = groupRegistry.filter((g) => g.category === category)
  groupSnapshotCache.set(cacheKey, { version, groups })
  return groups
}

/** Get ALL registered sections (including nested). */
export function getAllSettingsSections(): SettingsSection[] {
  return [...registry]
}

/** Find a section by ID across all sections. */
export function findSettingsSection(id: string): SettingsSection | undefined {
  return registry.find((s) => s.id === id)
}

/** Subscribe to registry changes (for React integration). */
export function subscribeToRegistry(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** React hook — get top-level sections for a category. */
export function useSettingsSections(category: 'user' | 'general'): SettingsSection[] {
  return useSyncExternalStore(
    subscribeToRegistry,
    () => getSettingsSections(category),
  )
}

/** React hook — get groups for a category. */
export function useSettingsGroups(category: 'user' | 'general'): SettingsGroup[] {
  return useSyncExternalStore(
    subscribeToRegistry,
    () => getSettingsGroups(category),
  )
}

/** React hook — get children of a group. */
export function useGroupChildren(groupId: string): SettingsSection[] {
  return useSyncExternalStore(
    subscribeToRegistry,
    () => getGroupChildren(groupId),
  )
}
