/**
 * API client for Third Parties module
 */

import type {
  Company,
  CompanyCreate,
  CompanyUpdate,
  Contact,
  ContactCreate,
  ContactUpdate,
  ContactInvitation,
  ContactInvitationCreate,
  CompanyType,
  CompanyStatus,
  ContactStatus,
  ContactRole,
  InvitationStatus,
} from "../types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// Companies
export async function getCompanies(token: string, params?: any) {
  const queryParams = new URLSearchParams()
  if (params?.skip) queryParams.append("skip", params.skip.toString())
  if (params?.limit) queryParams.append("limit", params.limit.toString())
  if (params?.search) queryParams.append("search", params.search)
  if (params?.company_type) queryParams.append("company_type", params.company_type)
  if (params?.status) queryParams.append("status", params.status)

  const response = await fetch(
    `${API_URL}/api/v1/third-parties/companies?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) throw new Error("Failed to fetch companies")
  return response.json()
}

export async function getCompany(token: string, id: string) {
  const response = await fetch(`${API_URL}/api/v1/third-parties/companies/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) throw new Error("Failed to fetch company")
  return response.json()
}

export async function createCompany(token: string, data: CompanyCreate) {
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

export async function updateCompany(token: string, id: string, data: CompanyUpdate) {
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

export async function deleteCompany(token: string, id: string) {
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

export async function getCompanyStats(token: string) {
  const response = await fetch(
    `${API_URL}/api/v1/third-parties/companies/stats/summary`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) throw new Error("Failed to fetch stats")
  return response.json()
}

// Contacts
export async function getContacts(token: string, params?: any) {
  const queryParams = new URLSearchParams()
  if (params?.skip) queryParams.append("skip", params.skip.toString())
  if (params?.limit) queryParams.append("limit", params.limit.toString())
  if (params?.company_id) queryParams.append("company_id", params.company_id)
  if (params?.search) queryParams.append("search", params.search)

  const response = await fetch(
    `${API_URL}/api/v1/third-parties/contacts?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) throw new Error("Failed to fetch contacts")
  return response.json()
}

export async function createContact(token: string, data: ContactCreate) {
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

// Invitations
export async function createInvitation(token: string, data: ContactInvitationCreate) {
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
