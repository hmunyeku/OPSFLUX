import { z } from "zod"

// Schéma pour une condition de hook
export const hookConditionSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.object({
      ">=": z.number().optional(),
      ">": z.number().optional(),
      "<=": z.number().optional(),
      "<": z.number().optional(),
      "!=": z.union([z.string(), z.number(), z.boolean()]).optional(),
      in: z.array(z.union([z.string(), z.number()])).optional(),
      not_in: z.array(z.union([z.string(), z.number()])).optional(),
    })
  ])
)

// Schéma pour une action de hook
export const hookActionSchema = z.object({
  type: z.enum(["send_notification", "send_email", "call_webhook", "execute_code", "create_task"]),
  config: z.record(z.string(), z.any()),
})

// Schéma principal pour un hook
export const hookSchema = z.object({
  id: z.string(),
  name: z.string(),
  event: z.string(),
  is_active: z.boolean(),
  priority: z.number(),
  description: z.string().nullable(),
  conditions: hookConditionSchema.nullable(),
  actions: z.array(hookActionSchema),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
})

export type Hook = z.infer<typeof hookSchema>
export type HookAction = z.infer<typeof hookActionSchema>
export type HookCondition = z.infer<typeof hookConditionSchema>

// Schéma pour l'exécution d'un hook
export const hookExecutionSchema = z.object({
  id: z.string(),
  hook_id: z.string(),
  success: z.boolean(),
  duration_ms: z.number(),
  error_message: z.string().nullable(),
  event_context: z.record(z.string(), z.any()),
  created_at: z.string().nullable(),
})

export type HookExecution = z.infer<typeof hookExecutionSchema>
