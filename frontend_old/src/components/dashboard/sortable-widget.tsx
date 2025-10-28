"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { DashboardWidgetWithWidget } from "@/types/dashboard"
import WidgetWrapper from "@/widgets/base/widget-wrapper"
import { cn } from "@/lib/utils"
import { IconGripVertical } from "@tabler/icons-react"

interface SortableWidgetProps {
  widget: DashboardWidgetWithWidget
  className?: string
  style?: React.CSSProperties
  isEditMode?: boolean
  onRemove?: (widgetId: string) => void
  onConfigure?: (widget: DashboardWidgetWithWidget) => void
}

export function SortableWidget({
  widget,
  className,
  style,
  isEditMode,
  onRemove,
  onConfigure,
}: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id })

  const transformStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  if (!isEditMode) {
    return (
      <div className={cn("relative", className)} style={style}>
        <WidgetWrapper
          dashboardWidget={widget}
          isEditMode={false}
        />
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative group",
        isDragging && "opacity-50 z-50",
        className
      )}
      style={{ ...style, ...transformStyle }}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "absolute -top-2 left-1/2 -translate-x-1/2 z-10",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "cursor-move"
        )}
      >
        <div className="bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg">
          <IconGripVertical className="h-4 w-4" />
        </div>
      </div>

      {/* Widget content */}
      <div className={cn(
        "h-full transition-all",
        isEditMode && "ring-2 ring-transparent group-hover:ring-primary/50 rounded-xl"
      )}>
        <WidgetWrapper
          dashboardWidget={widget}
          isEditMode={isEditMode}
          onRemove={onRemove}
          onConfigure={onConfigure}
        />
      </div>
    </div>
  )
}
