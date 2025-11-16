"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Plus, Sparkles } from "lucide-react"

const mockAudits = [
  { id: "1", zone: "Platform Alpha - Deck A", score: 85, date: "2025-01-20", status: "completed" },
  { id: "2", zone: "Workshop Area", score: 72, date: "2025-01-22", status: "completed" },
  { id: "3", zone: "Storage Zone B", score: 90, date: "2025-01-25", status: "completed" },
]

export function AuditsContent() {
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex justify-end">
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3 w-3" />
          Nouvel audit 5S
        </Button>
      </div>
      <div className="flex-1 overflow-auto space-y-1">
        {mockAudits.map((audit) => (
          <Card key={audit.id} className="p-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold">{audit.zone}</h3>
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                    {audit.status}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">{new Date(audit.date).toLocaleDateString("fr-FR")}</p>
              </div>
              <div className="w-32">
                <div className="mb-0.5 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Score</span>
                  <span className="font-bold text-lg">{audit.score}%</span>
                </div>
                <Progress value={audit.score} className="h-1.5" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
