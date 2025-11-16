"use client"

import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Zap, TrendingUp, Activity } from "lucide-react"

const mockConsumption = {
  current: 2450,
  capacity: 3000,
  peak: 2780,
  average: 2200,
}

export function CurrentConsumptionContent() {
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10">
              <Zap className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Consommation Actuelle</p>
              <p className="text-lg font-bold">{mockConsumption.current} kW</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-500/10">
              <Activity className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Capacité Totale</p>
              <p className="text-lg font-bold">{mockConsumption.capacity} kW</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/10">
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Pic Journalier</p>
              <p className="text-lg font-bold">{mockConsumption.peak} kW</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-500/10">
              <Activity className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Moyenne 24h</p>
              <p className="text-lg font-bold">{mockConsumption.average} kW</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-3">
        <h3 className="mb-2 text-xs font-semibold">Taux d'Utilisation</h3>
        <div className="space-y-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Charge Actuelle</span>
              <span className="font-medium">
                {((mockConsumption.current / mockConsumption.capacity) * 100).toFixed(1)}%
              </span>
            </div>
            <Progress value={(mockConsumption.current / mockConsumption.capacity) * 100} className="h-2" />
          </div>
        </div>
      </Card>
    </div>
  )
}
