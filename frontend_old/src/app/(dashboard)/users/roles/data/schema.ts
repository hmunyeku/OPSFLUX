import { z } from "zod"

export const permissionSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  module: z.string(),
  is_default: z.boolean(),
  is_active: z.boolean(),
})

export type Permission = z.infer<typeof permissionSchema>

export const roleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  is_system: z.boolean(),
  is_active: z.boolean(),
  priority: z.number(),
  permissions: z.array(permissionSchema).optional(),
})

export type Role = z.infer<typeof roleSchema>

export const roleListSchema = z.array(roleSchema)
