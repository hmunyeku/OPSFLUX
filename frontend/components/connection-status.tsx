"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useServerStatus, type ServerStatus } from "@/hooks/use-server-status"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const statusConfig: Record<
  ServerStatus,
  {
    label: string
    color: string
    bgColor: string
    description: string
  }
> = {
  connected: {
    label: "Connecté",
    color: "bg-green-500",
    bgColor: "bg-green-500/10",
    description: "Connexion au serveur établie",
  },
  connecting: {
    label: "Connexion...",
    color: "bg-orange-500",
    bgColor: "bg-orange-500/10",
    description: "Vérification de la connexion au serveur",
  },
  disconnected: {
    label: "Déconnecté",
    color: "bg-red-500",
    bgColor: "bg-red-500/10",
    description: "Serveur inaccessible",
  },
}

export function ConnectionStatus() {
  const { status, lastCheck, latency } = useServerStatus()
  const config = statusConfig[status]

  const getTooltipContent = () => {
    const parts = [config.description]

    if (lastCheck) {
      const timeSince = Math.floor((Date.now() - lastCheck.getTime()) / 1000)
      if (timeSince < 60) {
        parts.push(`Dernière vérification: il y a ${timeSince}s`)
      } else {
        parts.push(`Dernière vérification: il y a ${Math.floor(timeSince / 60)}min`)
      }
    }

    if (latency !== null) {
      parts.push(`Latence: ${latency}ms`)
    }

    return parts.join("\n")
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={cn("text-[10px] h-5 gap-1.5 cursor-help", config.bgColor)}
          >
            <span
              className={cn(
                "relative flex h-2 w-2 rounded-full",
                config.color
              )}
            >
              {status === "connected" && (
                <span
                  className={cn(
                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                    config.color
                  )}
                />
              )}
              <span
                className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  config.color
                )}
              />
            </span>
            <span className="hidden sm:inline">{config.label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs whitespace-pre-line">
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
