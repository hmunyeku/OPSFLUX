import { type PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateProjectTask } from '@/hooks/useProjets'
import { projetsService } from '@/services/projetsService'
import type { ProjectTask } from '@/types/api'

vi.mock('@/services/projetsService', () => ({
  projetsService: {
    updateTask: vi.fn(),
  },
}))

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useUpdateProjectTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('optimistically patches all-project-tasks so task detail refreshes without a page reload', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const projectId = 'project-1'
    const taskId = 'task-1'
    const params = { page: 1, page_size: 500, project_id: projectId }
    const task = {
      id: taskId,
      title: 'Task with POB',
      start_date: '2026-05-01',
      due_date: '2026-05-03',
      pob_quota: 2,
      pob_quota_mode: 'constant',
      pob_quota_daily: null,
    } as ProjectTask
    const payload = {
      pob_quota_mode: 'variable' as const,
      pob_quota_daily: { J1: 2, J2: 2, J3: 2 },
    }

    queryClient.setQueryData(['project-tasks', projectId], [task])
    queryClient.setQueryData(['all-project-tasks', params], {
      items: [task],
      total: 1,
      page: 1,
      page_size: 500,
    })

    let resolveUpdate: (value: ProjectTask) => void = () => {}
    vi.mocked(projetsService.updateTask).mockImplementation(
      () => new Promise<ProjectTask>((resolve) => { resolveUpdate = resolve }),
    )

    const { result } = renderHook(() => useUpdateProjectTask(), {
      wrapper: createWrapper(queryClient),
    })

    let mutation: Promise<ProjectTask>
    act(() => {
      mutation = result.current.mutateAsync({ projectId, taskId, payload })
    })

    await waitFor(() => {
      const paged = queryClient.getQueryData<{ items: ProjectTask[] }>(['all-project-tasks', params])
      expect(paged?.items[0]?.pob_quota_mode).toBe('variable')
      expect(paged?.items[0]?.pob_quota_daily).toEqual(payload.pob_quota_daily)
    })

    resolveUpdate({ ...task, ...payload })
    await act(async () => {
      await mutation
    })
  })
})
