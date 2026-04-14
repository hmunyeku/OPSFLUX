/** Auth API calls — login, MFA verify, refresh. */

import { api } from "./api";
import type { LoginResponse, TokenResponse } from "../types/api";

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/api/v1/auth/login", {
    email,
    password,
  });
  return data;
}

export async function verifyMfa(
  mfaToken: string,
  code: string
): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/api/v1/auth/mfa-verify", {
    mfa_token: mfaToken,
    code,
  });
  return data;
}

export async function refreshTokens(
  refreshToken: string
): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/api/v1/auth/refresh", {
    refresh_token: refreshToken,
  });
  return data;
}
