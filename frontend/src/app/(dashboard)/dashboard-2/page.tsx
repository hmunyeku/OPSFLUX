"use client"

import { useTranslation } from "@/hooks/use-translation"
import { Header } from "@/components/layout/header"
import { lazyLoadComponent, ChartFallback } from "@/lib/lazy-load"
import Dashboard2Actions from "./components/dashboard-2-actions"
import RecentActivity from "./components/recent-activity"
import Stats from "./components/stats"

// Lazy load des charts pour optimiser les performances
const RevenueChart = lazyLoadComponent(
  () => import("./components/revenue-chart"),
  <ChartFallback />
)

const Visitors = lazyLoadComponent(
  () => import("./components/visitors"),
  <ChartFallback />
)

export default function Dashboard2Page() {
  const { t } = useTranslation("core.dashboard")

  return (
    <>
      <Header />

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col items-start justify-between gap-2 md:flex-row">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("page.title", "Titre")}</h2>
            <p className="text-muted-foreground">
              {t("page.description", "Description")}
            </p>
          </div>
          <Dashboard2Actions />
        </div>

        <div className="grid grid-cols-6 gap-5 lg:grid-cols-12">
          <Stats />
          <div className="col-span-6">
            <RevenueChart />
          </div>
          <div className="col-span-6 lg:col-span-8">
            <RecentActivity />
          </div>
          <div className="col-span-6 lg:col-span-4">
            <Visitors />
          </div>
        </div>
      </div>
    </>
  )
}
