import { User } from "./schema"

export async function getUsers(): Promise<User[]> {
  try {
    const token = localStorage.getItem('access_token')
    if (!token) {
      throw new Error('No access token found')
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/?skip=0&limit=1000`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`)
    }

    const data = await response.json()

    // Transformer les données du backend vers le format attendu par le frontend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.data || []).map((user: any) => ({
      id: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      email: user.email,
      phoneNumber: user.phone_numbers?.[0] || '',
      // Mapper is_active vers les statuts du frontend
      status: user.is_active ? 'active' : 'inactive',
      // Pour l'instant, mapper is_superuser vers les rôles
      role: user.is_superuser ? 'superadmin' : 'admin',
      createdAt: user.created_at ? new Date(user.created_at) : new Date(),
      lastLoginAt: user.updated_at ? new Date(user.updated_at) : new Date(),
      updatedAt: user.updated_at ? new Date(user.updated_at) : new Date(),
    }))
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching users:', error)
    return []
  }
}
