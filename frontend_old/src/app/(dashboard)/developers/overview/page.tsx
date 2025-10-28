"use client"

import Link from "next/link"
import { useTranslation } from "@/hooks/use-translation"
import { nofitySubmittedValues } from "@/lib/notify-submitted-values"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { DateRangePicker } from "@/components/date-range-picker"
import { lazyLoadComponent, ChartFallback } from "@/lib/lazy-load"
import RecentActivity from "./components/recent-activity"

// Lazy load des composants charts pour meilleures performances
const ApiRequestsChart = lazyLoadComponent(
  () => import("./components/api-requests-chart").then(m => ({ default: m.ApiRequestsChart })),
  <ChartFallback />
)

const ApiResponseTimeChart = lazyLoadComponent(
  () => import("./components/api-response-time-chart").then(m => ({ default: m.ApiResponseTimeChart })),
  <ChartFallback />
)

const TotalVisitorsChart = lazyLoadComponent(
  () => import("./components/total-visitors-chart").then(m => ({ default: m.TotalVisitorsChart })),
  <ChartFallback />
)

export default function OverviewPage() {
  const { t } = useTranslation("core.developers")
  const tCommon = useTranslation("core.common").t

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <div className="flex w-full flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{tCommon("breadcrumb.home")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("breadcrumb.developers", "Développeurs")}</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("overview.breadcrumb", "Breadcrumb")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("overview.title", "Title")}</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {t("overview.description", "Description")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Select>
              <SelectTrigger className="w-full gap-2 text-xs sm:w-fit sm:text-sm">
                <SelectValue placeholder="Serveur" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Serveur</SelectLabel>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="development">Développement</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <DateRangePicker
              onUpdate={(values) => nofitySubmittedValues(values)}
              initialDateFrom="2023-01-01"
              initialDateTo="2023-12-31"
              align="start"
              locale="en-GB"
              showCompare={false}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:gap-6">
        <div className="flex basis-2/3 flex-col gap-3 lg:gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 lg:gap-6">
            <ApiRequestsChart className="flex-1" />
            <Separator className="sm:hidden" />
            <ApiResponseTimeChart className="flex-1" />
          </div>
          <Separator />
          <TotalVisitorsChart className="col-span-2" />
        </div>
        <Separator className="lg:hidden" />
        <div className="flex flex-1 flex-col">
          <RecentActivity />
        </div>
      </div>
    </div>
  )
}
