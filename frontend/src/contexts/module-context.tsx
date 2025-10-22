"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { getModuleMenus, type ModuleMenuGroup } from '@/api/modules'

interface ModuleContextType {
  moduleMenus: ModuleMenuGroup[]
  isLoading: boolean
  refreshModuleMenus: () => Promise<void>
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined)

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [moduleMenus, setModuleMenus] = useState<ModuleMenuGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refreshModuleMenus = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getModuleMenus()
      setModuleMenus(response.data)
    } catch (_error) {
      // Failed to load module menus - use empty array
      setModuleMenus([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Charger les menus au montage initial
  useEffect(() => {
    refreshModuleMenus()
  }, [refreshModuleMenus])

  return (
    <ModuleContext.Provider value={{ moduleMenus, isLoading, refreshModuleMenus }}>
      {children}
    </ModuleContext.Provider>
  )
}

export function useModuleContext() {
  const context = useContext(ModuleContext)
  if (context === undefined) {
    throw new Error('useModuleContext must be used within a ModuleProvider')
  }
  return context
}
