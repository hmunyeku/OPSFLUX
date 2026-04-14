/**
 * Verifications API client — mirrors /api/v1/verifications on the backend.
 *
 * Each verification type has its own start/confirm pair (except location
 * which is declarative and id-document which goes to the operator queue).
 */
import { api } from "./api";

export interface UserVerification {
  id: string;
  user_id: string;
  type: "email" | "phone" | "location" | "id_document" | "biometric";
  status: "pending" | "verified" | "rejected" | "expired";
  method: string;
  verified_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  evidence: Record<string, any> | null;
  created_at: string;
}

/** List my verifications. */
export async function listMyVerifications(type?: string): Promise<UserVerification[]> {
  const { data } = await api.get<UserVerification[]>("/api/v1/verifications", {
    params: type ? { type } : {},
  });
  return data;
}

/* ── Phone ────────────────────────────────────────────────────────── */

export async function startPhoneVerification(phone_id: string, preferred_channel?: string) {
  const { data } = await api.post<UserVerification>("/api/v1/verifications/phone/start", {
    phone_id,
    preferred_channel,
  });
  return data;
}

export async function confirmPhoneVerification(verification_id: string, otp: string) {
  const { data } = await api.post<UserVerification>("/api/v1/verifications/phone/confirm", {
    verification_id,
    otp,
  });
  return data;
}

/* ── Email ────────────────────────────────────────────────────────── */

export async function startEmailVerification(email_id: string) {
  const { data } = await api.post<UserVerification>("/api/v1/verifications/email/start", {
    email_id,
  });
  return data;
}

export async function confirmEmailVerification(verification_id: string, otp: string) {
  const { data } = await api.post<UserVerification>("/api/v1/verifications/email/confirm", {
    verification_id,
    otp,
  });
  return data;
}

/* ── Location ─────────────────────────────────────────────────────── */

export async function declareLocation(coords: {
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  altitude_m?: number | null;
  source?: "gps" | "network" | "fused";
  captured_at?: string;
}) {
  const { data } = await api.post<UserVerification>("/api/v1/verifications/location", coords);
  return data;
}

/* ── ID document ──────────────────────────────────────────────────── */

export async function submitIdDocument(payload: {
  id_document_type: "passport" | "national_id" | "driver_license";
  front_attachment_id: string;
  back_attachment_id?: string;
  selfie_attachment_id: string;
  document_number?: string;
  issuing_country?: string;
}) {
  const { data } = await api.post<UserVerification>("/api/v1/verifications/id-document", payload);
  return data;
}
