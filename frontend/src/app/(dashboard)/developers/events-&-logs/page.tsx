"use client"

import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useTranslation } from "@/hooks/use-translation"
import ImportDialog from "./components/import-dialog"
import Logs from "./components/logs"
import Referrers from "./components/referrers"
import RouteView from "./components/route-view"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"

export default function EventsAndLogsPage() {
  return (
    <PermissionGuard permission="core.audit.read">
      <EventsAndLogsPageContent />
    </PermissionGuard>
  )
}

function EventsAndLogsPageContent() {
  const { t } = useTranslation("core.developers")
  const { hasPermission } = usePermissions()

  return (
    <>
      <div className="flex w-full flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{t("breadcrumb.home")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("breadcrumb.developers")}</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("logs.title")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t("logs.title")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("logs.description")}
            </p>
          </div>
          <ImportDialog disabled={!hasPermission("core.audit.configure")} />
        </div>
      </div>

      <div className="mt-6 mb-4 grid grid-cols-6 gap-5">
        <div className="col-span-6">
          <Logs />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <RouteView />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <Referrers />
        </div>
      </div>
    </>
  )
}
