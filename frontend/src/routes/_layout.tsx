import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { AppShell } from "@/components/layout/app-shell"
import { isLoggedIn } from "@/hooks/useAuth"

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
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
