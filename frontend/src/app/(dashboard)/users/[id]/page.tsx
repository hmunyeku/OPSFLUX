"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { PermissionGuard } from "@/components/permission-guard"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Skeleton } from "@/components/ui/skeleton"
import { userListSchema, User } from "../data/schema"
import { getUsers } from "../data/users-api"
import { UserDetailForm } from "./components/user-detail-form"
import { UserPermissionsCard } from "./components/user-permissions-card"

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        setIsLoading(true)
        const data = await getUsers()
        const userList = userListSchema.parse(data)
        const foundUser = userList.find((u) => u.id === id)

        if (!foundUser) {
          router.push('/users')
          return
        }

        setUser(foundUser)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load user:', error)
        router.push('/users')
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [id, router])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <PermissionGuard permission="users.read">
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
            <BreadcrumbPage>Détails</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mt-4 space-y-1">
        <div className="flex flex-wrap gap-2">
          <h1 className="text-lg font-bold">
            Détails utilisateur: {`${user.firstName} ${user.lastName}`}
          </h1>
          <Badge variant="outline" className="text-muted-foreground">
            {user.id}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Informations complètes sur l&apos;utilisateur, incluant les détails, le rôle, le statut et les options de gestion.
        </p>
      </div>

      <div className="mt-4 space-y-6">
        <UserDetailForm user={user} />
        <UserPermissionsCard userId={user.id} />
      </div>
    </PermissionGuard>
  )
}
