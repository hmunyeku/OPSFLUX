"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Users2 } from "lucide-react"
import { UsersSection } from "./components/users-section"
import { GroupsSection } from "./components/groups-section"

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState("users")

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Accueil</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Utilisateurs & Groupes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div>
          <h2 className="text-2xl font-bold tracking-tight">Utilisateurs & Groupes</h2>
          <p className="text-sm text-muted-foreground">
            Gérez les utilisateurs et les groupes de votre organisation
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Utilisateurs
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            Groupes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <UsersSection />
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <GroupsSection />
        </TabsContent>
      </Tabs>
    </>
  )
}
