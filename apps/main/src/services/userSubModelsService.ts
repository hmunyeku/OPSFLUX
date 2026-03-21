/**
 * API services for user sub-models (passports, visas, emergency contacts, etc.)
 */
import api from '@/lib/api'
import type {
  UserPassportRead, UserPassportCreate,
  UserVisaRead, UserVisaCreate,
  EmergencyContactRead, EmergencyContactCreate,
  SocialSecurityRead, SocialSecurityCreate,
  UserVaccineRead, UserVaccineCreate,
  UserLanguageRead, UserLanguageCreate,
  DrivingLicenseRead, DrivingLicenseCreate,
  UserSSOProviderRead, UserSSOProviderCreate,
  UserMedicalCheckRead, UserMedicalCheckCreate,
} from '@/types/api'

function crudService<TRead, TCreate>(segment: string) {
  return {
    list: async (userId: string): Promise<TRead[]> => {
      const { data } = await api.get(`/api/v1/users/${userId}/${segment}`)
      return data
    },
    create: async (userId: string, payload: TCreate): Promise<TRead> => {
      const { data } = await api.post(`/api/v1/users/${userId}/${segment}`, payload)
      return data
    },
    update: async (userId: string, itemId: string, payload: Partial<TCreate>): Promise<TRead> => {
      const { data } = await api.patch(`/api/v1/users/${userId}/${segment}/${itemId}`, payload)
      return data
    },
    remove: async (userId: string, itemId: string): Promise<void> => {
      await api.delete(`/api/v1/users/${userId}/${segment}/${itemId}`)
    },
  }
}

export const passportsService = crudService<UserPassportRead, UserPassportCreate>('passports')
export const visasService = crudService<UserVisaRead, UserVisaCreate>('visas')
export const emergencyContactsService = crudService<EmergencyContactRead, EmergencyContactCreate>('emergency-contacts')
export const socialSecuritiesService = crudService<SocialSecurityRead, SocialSecurityCreate>('social-securities')
export const vaccinesService = crudService<UserVaccineRead, UserVaccineCreate>('vaccines')
export const userLanguagesService = crudService<UserLanguageRead, UserLanguageCreate>('languages')
export const drivingLicensesService = crudService<DrivingLicenseRead, DrivingLicenseCreate>('driving-licenses')
export const medicalChecksService = crudService<UserMedicalCheckRead, UserMedicalCheckCreate>('medical-checks')
export const ssoProvidersService = crudService<UserSSOProviderRead, UserSSOProviderCreate>('sso-providers')

// Phone/Email verification
export const verificationService = {
  sendPhoneVerification: async (phoneId: string): Promise<void> => {
    await api.post(`/api/v1/phones/${phoneId}/send-verification`)
  },
  verifyPhone: async (phoneId: string, code: string): Promise<void> => {
    await api.post(`/api/v1/phones/${phoneId}/verify`, { code })
  },
  sendEmailVerification: async (emailId: string): Promise<void> => {
    await api.post(`/api/v1/contact-emails/${emailId}/send-verification`)
  },
  verifyEmail: async (emailId: string, token: string): Promise<void> => {
    await api.post(`/api/v1/contact-emails/${emailId}/verify`, { token })
  },
}

// Health conditions (toggle-based, not generic CRUD)
export const healthConditionsService = {
  list: async (userId: string): Promise<import('@/types/api').UserHealthConditionRead[]> => {
    const { data } = await api.get(`/api/v1/users/${userId}/health-conditions`)
    return data
  },
  add: async (userId: string, conditionCode: string): Promise<import('@/types/api').UserHealthConditionRead> => {
    const { data } = await api.post(`/api/v1/users/${userId}/health-conditions`, { condition_code: conditionCode })
    return data
  },
  remove: async (userId: string, conditionId: string): Promise<void> => {
    await api.delete(`/api/v1/users/${userId}/health-conditions/${conditionId}`)
  },
}

// IP geolocation
export const ipLocationService = {
  getUserLocation: async (userId: string): Promise<{ ip: string | null; location: Record<string, unknown> | null }> => {
    const { data } = await api.get(`/api/v1/users/${userId}/ip-location`)
    return data
  },
}
