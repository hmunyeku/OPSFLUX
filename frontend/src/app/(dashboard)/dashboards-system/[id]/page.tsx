/**
 * Dashboard System - View Page
 * Page pour afficher un dashboard personnalisable
 */

import { DashboardViewer } from "@/components/dashboard-system";

interface DashboardPageProps {
  params: {
    id: string;
  };
}

export default function DashboardPage({ params }: DashboardPageProps) {
  return (
    <div className="container mx-auto p-6">
      <DashboardViewer
        dashboardId={params.id}
        onEdit={() => {
          // TODO: Rediriger vers la page d'édition
          window.location.href = `/dashboards-system/${params.id}/edit`;
        }}
      />
    </div>
  );
}

export async function generateMetadata({ params }: DashboardPageProps) {
  return {
    title: `Dashboard | OpsFlux`,
    description: "Dashboard personnalisable OpsFlux",
  };
}
