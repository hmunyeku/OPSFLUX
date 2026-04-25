import api from '@/lib/api'

export interface ModuleState {
  slug: string
  name: string
  version: string
  depends_on: string[]
  enabled: boolean
  is_protected: boolean
  missing_dependencies: string[]
  active_dependents: string[]
  can_enable: boolean
  can_disable: boolean
}

export const modulesService = {
  list: async (): Promise<ModuleState[]> => {
    const { data } = await api.get('/api/v1/modules')
    return data
  },
  update: async (slug: string, enabled: boolean): Promise<ModuleState> => {
    const { data } = await api.put(`/api/v1/modules/${slug}`, { enabled })
    return data
  },
}
