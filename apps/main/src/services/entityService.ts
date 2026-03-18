/**
 * Entity API service — entity listing and switching.
 */
import api from '@/lib/api'

export interface EntityBrief {
  id: string
  code: string
  name: string
  country: string | null
  timezone: string
}

export const entityService = {
  getMyEntities: async (): Promise<EntityBrief[]> => {
    const { data } = await api.get('/api/v1/auth/me/entities')
    return data
  },

  switchEntity: async (entityId: string): Promise<void> => {
    await api.patch('/api/v1/auth/me/entity', { entity_id: entityId })
  },
}
