import type {
  Language,
  LanguageCreate,
  TranslationNamespace,
  NamespaceCreate,
  Translation,
  TranslationCreate,
  TranslationUpdate,
  TranslationImport,
  TranslationExport,
} from "./schema"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ==================== LANGUAGES ====================

export async function getLanguages(params?: {
  skip?: number
  limit?: number
  is_active?: boolean
}): Promise<{ data: Language[]; count: number }> {
  const queryParams = new URLSearchParams()
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString())
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString())
  if (params?.is_active !== undefined) queryParams.append("is_active", params.is_active.toString())

  const response = await fetch(`${API_BASE}/api/v1/languages/?${queryParams}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch languages")
  }

  return response.json()
}

export async function createLanguage(data: LanguageCreate): Promise<Language> {
  const response = await fetch(`${API_BASE}/api/v1/languages/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to create language")
  }

  return response.json()
}

export async function updateLanguage(id: string, data: Partial<LanguageCreate>): Promise<Language> {
  const response = await fetch(`${API_BASE}/api/v1/languages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to update language")
  }

  return response.json()
}

export async function deleteLanguage(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/languages/${id}`, {
    method: "DELETE",
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to delete language")
  }
}

// ==================== NAMESPACES ====================

export async function getNamespaces(params?: {
  namespace_type?: string
  module_id?: string
}): Promise<TranslationNamespace[]> {
  const queryParams = new URLSearchParams()
  if (params?.namespace_type) queryParams.append("namespace_type", params.namespace_type)
  if (params?.module_id) queryParams.append("module_id", params.module_id)

  const response = await fetch(`${API_BASE}/api/v1/languages/namespaces/?${queryParams}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch namespaces")
  }

  return response.json()
}

export async function createNamespace(data: NamespaceCreate): Promise<TranslationNamespace> {
  const response = await fetch(`${API_BASE}/api/v1/languages/namespaces/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to create namespace")
  }

  return response.json()
}

// ==================== TRANSLATIONS ====================

export async function getTranslations(params?: {
  skip?: number
  limit?: number
  namespace_id?: string
  language_id?: string
  key?: string
  is_verified?: boolean
}): Promise<{ data: Translation[]; count: number }> {
  const queryParams = new URLSearchParams()
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString())
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString())
  if (params?.namespace_id) queryParams.append("namespace_id", params.namespace_id)
  if (params?.language_id) queryParams.append("language_id", params.language_id)
  if (params?.key) queryParams.append("key", params.key)
  if (params?.is_verified !== undefined) queryParams.append("is_verified", params.is_verified.toString())

  const response = await fetch(`${API_BASE}/api/v1/languages/translations/?${queryParams}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch translations")
  }

  return response.json()
}

export async function createTranslation(data: TranslationCreate): Promise<Translation> {
  const response = await fetch(`${API_BASE}/api/v1/languages/translations/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to create translation")
  }

  return response.json()
}

export async function updateTranslation(id: string, data: TranslationUpdate): Promise<Translation> {
  const response = await fetch(`${API_BASE}/api/v1/languages/translations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to update translation")
  }

  return response.json()
}

export async function deleteTranslation(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/languages/translations/${id}`, {
    method: "DELETE",
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to delete translation")
  }
}

// ==================== IMPORT/EXPORT ====================

export async function importTranslations(data: TranslationImport): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE}/api/v1/languages/translations/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to import translations")
  }

  return response.json()
}

export async function exportTranslations(params: {
  namespace_id?: string
  language_id?: string
  namespace_code?: string
  language_code?: string
}): Promise<TranslationExport> {
  const queryParams = new URLSearchParams()
  if (params.namespace_id) queryParams.append("namespace_id", params.namespace_id)
  if (params.language_id) queryParams.append("language_id", params.language_id)
  if (params.namespace_code) queryParams.append("namespace_code", params.namespace_code)
  if (params.language_code) queryParams.append("language_code", params.language_code)

  const response = await fetch(`${API_BASE}/api/v1/languages/translations/export?${queryParams}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to export translations")
  }

  return response.json()
}
