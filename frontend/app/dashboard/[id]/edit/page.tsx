import { DashboardBuilderContent } from "@/components/dashboard/dashboard-builder-content"
import { use } from "react"

export default function EditDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <DashboardBuilderContent dashboardId={id} />
}
