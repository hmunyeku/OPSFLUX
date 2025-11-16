"use client"

import * as React from "react"
import { LayoutGrid, List, Columns, Kanban } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useViewMode } from "@/hooks/use-view-mode"
import { type ViewMode } from "@/lib/ui-preferences-context"

interface ViewModeToggleProps {
  /**
   * Available view modes for this component
   * Default: ["list", "grid", "table"]
   */
  availableModes?: ViewMode[]

  /**
   * Default view mode if no preference is set
   * Default: "list"
   */
  defaultMode?: ViewMode

  /**
   * Show as button group instead of dropdown
   * Default: false
   */
  asButtonGroup?: boolean

  /**
   * Size of the buttons
   * Default: "default"
   */
  size?: "default" | "sm" | "lg" | "icon"
}

const viewModeIcons: Record<ViewMode, React.ElementType> = {
  list: List,
  grid: LayoutGrid,
  table: Columns,
  kanban: Kanban,
}

const viewModeLabels: Record<ViewMode, string> = {
  list: "Liste",
  grid: "Grille",
  table: "Tableau",
  kanban: "Kanban",
}

export function ViewModeToggle({
  availableModes = ["list", "grid", "table"],
  defaultMode = "list",
  asButtonGroup = false,
  size = "default",
}: ViewModeToggleProps) {
  const { viewMode, setViewMode } = useViewMode(defaultMode)

  const handleModeChange = async (mode: ViewMode) => {
    await setViewMode(mode)
  }

  if (asButtonGroup) {
    return (
      <TooltipProvider>
        <div className="flex gap-1 rounded-lg border bg-background p-1">
          {availableModes.map((mode) => {
            const Icon = viewModeIcons[mode]
            const isActive = viewMode === mode

            return (
              <Tooltip key={mode}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size={size}
                    onClick={() => handleModeChange(mode)}
                    className={isActive ? "bg-muted" : ""}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{viewModeLabels[mode]}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
    )
  }

  const CurrentIcon = viewModeIcons[viewMode]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <CurrentIcon className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">{viewModeLabels[viewMode]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mode d&apos;affichage</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableModes.map((mode) => {
          const Icon = viewModeIcons[mode]
          const isActive = viewMode === mode

          return (
            <DropdownMenuItem key={mode} onClick={() => handleModeChange(mode)}>
              <Icon className="mr-2 h-4 w-4" />
              <span>{viewModeLabels[mode]}</span>
              {isActive && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Simple icon-only toggle button that cycles through modes
 */
export function ViewModeToggleSimple({
  availableModes = ["list", "grid"],
  defaultMode = "list",
  size = "icon",
}: Omit<ViewModeToggleProps, "asButtonGroup">) {
  const { viewMode, setViewMode } = useViewMode(defaultMode)

  const handleToggle = async () => {
    const currentIndex = availableModes.indexOf(viewMode)
    const nextIndex = (currentIndex + 1) % availableModes.length
    await setViewMode(availableModes[nextIndex])
  }

  const CurrentIcon = viewModeIcons[viewMode]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size={size} onClick={handleToggle}>
            <CurrentIcon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Changer la vue ({viewModeLabels[viewMode]})</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
