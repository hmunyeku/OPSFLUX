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
        cellHeight: dashboard.layout_config?.cellHeight || 100,
        margin: dashboard.layout_config?.margin || 12,
        float: true,
        resizable: {
          handles: "e, se, s, sw, w",
        },
        removable: false,
        acceptWidgets: true,
        disableOneColumnMode: false,
        staticGrid: !isEditMode,
        animate: true,
        // Auto height - let grid expand to fit all widgets
        minRow: 0,
        // Remove height constraint to allow vertical expansion
      },
      gridRef.current
    )

    gridInstanceRef.current = grid
    setMounted(true)

    // Listen to layout changes
    const handleChange = () => {
      if (!onLayoutChange) return

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

    if (isEditMode && onLayoutChange) {
      grid.on("change", handleChange)
    }

    return () => {
      if (grid) {
        grid.off("change", handleChange)
        grid.destroy(false)
        gridInstanceRef.current = null
      }
    }
  }, [isEditMode, onLayoutChange])

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

    // GridStack already has the widgets in the DOM from the JSX render below
    // So we just need to make them grid items without calling makeWidget
    // The widgets are already rendered by React in the JSX
    // GridStack will pick them up automatically from the DOM
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
          min-height: 400px;
          height: auto !important;
        }

        .grid-stack-item {
          overflow: visible;
        }

        .grid-stack-item-content {
          overflow: hidden;
          border-radius: 0.75rem;
          inset: 0;
          position: absolute;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          transition: box-shadow 0.2s ease;
        }

        .grid-stack-item:hover .grid-stack-item-content {
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .grid-stack-item.grid-stack-placeholder {
          background: hsl(var(--muted)) !important;
          border: 2px dashed hsl(var(--primary) / 0.5) !important;
          border-radius: 0.75rem;
          opacity: 0.6;
        }

        .grid-stack-item > .ui-resizable-handle {
          opacity: 0;
          transition: opacity 0.2s ease;
          z-index: 10;
        }

        .grid-stack-item:hover > .ui-resizable-handle {
          opacity: 0.7;
        }

        .grid-stack-item > .ui-resizable-se,
        .grid-stack-item > .ui-resizable-sw {
          bottom: 0;
          width: 20px;
          height: 20px;
        }

        .grid-stack-item > .ui-resizable-se::after,
        .grid-stack-item > .ui-resizable-sw::after {
          content: "";
          position: absolute;
          bottom: 4px;
          width: 12px;
          height: 12px;
          border-bottom: 2px solid hsl(var(--primary));
          border-right: 2px solid hsl(var(--primary));
          transform: rotate(-45deg);
          right: 4px;
        }

        .grid-stack-item > .ui-resizable-sw::after {
          border-right: none;
          border-left: 2px solid hsl(var(--primary));
          transform: rotate(45deg);
          left: 4px;
          right: auto;
        }

        .grid-stack-item-drag {
          cursor: move;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .grid-stack-item-content {
            border-radius: 0.5rem;
          }
        }
      `}</style>
    </div>
  )
}
