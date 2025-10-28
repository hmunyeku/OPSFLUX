"use client"

import { Button } from "@/components/ui/button"
import {
  IconGripVertical,
  IconSettings,
  IconX,
  IconCopy,
  IconMaximize,
  IconCamera,
  IconFileExport,
  IconPrinter,
  IconChevronUp,
  IconChevronDown
} from "@tabler/icons-react"
import { getWidgetComponent } from "../registry"
import type { DashboardWidgetWithWidget } from "@/types/dashboard"
import { cn } from "@/lib/utils"
import { useState, useRef } from "react"
import html2canvas from "html2canvas"

interface WidgetWrapperProps {
  dashboardWidget: DashboardWidgetWithWidget
  isEditMode?: boolean
  isFullscreen?: boolean
  onRemove?: (id: string) => void
  onConfigure?: (widget: DashboardWidgetWithWidget) => void
  onDuplicate?: () => void
  onFullscreen?: () => void
}

export default function WidgetWrapper({
  dashboardWidget,
  isEditMode = false,
  isFullscreen = false,
  onRemove,
  onConfigure,
  onDuplicate,
  onFullscreen,
}: WidgetWrapperProps) {
  const { widget, config, id } = dashboardWidget
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)
  const widgetRef = useRef<HTMLDivElement>(null)

  if (!widget) {
    return (
      <div className="h-full flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20">
        <p className="text-sm text-muted-foreground">Widget non trouvé</p>
      </div>
    )
  }

  const WidgetComponent = getWidgetComponent(widget.widget_type)

  // Merge default config with instance config
  const mergedConfig = {
    ...widget.default_config,
    ...config,
  }

  // Detect widget type for appropriate actions
  const isChartWidget = widget.widget_type?.includes('chart') || widget.widget_type?.includes('line') || widget.widget_type?.includes('bar')
  const isTableWidget = widget.widget_type?.includes('table') || widget.widget_type?.includes('sql')

  // Capture widget as image
  const handleCapture = async () => {
    if (!widgetRef.current) return

    try {
      const canvas = await html2canvas(widgetRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      })
      const link = document.createElement('a')
      link.download = `${config?.title || widget.name}-${new Date().toISOString()}.png`
      link.href = canvas.toDataURL()
      link.click()
    } catch (error) {
      console.error('Failed to capture widget:', error)
    }
  }

  // Export widget data (placeholder - would need actual implementation per widget type)
  const handleExport = () => {
    // This would be implemented per widget type
    console.log('Export functionality to be implemented')
  }

  // Print widget
  const handlePrint = () => {
    window.print()
  }

  return (
    <div ref={widgetRef} className="h-full flex flex-col rounded-xl border border-border/40 bg-card shadow-sm hover:shadow-md hover:border-border transition-all duration-200 overflow-hidden">
      {/* Widget Header - Ultra Compact */}
      {!isHeaderCollapsed && (
        <div className={cn(
          "flex-none flex items-center justify-between border-b bg-gradient-to-r from-muted/5 via-muted/10 to-muted/5 backdrop-blur-sm",
          isFullscreen ? "px-2 sm:px-3 py-1.5" : "px-2 sm:px-3 py-1.5"
        )}>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isEditMode && (
              <div className="widget-drag-handle cursor-move shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <IconGripVertical className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
            <h3 className={cn(
              "font-semibold tracking-tight truncate text-foreground/90",
              isFullscreen ? "text-xs sm:text-sm" : "text-[10px] sm:text-xs"
            )}>
              {config?.title || widget.name}
            </h3>
          </div>

          {/* Widget Actions - Responsive */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Capture button for charts */}
            {!isEditMode && isChartWidget && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-muted/50"
                onClick={handleCapture}
                title="Capturer"
              >
                <IconCamera className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </Button>
            )}

            {/* Export button for tables */}
            {!isEditMode && isTableWidget && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-muted/50"
                onClick={handleExport}
                title="Exporter"
              >
                <IconFileExport className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </Button>
            )}

            {/* Print button in fullscreen */}
            {isFullscreen && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-muted/50"
                onClick={handlePrint}
                title="Imprimer"
              >
                <IconPrinter className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </Button>
            )}

            {/* Collapse toggle in fullscreen */}
            {isFullscreen && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-muted/50"
                onClick={() => setIsHeaderCollapsed(true)}
                title="Masquer le titre"
              >
                <IconChevronUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </Button>
            )}

            {!isEditMode && onFullscreen && !isFullscreen && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-muted/50"
                onClick={onFullscreen}
                title="Plein écran"
              >
                <IconMaximize className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </Button>
            )}
            {isEditMode && (
              <>
                {onDuplicate && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={onDuplicate}
                    title="Dupliquer"
                  >
                    <IconCopy className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  </Button>
                )}
                {onConfigure && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-muted/50"
                    onClick={() => onConfigure(dashboardWidget)}
                    title="Configurer"
                  >
                    <IconSettings className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  </Button>
                )}
                {onRemove && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onRemove(String(id))}
                    title="Supprimer"
                  >
                    <IconX className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Collapsed header toggle button */}
      {isHeaderCollapsed && isFullscreen && (
        <div className="flex-none flex justify-center p-1 border-b bg-muted/5">
          <Button
            size="icon"
            variant="ghost"
            className="h-4 w-full hover:bg-muted/50"
            onClick={() => setIsHeaderCollapsed(false)}
            title="Afficher le titre"
          >
            <IconChevronDown className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Widget Content - No padding, let widget control its own spacing */}
      <div className="flex-1 overflow-auto">
        <WidgetComponent config={mergedConfig} />
      </div>
    </div>
  )
}
