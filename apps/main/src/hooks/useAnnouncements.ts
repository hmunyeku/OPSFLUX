/**
 * Announcement hooks — query + mutations for announcements.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { announcementService, type AnnouncementCreate, type AnnouncementUpdate } from '@/services/announcementService'

export function useAnnouncements(params: { page?: number; page_size?: number; active_only?: boolean } = {}) {
  return useQuery({
    queryKey: ['announcements', params],
    queryFn: () => announcementService.list(params),
  })
}

export function useActiveAnnouncements() {
  return useQuery({
    queryKey: ['announcements', 'active'],
    queryFn: () => announcementService.list({ active_only: true, page_size: 50 }),
    staleTime: 60_000, // 1 minute
  })
}

export function useCreateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AnnouncementCreate) => announcementService.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  })
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AnnouncementUpdate }) => announcementService.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => announcementService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  })
}

export function useDismissAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => announcementService.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  })
}
