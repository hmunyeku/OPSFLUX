"use client"

import {
  IconAnalyze,
  IconFileReport,
  IconNotification,
  IconSettings2,
} from "@tabler/icons-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Header } from "@/components/layout/header"
import { useTranslation } from "@/hooks/use-translation"
import Analytics from "./boards/analytics"
import Overview from "./boards/overview"
import Dashboard1Actions from "./components/dashboard-1-actions"

export default function Dashboard1Page() {
  const { t } = useTranslation("core.dashboard")

  return (
    <>
      <Header />

      <div className="space-y-4 p-4">
        <div className="mb-2 flex flex-col items-start justify-between space-y-2 md:flex-row md:items-center">
          <h1 className="text-2xl font-bold tracking-tight">{t("page.title")}</h1>
          <Dashboard1Actions />
        </div>
        <Tabs
          orientation="vertical"
          defaultValue="overview"
          className="space-y-4"
        >
          <div className="w-full overflow-x-auto pb-2">
            <TabsList>
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <IconSettings2 size={14} />
                {t("widgets.overview")}
              </TabsTrigger>
              <TabsTrigger
                value="analytics"
                className="flex items-center gap-2"
              >
                <IconAnalyze size={16} />
                {t("widgets.analytics")}
              </TabsTrigger>
              <TabsTrigger
                value="reports"
                className="flex items-center gap-2"
                disabled
              >
                <IconFileReport size={16} />
                {t("widgets.reports")}
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="flex items-center gap-2"
                disabled
              >
                <IconNotification size={16} />
                {t("widgets.notifications")}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview" className="space-y-4">
            <Overview />
          </TabsContent>
          <TabsContent value="analytics" className="space-y-4">
            <Analytics />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
