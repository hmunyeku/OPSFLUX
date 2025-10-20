"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"

interface Props {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: Props) {
  const [defaultClose, setDefaultClose] = useState(false)

  useEffect(() => {
    // Read sidebar state from cookie on client side
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';')
      const sidebarCookie = cookies.find(c => c.trim().startsWith('sidebar_state='))
      if (sidebarCookie) {
        const value = sidebarCookie.split('=')[1]
        setDefaultClose(value === 'false')
      }
    }
  }, [])

  return (
    <div className="border-grid flex flex-1 flex-col">
      <SidebarProvider defaultOpen={!defaultClose}>
        <AppSidebar />
        <div
          id="content"
          className={cn(
            "flex h-full w-full flex-col",
            "has-[div[data-layout=fixed]]:h-svh",
            "group-data-[scroll-locked=1]/body:h-full",
            "has-[data-layout=fixed]:group-data-[scroll-locked=1]/body:h-svh"
          )}
        >
          {children}
        </div>
      </SidebarProvider>
    </div>
  )
}
