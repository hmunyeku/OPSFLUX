import { z } from "zod"

// ==================== LANGUAGES ====================

export const languageSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  native_name: z.string().nullable(),
  direction: z.enum(["ltr", "rtl"]).default("ltr"),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  display_order: z.number().default(0),
  flag_emoji: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
})

export type Language = z.infer<typeof languageSchema>

export const languageCreateSchema = z.object({
  code: z.string().min(2).max(10),
  name: z.string().min(1).max(100),
  native_name: z.string().nullable().optional(),
  direction: z.enum(["ltr", "rtl"]).default("ltr"),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  display_order: z.number().default(0),
  flag_emoji: z.string().nullable().optional(),
})

export type LanguageCreate = z.infer<typeof languageCreateSchema>

// ==================== NAMESPACES ====================

export const namespaceSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  namespace_type: z.enum(["core", "module"]),
  module_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
})

export type TranslationNamespace = z.infer<typeof namespaceSchema>

export const namespaceCreateSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  namespace_type: z.enum(["core", "module"]),
  module_id: z.string().uuid().nullable().optional(),
})

export type NamespaceCreate = z.infer<typeof namespaceCreateSchema>

// ==================== TRANSLATIONS ====================

export const translationSchema = z.object({
  id: z.string().uuid(),
  namespace_id: z.string().uuid(),
  language_id: z.string().uuid(),
  key: z.string(),
  value: z.string(),
  description: z.string().nullable(),
  is_verified: z.boolean().default(false),
  verified_at: z.string().nullable(),
  verified_by_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
})

export type Translation = z.infer<typeof translationSchema>

export const translationCreateSchema = z.object({
  namespace_id: z.string().uuid(),
  language_id: z.string().uuid(),
  key: z.string().min(1).max(255),
  value: z.string().min(1),
  description: z.string().nullable().optional(),
})

export type TranslationCreate = z.infer<typeof translationCreateSchema>

export const translationUpdateSchema = z.object({
  value: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_verified: z.boolean().optional(),
})

export type TranslationUpdate = z.infer<typeof translationUpdateSchema>

// ==================== IMPORT/EXPORT ====================

export const translationImportSchema = z.object({
  namespace_id: z.string().uuid(),
  language_id: z.string().uuid(),
  translations: z.record(z.string()),
  overwrite_existing: z.boolean().default(false),
})

export type TranslationImport = z.infer<typeof translationImportSchema>

export const translationExportSchema = z.object({
  namespace_code: z.string(),
  language_code: z.string(),
  translations: z.record(z.string()),
  total_keys: z.number(),
  verified_keys: z.number(),
})

export type TranslationExport = z.infer<typeof translationExportSchema>
