/**
 * React Query hooks for user sub-models (passports, visas, emergency contacts, etc.)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  passportsService,
  visasService,
  emergencyContactsService,
  socialSecuritiesService,
  vaccinesService,
  userLanguagesService,
  drivingLicensesService,
  medicalChecksService,
  ssoProvidersService,
  verificationService,
  ipLocationService,
  healthConditionsService,
} from '@/services/userSubModelsService'
import type {
  UserPassportCreate, UserVisaCreate, EmergencyContactCreate,
  SocialSecurityCreate, UserVaccineCreate, UserLanguageCreate, DrivingLicenseCreate,
  UserSSOProviderCreate,
  UserMedicalCheckCreate,
} from '@/types/api'

// Generic hook factory
function useSubModelList(key: string, service: { list: (userId: string) => Promise<unknown[]> }, userId: string | undefined) {
  return useQuery({
    queryKey: [key, userId],
    queryFn: () => service.list(userId!),
    enabled: !!userId,
  })
}

function useSubModelCreate<T>(key: string, service: { create: (userId: string, payload: T) => Promise<unknown> }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: T }) => service.create(userId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [key, variables.userId] })
    },
  })
}

function useSubModelUpdate<T>(key: string, service: { update: (userId: string, itemId: string, payload: Partial<T>) => Promise<unknown> }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, itemId, payload }: { userId: string; itemId: string; payload: Partial<T> }) =>
      service.update(userId, itemId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [key, variables.userId] })
    },
  })
}

function useSubModelDelete(key: string, service: { remove: (userId: string, itemId: string) => Promise<void> }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, itemId }: { userId: string; itemId: string }) => service.remove(userId, itemId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [key, variables.userId] })
    },
  })
}

// ── Passports ──────────────────────────────────────────────
export const usePassports = (userId: string | undefined) => useSubModelList('user-passports', passportsService, userId)
export const useCreatePassport = () => useSubModelCreate<UserPassportCreate>('user-passports', passportsService)
export const useUpdatePassport = () => useSubModelUpdate<UserPassportCreate>('user-passports', passportsService)
export const useDeletePassport = () => useSubModelDelete('user-passports', passportsService)

// ── Visas ──────────────────────────────────────────────────
export const useVisas = (userId: string | undefined) => useSubModelList('user-visas', visasService, userId)
export const useCreateVisa = () => useSubModelCreate<UserVisaCreate>('user-visas', visasService)
export const useUpdateVisa = () => useSubModelUpdate<UserVisaCreate>('user-visas', visasService)
export const useDeleteVisa = () => useSubModelDelete('user-visas', visasService)

// ── Emergency Contacts ─────────────────────────────────────
export const useEmergencyContacts = (userId: string | undefined) => useSubModelList('user-emergency-contacts', emergencyContactsService, userId)
export const useCreateEmergencyContact = () => useSubModelCreate<EmergencyContactCreate>('user-emergency-contacts', emergencyContactsService)
export const useUpdateEmergencyContact = () => useSubModelUpdate<EmergencyContactCreate>('user-emergency-contacts', emergencyContactsService)
export const useDeleteEmergencyContact = () => useSubModelDelete('user-emergency-contacts', emergencyContactsService)

// ── Social Securities ──────────────────────────────────────
export const useSocialSecurities = (userId: string | undefined) => useSubModelList('user-social-securities', socialSecuritiesService, userId)
export const useCreateSocialSecurity = () => useSubModelCreate<SocialSecurityCreate>('user-social-securities', socialSecuritiesService)
export const useUpdateSocialSecurity = () => useSubModelUpdate<SocialSecurityCreate>('user-social-securities', socialSecuritiesService)
export const useDeleteSocialSecurity = () => useSubModelDelete('user-social-securities', socialSecuritiesService)

// ── Vaccines ───────────────────────────────────────────────
export const useVaccines = (userId: string | undefined) => useSubModelList('user-vaccines', vaccinesService, userId)
export const useCreateVaccine = () => useSubModelCreate<UserVaccineCreate>('user-vaccines', vaccinesService)
export const useUpdateVaccine = () => useSubModelUpdate<UserVaccineCreate>('user-vaccines', vaccinesService)
export const useDeleteVaccine = () => useSubModelDelete('user-vaccines', vaccinesService)

// ── Languages ──────────────────────────────────────────────
export const useUserLanguages = (userId: string | undefined) => useSubModelList('user-languages', userLanguagesService, userId)
export const useCreateUserLanguage = () => useSubModelCreate<UserLanguageCreate>('user-languages', userLanguagesService)
export const useUpdateUserLanguage = () => useSubModelUpdate<UserLanguageCreate>('user-languages', userLanguagesService)
export const useDeleteUserLanguage = () => useSubModelDelete('user-languages', userLanguagesService)

// ── Driving Licenses ───────────────────────────────────────
export const useDrivingLicenses = (userId: string | undefined) => useSubModelList('user-driving-licenses', drivingLicensesService, userId)
export const useCreateDrivingLicense = () => useSubModelCreate<DrivingLicenseCreate>('user-driving-licenses', drivingLicensesService)
export const useUpdateDrivingLicense = () => useSubModelUpdate<DrivingLicenseCreate>('user-driving-licenses', drivingLicensesService)
export const useDeleteDrivingLicense = () => useSubModelDelete('user-driving-licenses', drivingLicensesService)

// ── Medical Checks ────────────────────────────────────────
export const useMedicalChecks = (userId: string | undefined) => useSubModelList('user-medical-checks', medicalChecksService, userId)
export const useCreateMedicalCheck = () => useSubModelCreate<UserMedicalCheckCreate>('user-medical-checks', medicalChecksService)
export const useUpdateMedicalCheck = () => useSubModelUpdate<UserMedicalCheckCreate>('user-medical-checks', medicalChecksService)
export const useDeleteMedicalCheck = () => useSubModelDelete('user-medical-checks', medicalChecksService)

// ── SSO Providers ──────────────────────────────────────────
export const useSSOProviders = (userId: string | undefined) => useSubModelList('user-sso-providers', ssoProvidersService, userId)
export const useCreateSSOProvider = () => useSubModelCreate<UserSSOProviderCreate>('user-sso-providers', ssoProvidersService)
export const useDeleteSSOProvider = () => useSubModelDelete('user-sso-providers', ssoProvidersService)

// ── Phone/Email Verification ───────────────────────────────
export function useSendPhoneVerification() {
  return useMutation({
    mutationFn: (phoneId: string) => verificationService.sendPhoneVerification(phoneId),
  })
}

export function useVerifyPhone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ phoneId, code }: { phoneId: string; code: string }) => verificationService.verifyPhone(phoneId, code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['phones'] })
    },
  })
}

export function useSendEmailVerification() {
  return useMutation({
    mutationFn: (emailId: string) => verificationService.sendEmailVerification(emailId),
  })
}

export function useVerifyEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ emailId, token }: { emailId: string; token: string }) => verificationService.verifyEmail(emailId, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-emails'] })
    },
  })
}

// ── Health Conditions ─────────────────────────────────────
export function useHealthConditions(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-health-conditions', userId],
    queryFn: () => healthConditionsService.list(userId!),
    enabled: !!userId,
  })
}

export function useAddHealthCondition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, conditionCode }: { userId: string; conditionCode: string }) =>
      healthConditionsService.add(userId, conditionCode),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['user-health-conditions', variables.userId] })
    },
  })
}

export function useRemoveHealthCondition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, conditionId }: { userId: string; conditionId: string }) =>
      healthConditionsService.remove(userId, conditionId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['user-health-conditions', variables.userId] })
    },
  })
}

// ── IP Geolocation ─────────────────────────────────────────
export function useUserIPLocation(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-ip-location', userId],
    queryFn: () => ipLocationService.getUserLocation(userId!),
    enabled: !!userId,
  })
}
