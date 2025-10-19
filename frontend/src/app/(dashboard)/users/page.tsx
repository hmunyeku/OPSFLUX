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
import { PermissionGuard } from "@/components/permission-guard"
import { UsersSection } from "./components/users-section"
import { useTranslation } from "@/hooks/use-translation"

export default function UsersPage() {
  const { t } = useTranslation("core.users")

  return (
    <PermissionGuard permission="users.read">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/">{t("breadcrumb.home", "Accueil")}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{t("breadcrumb.users", "Utilisateurs")}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <h2 className="text-2xl font-bold tracking-tight">{t("page.description", "Description")}</h2>
        </div>

        <UsersSection />
      </div>
    </PermissionGuard>
  )
}
