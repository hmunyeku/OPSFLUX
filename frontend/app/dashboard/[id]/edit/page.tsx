import { DashboardBuilderContent } from "@/components/dashboard/dashboard-builder-content"

export default function EditDashboardPage({ params }: { params: { id: string } }) {
  return <DashboardBuilderContent dashboardId={params.id} />
}
