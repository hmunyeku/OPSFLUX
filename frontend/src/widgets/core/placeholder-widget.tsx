"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    <Card className="h-full flex flex-col items-center justify-center border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground">
          <IconCube className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground text-center">
          Widget type: <code className="text-xs bg-muted px-1 py-0.5 rounded">{widget_type}</code>
        </p>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Ce widget n'est pas encore implémenté
        </p>
      </CardContent>
    </Card>
  )
}
