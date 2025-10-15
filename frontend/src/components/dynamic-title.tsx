"use client"

import { useEffect } from "react"
import { useAppConfig } from "@/contexts/app-config-context"

export function DynamicTitle() {
  const { config } = useAppConfig()

  useEffect(() => {
    // Update document title when config changes
    document.title = config.app_name || "OpsFlux"
  }, [config.app_name])

  // This component doesn't render anything
  return null
}
