import { DashboardViewer } from "@/components/dashboard/dashboard-viewer"

export default function DashboardPage({
  params,
}: {
  params: { id: string }
}) {
  return <DashboardViewer dashboardId={params.id} />
}
