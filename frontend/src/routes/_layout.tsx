import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { Layout } from "@/components/layout/layout"
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
    <Layout>
      <Outlet />
    </Layout>
  )
}
