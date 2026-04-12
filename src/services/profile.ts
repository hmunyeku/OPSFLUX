/** Profile & phone verification API calls. */

import { api } from "./api";

export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  default_entity_id: string;
  mfa_enabled: boolean;
}

export interface PhoneEntry {
  id: string;
  number: string;
  label: string | null;
  verified: boolean;
  is_primary: boolean;
}

/** Get current user profile. */
export async function getProfile(): Promise<UserProfile> {
  const { data } = await api.get<UserProfile>("/api/v1/users/me");
  return data;
}

/** Update current user profile. */
export async function updateProfile(
  body: Partial<Pick<UserProfile, "first_name" | "last_name" | "phone">>
): Promise<UserProfile> {
  const { data } = await api.patch<UserProfile>("/api/v1/users/me", body);
  return data;
}

/** List user's phone numbers. */
export async function listPhones(): Promise<PhoneEntry[]> {
  const { data } = await api.get<PhoneEntry[]>("/api/v1/phones");
  return data;
}

/** Request OTP verification code for a phone number. */
export async function sendPhoneOtp(
  phoneId: string,
  channel: "sms" | "whatsapp" = "sms"
): Promise<{ message: string }> {
  const { data } = await api.post(`/api/v1/phones/${phoneId}/send-verification`, {
    channel,
  });
  return data;
}

/** Verify phone with OTP code. */
export async function verifyPhoneOtp(
  phoneId: string,
  code: string
): Promise<{ message: string }> {
  const { data } = await api.post(`/api/v1/phones/${phoneId}/verify`, {
    code,
  });
  return data;
}
