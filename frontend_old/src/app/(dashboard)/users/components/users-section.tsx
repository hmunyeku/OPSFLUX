"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { getColumns } from "./users-columns"
import { UsersStats } from "./users-stats"
import { UsersTable } from "./users-table"
import { userListSchema, User } from "../data/schema"
import { getUsers } from "../data/users-api"
import { useTranslation } from "@/hooks/use-translation"

export function UsersSection() {
  const { t } = useTranslation("core.users")
  const columns = getColumns(t)
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      const data = await getUsers()
      const userList = userListSchema.parse(data)
      setUsers(userList)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40 ml-auto" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <UsersStats users={users} />

      <UsersTable data={users} columns={columns} onUserCreated={loadUsers} />
    </div>
  )
}
