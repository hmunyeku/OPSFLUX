/**
 * API client for Third Parties module
 */

import type {
  Company,
  CompanyCreate,
  CompanyUpdate,
  CompaniesResponse,
  CompanyStats,
  Contact,
  ContactCreate,
  ContactUpdate,
  ContactsResponse,
  ContactInvitation,
  ContactInvitationCreate,
  ContactInvitationsResponse,
  ContactInvitationAccept,
  ContactInvitationVerify2FA,
  CompanyType,
  CompanyStatus,
  ContactStatus,
  ContactRole,
  InvitationStatus,
} from "@/types/third-parties"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ==================== COMPANIES ====================

export async function getCompanies(
  token: string,
  params?: {
    skip?: number
    limit?: number
    search?: string
    company_type?: CompanyType
    status?: CompanyStatus
    country?: string
    tags?: string
  }
): Promise<CompaniesResponse> {
  const queryParams = new URLSearchParams()
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString())
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString())
  if (params?.search) queryParams.append("search", params.search)
  if (params?.company_type) queryParams.append("company_type", params.company_type)
  if (params?.status) queryParams.append("status", params.status)
  if (params?.country) queryParams.append("country", params.country)
  if (params?.tags) queryParams.append("tags", params.tags)

  const response = await fetch(
    `${API_URL}/api/v1/third-parties/companies?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to fetch companies")
  }

  return response.json()
}

export async function getCompany(token: string, id: string): Promise<Company> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/companies/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch company")
  }

  return response.json()
}

export async function createCompany(
  token: string,
  data: CompanyCreate
): Promise<Company> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/companies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to create company")
  }

  return response.json()
}

export async function updateCompany(
  token: string,
  id: string,
  data: CompanyUpdate
): Promise<Company> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/companies/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to update company")
  }

  return response.json()
}

export async function deleteCompany(token: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/companies/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to delete company")
  }
}

export async function getCompanyStats(token: string): Promise<CompanyStats> {
  const response = await fetch(
    `${API_URL}/api/v1/third-parties/companies/stats/summary`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to fetch company stats")
  }

  return response.json()
}

// ==================== CONTACTS ====================

export async function getContacts(
  token: string,
  params?: {
    skip?: number
    limit?: number
    company_id?: string
    search?: string
    status?: ContactStatus
    role?: ContactRole
  }
): Promise<ContactsResponse> {
  const queryParams = new URLSearchParams()
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString())
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString())
  if (params?.company_id) queryParams.append("company_id", params.company_id)
  if (params?.search) queryParams.append("search", params.search)
  if (params?.status) queryParams.append("status", params.status)
  if (params?.role) queryParams.append("role", params.role)

  const response = await fetch(
    `${API_URL}/api/v1/third-parties/contacts?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to fetch contacts")
  }

  return response.json()
}

export async function getContact(token: string, id: string): Promise<Contact> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/contacts/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch contact")
  }

  return response.json()
}

export async function createContact(
  token: string,
  data: ContactCreate
): Promise<Contact> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to create contact")
  }

  return response.json()
}

export async function updateContact(
  token: string,
  id: string,
  data: ContactUpdate
): Promise<Contact> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/contacts/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to update contact")
  }

  return response.json()
}

export async function deleteContact(token: string, id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/contacts/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to delete contact")
  }
}

// ==================== INVITATIONS ====================

export async function getInvitations(
  token: string,
  params?: {
    skip?: number
    limit?: number
    status?: InvitationStatus
    contact_id?: string
  }
): Promise<ContactInvitationsResponse> {
  const queryParams = new URLSearchParams()
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString())
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString())
  if (params?.status) queryParams.append("status", params.status)
  if (params?.contact_id) queryParams.append("contact_id", params.contact_id)

  const response = await fetch(
    `${API_URL}/api/v1/third-parties/invitations?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    throw new Error("Failed to fetch invitations")
  }

  return response.json()
}

export async function createInvitation(
  token: string,
  data: ContactInvitationCreate
): Promise<ContactInvitation> {
  const response = await fetch(`${API_URL}/api/v1/third-parties/invitations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to create invitation")
  }

  return response.json()
}

export async function revokeInvitation(
  token: string,
  id: string,
  reason?: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/v1/third-parties/invitations/${id}/revoke`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to revoke invitation")
  }
}

export async function acceptInvitation(
  data: ContactInvitationAccept
): Promise<{ message: string; temp_token?: string }> {
  const response = await fetch(
    `${API_URL}/api/v1/third-parties/invitations/${data.token}/accept`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to accept invitation")
  }

  return response.json()
}

export async function verifyInvitation2FA(
  data: ContactInvitationVerify2FA
): Promise<{ access_token: string }> {
  const response = await fetch(
    `${API_URL}/api/v1/third-parties/invitations/${data.token}/verify-2fa`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || "Failed to verify 2FA")
  }

  return response.json()
}
