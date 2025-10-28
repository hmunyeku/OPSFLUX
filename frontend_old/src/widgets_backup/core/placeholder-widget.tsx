"use client"

import { IconCube } from "@tabler/icons-react"

interface PlaceholderWidgetProps {
  config: {
    widget_type?: string
    title?: string
  }
}

export default function PlaceholderWidget({ config }: PlaceholderWidgetProps) {
  const { widget_type = "unknown", title = "Widget" } = config

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="flex items-center gap-2 text-muted-foreground mb-4">
        <IconCube className="h-5 w-5" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground text-center">
        Widget type: <code className="text-xs bg-muted px-1 py-0.5 rounded">{widget_type}</code>
      </p>
      <p className="text-xs text-muted-foreground text-center mt-2">
        Ce widget n'est pas encore implémenté
      </p>
    </div>
  )
}
