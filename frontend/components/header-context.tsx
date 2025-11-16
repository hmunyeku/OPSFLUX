"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"

export interface ContextualHeaderButton {
  label: string
  icon?: LucideIcon
  onClick: () => void
  variant?: "default" | "outline" | "ghost" | "destructive"
}

interface HeaderContextValue {
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  contextualButtons?: ContextualHeaderButton[]
  customRender?: React.ReactNode
  setContextualHeader: (config: {
    searchPlaceholder?: string
    searchValue?: string
    onSearchChange?: (value: string) => void
    contextualButtons?: ContextualHeaderButton[]
    customRender?: React.ReactNode
  }) => void
  clearContextualHeader: () => void
}

const HeaderContext = React.createContext<HeaderContextValue | undefined>(undefined)

export function HeaderProvider({ children }: { children: React.ReactNode }) {
  const [searchPlaceholder, setSearchPlaceholder] = React.useState<string>()
  const [searchValue, setSearchValue] = React.useState<string>()
  const [onSearchChange, setOnSearchChange] = React.useState<((value: string) => void) | undefined>()
  const [contextualButtons, setContextualButtons] = React.useState<ContextualHeaderButton[]>()
  const [customRender, setCustomRender] = React.useState<React.ReactNode>()

  const setContextualHeader = React.useCallback(
    (config: {
      searchPlaceholder?: string
      searchValue?: string
      onSearchChange?: (value: string) => void
      contextualButtons?: ContextualHeaderButton[]
      customRender?: React.ReactNode
    }) => {
      setSearchPlaceholder(config.searchPlaceholder)
      setSearchValue(config.searchValue)
      setOnSearchChange(() => config.onSearchChange)
      setContextualButtons(config.contextualButtons)
      setCustomRender(config.customRender)
    },
    [],
  )

  const clearContextualHeader = React.useCallback(() => {
    setSearchPlaceholder(undefined)
    setSearchValue(undefined)
    setOnSearchChange(undefined)
    setContextualButtons(undefined)
    setCustomRender(undefined)
  }, [])

  return (
    <HeaderContext.Provider
      value={{
        searchPlaceholder,
        searchValue,
        onSearchChange,
        contextualButtons,
        customRender,
        setContextualHeader,
        clearContextualHeader,
      }}
    >
      {children}
    </HeaderContext.Provider>
  )
}

export function useHeaderContext() {
  const context = React.useContext(HeaderContext)
  if (!context) {
    throw new Error("useHeaderContext must be used within HeaderProvider")
  }
  return context
}
