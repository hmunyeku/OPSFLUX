"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Printer,
  Maximize2,
  RefreshCw,
  Settings,
  MoreVertical,
  FileSpreadsheet,
  FileText,
  Minimize2,
  GripVertical,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface DashboardWidgetProps {
  title: string
  children: React.ReactNode
  className?: string
  onExport?: (format: "csv" | "excel" | "pdf") => void
  onPrint?: () => void
  onRefresh?: () => void
  onSettings?: () => void
  isRefreshing?: boolean
  isDraggable?: boolean
}

export function DashboardWidget({
  title,
  children,
  className,
  onExport,
  onPrint,
  onRefresh,
  onSettings,
  isRefreshing = false,
  isDraggable = false,
}: DashboardWidgetProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleExport = (format: "csv" | "excel" | "pdf") => {
    if (onExport) {
      onExport(format)
    } else {
      // Default export behavior
      console.log(`[v0] Exporting widget "${title}" as ${format}`)
      // In a real app, this would trigger actual export logic
    }
  }

  const handlePrint = () => {
    if (onPrint) {
      onPrint()
    } else {
      // Default print behavior
      console.log(`[v0] Printing widget "${title}"`)
      window.print()
    }
  }

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh()
    } else {
      console.log(`[v0] Refreshing widget "${title}"`)
    }
  }

  const widgetContent = (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          {isDraggable && (
            <div className="drag-handle cursor-move">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {/* Refresh Button */}
          {onRefresh && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </Button>
          )}

          {/* Fullscreen Toggle */}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>

          {/* Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {onExport && (
                <>
                  <DropdownMenuItem onClick={() => handleExport("csv")}>
                    <FileText className="mr-2 h-4 w-4" />
                    Exporter en CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Exporter en Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")}>
                    <FileText className="mr-2 h-4 w-4" />
                    Exporter en PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {onPrint && (
                <>
                  <DropdownMenuItem onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimer
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {onSettings && (
                <DropdownMenuItem onClick={onSettings}>
                  <Settings className="mr-2 h-4 w-4" />
                  Paramètres
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pb-4">{children}</CardContent>
    </Card>
  )

  if (isFullscreen) {
    return (
      <Sheet open={isFullscreen} onOpenChange={setIsFullscreen}>
        <SheetContent side="right" className="w-full sm:max-w-[90vw] p-0">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-80px)] overflow-auto p-6">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return widgetContent
}
