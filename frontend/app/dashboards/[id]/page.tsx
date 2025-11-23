import { DashboardViewer } from "@/components/dashboard/dashboard-viewer"
import { use } from "react"

export default function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <DashboardViewer dashboardId={id} />
}
