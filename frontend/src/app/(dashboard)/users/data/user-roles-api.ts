import { auth } from "@/lib/auth"

export interface UserRole {
  id: string
  name: string
  code: string
  description: string | null
  is_system: boolean
}

export interface UserRolesResponse {
  count: number
  data: UserRole[]
}

export async function getUserRoles(userId: string): Promise<UserRolesResponse> {
  const token = auth.getToken()

  if (!token) {
    throw new Error('No authentication token')
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${userId}/roles`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch user roles')
  }

  return response.json()
}
