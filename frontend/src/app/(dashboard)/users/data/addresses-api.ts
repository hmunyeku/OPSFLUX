import { apiClient } from "@/lib/api-client"

export interface AddressType {
  id: string
  code: string
  name: string
  description?: string
  icon?: string
  color?: string
  is_active: boolean
}

export interface Address {
  id: string
  address_type_id: string
  label?: string
  street_line1: string
  street_line2?: string
  city: string
  state?: string
  postal_code: string
  country: string
  latitude?: number
  longitude?: number
  place_id?: string
  formatted_address?: string
  phone?: string
  email?: string
  notes?: string
  is_default: boolean
  entity_type: string
  entity_id: string
}

export interface AddressCreate {
  address_type_id: string
  entity_type: string
  entity_id: string
  label?: string
  street_line1: string
  street_line2?: string
  city: string
  state?: string
  postal_code: string
  country: string
  latitude?: number
  longitude?: number
  place_id?: string
  formatted_address?: string
  phone?: string
  email?: string
  notes?: string
  is_default?: boolean
  is_active?: boolean
}

export async function getAddressTypes(): Promise<AddressType[]> {
  const response = await apiClient.get("/api/v1/address-types/", {
    params: {
      active_only: true,
      limit: 100,
    },
  })
  return response.data.data
}

export async function getUserAddresses(userId: string): Promise<Address[]> {
  const response = await apiClient.get("/api/v1/addresses/", {
    params: {
      entity_type: "user",
      entity_id: userId,
    },
  })
  return response.data.data
}

export async function createAddress(address: AddressCreate): Promise<Address> {
  const response = await apiClient.post("/api/v1/addresses/", address)
  return response.data
}

export async function updateAddress(id: string, address: Partial<AddressCreate>): Promise<Address> {
  const response = await apiClient.patch(`/api/v1/addresses/${id}`, address)
  return response.data
}

export async function deleteAddress(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/addresses/${id}`)
}
