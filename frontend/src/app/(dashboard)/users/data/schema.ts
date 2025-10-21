import { z } from "zod"
import { roleSchema } from "../roles/data/schema"
import { groupSchema } from "../groups/data/schema"

const userStatusSchema = z.union([
  z.literal("active"),
  z.literal("inactive"),
  z.literal("invited"),
  z.literal("suspended"),
])
export type UserStatus = z.infer<typeof userStatusSchema>

const userRoleSchema = z.union([
  z.literal("superadmin"),
  z.literal("admin"),
  z.literal("cashier"),
  z.literal("manager"),
])

const userSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phoneNumber: z.string(),
  status: userStatusSchema,
  role: userRoleSchema,
  createdAt: z.coerce.date(),
  lastLoginAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  roles: z.array(roleSchema).optional(),
  groups: z.array(groupSchema).optional(),
  // Nouveaux champs (nullable = accepte null, undefined)
  civility: z.string().nullish(),
  birthDate: z.string().nullish(),
  extension: z.string().nullish(),
  signature: z.string().nullish(),
})
export type User = z.infer<typeof userSchema>

export const userListSchema = z.array(userSchema)
