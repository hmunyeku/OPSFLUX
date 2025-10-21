import { Task } from "./schema"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.opsflux.io'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTaskFromBackend(task: any): Task {
  return {
    id: task.id,
    title: task.title,
    status: task.status as Task['status'],
    label: task.label as Task['label'],
    priority: task.priority as Task['priority'],
    createdDate: new Date(task.created_at || new Date()),
    dueDate: task.due_date ? new Date(task.due_date) : new Date(),
    estimatedTime: task.estimated_time || '',
    sprintCycle: task.sprint_cycle || '',
  }
}

export async function getTasks(): Promise<Task[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/tasks?skip=0&limit=1000`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.statusText}`)
    }

    const data = await response.json()
    return (data.data || []).map(mapTaskFromBackend)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching tasks:', error)
    return []
  }
}

export async function getTask(id: string): Promise<Task | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/tasks/${id}`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch task: ${response.statusText}`)
    }

    const task = await response.json()
    return mapTaskFromBackend(task)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching task:', error)
    return null
  }
}

export interface CreateTaskInput {
  title: string
  status?: string
  label?: string
  priority?: string
  due_date?: string
  estimated_time?: string
  sprint_cycle?: string
  user_id?: string
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const response = await fetch(`${API_URL}/api/v1/tasks/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create task')
  }

  const task = await response.json()
  return mapTaskFromBackend(task)
}

export interface UpdateTaskInput {
  title?: string
  status?: string
  label?: string
  priority?: string
  due_date?: string
  estimated_time?: string
  sprint_cycle?: string
  user_id?: string
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const response = await fetch(`${API_URL}/api/v1/tasks/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update task')
  }

  const task = await response.json()
  return mapTaskFromBackend(task)
}

export async function deleteTask(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/tasks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete task')
  }
}
