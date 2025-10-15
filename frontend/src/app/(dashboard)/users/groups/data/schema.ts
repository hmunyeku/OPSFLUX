import { z } from "zod"
import { permissionSchema } from "../../permissions/data/schema"

export const groupSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  parent_id: z.string().nullable(),
  is_active: z.boolean(),
  permissions: z.array(permissionSchema).optional(),
})

export type Group = z.infer<typeof groupSchema>

export const groupListSchema = z.array(groupSchema)
