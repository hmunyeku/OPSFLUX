import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import ImportDialog from "./components/import-dialog"
import Logs from "./components/logs"
import Referrers from "./components/referrers"
import RouteView from "./components/route-view"

export default function EventsAndLogsPage() {
  return (
    <>
      <div className="flex w-full flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Accueil</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Développeurs</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Événements et journaux</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Événements et journaux</h2>
            <p className="text-muted-foreground text-sm">
              Suivez, analysez et agissez sur les comportements de l&apos;application de manière efficace.
            </p>
          </div>
          <ImportDialog />
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
