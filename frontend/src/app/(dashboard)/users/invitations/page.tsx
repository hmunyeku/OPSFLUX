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
import { InvitationsSection } from "./components/invitations-section"

export default function InvitationsPage() {
  return (
    <PermissionGuard permission="users.invite">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/">Accueil</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/users">Utilisateurs</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Invitations</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <h2 className="text-2xl font-bold tracking-tight">Invitations d'utilisateurs</h2>
          <p className="text-muted-foreground">
            Gérez les invitations d'utilisateurs en attente et invitez de nouveaux membres à rejoindre votre équipe.
          </p>
        </div>

        <InvitationsSection />
      </div>
    </PermissionGuard>
  )
}
