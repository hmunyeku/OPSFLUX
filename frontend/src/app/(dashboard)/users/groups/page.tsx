"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Group } from "./data/schema"
import { getGroups } from "./data/groups-api"

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadGroups = async () => {
      try {
        setIsLoading(true)
        const data = await getGroups(true)
        setGroups(data)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load groups:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadGroups()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-2">
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
              <BreadcrumbPage>Groupes d&apos;utilisateurs</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex-none text-xl font-bold tracking-tight">
              Groupes d&apos;utilisateurs
            </h2>
            <p className="text-sm text-muted-foreground">
              Gérez les groupes utilisateurs et leurs permissions
            </p>
          </div>
          <Button>Créer un groupe</Button>
        </div>
      </div>
      <div className="flex-1">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Groupe parent</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Aucun groupe trouvé.
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-mono text-sm">
                      {group.code}
                    </TableCell>
                    <TableCell className="font-medium">
                      {group.name}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {group.description || '-'}
                    </TableCell>
                    <TableCell>
                      {group.parent_id ? (
                        <Badge variant="secondary">Groupe enfant</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {group.permissions?.length || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {group.is_active ? (
                        <Badge variant="default" className="bg-green-500">
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactif</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
