"use client"

import { useEffect, useRef, useState } from "react"
import { GridStack } from "gridstack"
import "gridstack/dist/gridstack.min.css"
import type { Dashboard, DashboardWidgetWithWidget } from "@/types/dashboard"
import WidgetWrapper from "@/widgets/base/widget-wrapper"

interface DashboardGridProps {
  dashboard: Dashboard
  widgets: DashboardWidgetWithWidget[]
  isEditMode?: boolean
  onLayoutChange?: (widgets: DashboardWidgetWithWidget[]) => void
  onRemoveWidget?: (widgetId: string) => void
  onConfigureWidget?: (widget: DashboardWidgetWithWidget) => void
}

export default function DashboardGrid({
  dashboard,
  widgets,
  isEditMode = false,
  onLayoutChange,
  onRemoveWidget,
  onConfigureWidget,
}: DashboardGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const gridInstanceRef = useRef<GridStack | null>(null)
  const [mounted, setMounted] = useState(false)

  // Initialize GridStack
  useEffect(() => {
    if (!gridRef.current || gridInstanceRef.current) return

    const grid = GridStack.init(
      {
        column: dashboard.layout_config?.column || 12,
        cellHeight: dashboard.layout_config?.cellHeight || 70,
        margin: dashboard.layout_config?.margin || 10,
        float: true,
        resizable: {
          handles: "e, se, s, sw, w",
        },
        removable: false,
        acceptWidgets: true,
        disableOneColumnMode: false,
        staticGrid: !isEditMode,
      },
      gridRef.current
    )

    gridInstanceRef.current = grid
    setMounted(true)

    // Listen to layout changes
    if (isEditMode && onLayoutChange) {
      const handleChange = () => {
        const items = grid.save(false) as any[]
        const updatedWidgets = items.map((item) => {
          const original = widgets.find((w) => w.id === item.id)
          return {
            ...original!,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          }
        })
        onLayoutChange(updatedWidgets)
      }

      grid.on("change", handleChange)

      return () => {
        grid.off("change", handleChange)
      }
    }

    return () => {
      if (grid) {
        grid.destroy(false)
        gridInstanceRef.current = null
      }
    }
  }, [])

  // Update static mode when isEditMode changes
  useEffect(() => {
    if (gridInstanceRef.current && mounted) {
      if (isEditMode) {
        gridInstanceRef.current.enable()
      } else {
        gridInstanceRef.current.disable()
      }
    }
  }, [isEditMode, mounted])

  // Add widgets to grid when they change
  useEffect(() => {
    if (!gridInstanceRef.current || !mounted) return

    const grid = gridInstanceRef.current

    // Clear existing widgets
    grid.removeAll(false)

    // Add widgets
    widgets.forEach((widget) => {
      const el = document.createElement("div")
      el.classList.add("grid-stack-item")
      el.setAttribute("gs-id", widget.id)
      el.setAttribute("gs-x", String(widget.x))
      el.setAttribute("gs-y", String(widget.y))
      el.setAttribute("gs-w", String(widget.w))
      el.setAttribute("gs-h", String(widget.h))

      if (widget.widget?.default_size) {
        if (widget.widget.default_size.minW) {
          el.setAttribute("gs-min-w", String(widget.widget.default_size.minW))
        }
        if (widget.widget.default_size.minH) {
          el.setAttribute("gs-min-h", String(widget.widget.default_size.minH))
        }
        if (widget.widget.default_size.maxW) {
          el.setAttribute("gs-max-w", String(widget.widget.default_size.maxW))
        }
        if (widget.widget.default_size.maxH) {
          el.setAttribute("gs-max-h", String(widget.widget.default_size.maxH))
        }
      }

      const content = document.createElement("div")
      content.classList.add("grid-stack-item-content")
      el.appendChild(content)

      grid.addWidget(el)
    })
  }, [widgets, mounted])

  return (
    <div className="relative w-full">
      <div ref={gridRef} className="grid-stack">
        {mounted &&
          widgets.map((widget) => (
            <div
              key={widget.id}
              className="grid-stack-item"
              gs-id={widget.id}
              gs-x={widget.x}
              gs-y={widget.y}
              gs-w={widget.w}
              gs-h={widget.h}
            >
              <div className="grid-stack-item-content">
                <WidgetWrapper
                  dashboardWidget={widget}
                  isEditMode={isEditMode}
                  onRemove={onRemoveWidget}
                  onConfigure={onConfigureWidget}
                />
              </div>
            </div>
          ))}
      </div>

      <style jsx global>{`
        .grid-stack {
          background: transparent;
        }

        .grid-stack-item {
          overflow: visible;
        }

        .grid-stack-item-content {
          overflow: hidden;
          border-radius: 0.5rem;
        }

        .grid-stack-item.grid-stack-placeholder {
          background: hsl(var(--muted)) !important;
          border: 2px dashed hsl(var(--border)) !important;
          border-radius: 0.5rem;
        }

        .grid-stack-item > .ui-resizable-handle {
          opacity: 0;
          transition: opacity 0.2s;
        }

        .grid-stack-item:hover > .ui-resizable-handle {
          opacity: 1;
        }

        .grid-stack-item-drag {
          cursor: move;
        }
      `}</style>
    </div>
  )
}
