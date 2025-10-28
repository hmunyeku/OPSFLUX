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

export const permissionListSchema = z.array(permissionSchema)
