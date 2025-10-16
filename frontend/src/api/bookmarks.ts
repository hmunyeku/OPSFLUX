const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function getAuthHeaders() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    throw new Error('No access token found')
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export interface Bookmark {
  id: string
  title: string
  path: string
  icon?: string
  category?: string
  position: number
  user_id: string
}

export interface CreateBookmarkInput {
  title: string
  path: string
  icon?: string
  category?: string
}

export interface UpdateBookmarkInput {
  title?: string
  path?: string
  icon?: string
  category?: string
  position?: number
}

export async function getBookmarks(): Promise<Bookmark[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/bookmarks/`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch bookmarks: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data || []
  } catch (_error) {
    // Error fetching bookmarks - return empty array
    return []
  }
}

export async function createBookmark(input: CreateBookmarkInput): Promise<Bookmark> {
  const response = await fetch(`${API_URL}/api/v1/bookmarks/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create bookmark')
  }

  return response.json()
}

export async function updateBookmark(id: string, input: UpdateBookmarkInput): Promise<Bookmark> {
  const response = await fetch(`${API_URL}/api/v1/bookmarks/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update bookmark')
  }

  return response.json()
}

export async function deleteBookmark(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/bookmarks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete bookmark')
  }
}

export async function deleteAllBookmarks(): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/bookmarks/all`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete all bookmarks')
  }
}

export async function reorderBookmarks(bookmarkIds: string[]): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/bookmarks/reorder`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(bookmarkIds),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to reorder bookmarks')
  }
}
