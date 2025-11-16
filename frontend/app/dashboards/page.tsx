import { redirect } from "next/navigation"

// Redirect to gallery page which already lists all dashboards
export default function DashboardsListPage() {
  redirect("/gallery")
}
