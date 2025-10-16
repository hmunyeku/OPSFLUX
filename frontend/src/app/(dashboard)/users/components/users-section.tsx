"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { UserPrimaryActions } from "./user-primary-actions"
import { columns } from "./users-columns"
import { UsersStats } from "./users-stats"
import { UsersTable } from "./users-table"
import { userListSchema, User } from "../data/schema"
import { getUsers } from "../data/users-api"

export function UsersSection() {
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
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Liste des utilisateurs</h3>
          <p className="text-sm text-muted-foreground">
            Gérez les comptes utilisateurs de votre organisation
          </p>
        </div>
        <UserPrimaryActions onUserCreated={loadUsers} />
      </div>

      <UsersStats users={users} />

      <UsersTable data={users} columns={columns} />
    </>
  )
}
