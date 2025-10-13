import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { isLoggedIn } from "@/hooks/useAuth"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Header } from "@/components/layout/header"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_layout")({
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <div className="border-grid flex flex-1 flex-col">
      <SidebarProvider defaultOpen={true}>
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
          <Header />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </SidebarProvider>
    </div>
  )
}
